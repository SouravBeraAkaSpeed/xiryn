import {
  convertToModelMessages,
  hasToolCall,
  isStepCount,
  streamText,
  toUIMessageStream,
  type LanguageModelUsage,
  type ModelMessage,
  type ToolSet,
  type UIMessageChunk,
} from "ai"
import { asc, eq } from "drizzle-orm"
import { nanoid } from "nanoid"

import { db } from "@/db"
import {
  messages,
  squadMembers,
  threads,
  turns,
  type Agent,
  type Squad,
} from "@/db/schema"
import { buildInstructions, type Capabilities } from "@/lib/agent/instructions"
import {
  createDelegateTool,
  createMemoryTools,
  createRoutineTools,
  createWebTools,
  createVaultTools,
  createWorkstationTools,
  isDesktopAction,
  type XirynMessage,
  type ToolEnv,
} from "@/lib/agent/tools"
import { getMaxSteps } from "@/lib/config"
import { emit, previewText } from "@/lib/events"
import { prepareLocalModel } from "@/lib/ollama"
import { parseModelSpec } from "@/lib/providers/catalog"
import { callCost, findPrice, toMicros } from "@/lib/providers/pricing"
import { createModel, resolveModelSpec } from "@/lib/providers/registry"
import { budgetBlock, getCustomPrices } from "@/lib/spend"
import { isWebConfigured } from "@/lib/web"
import { isWorkstationConfigured } from "@/lib/workstation"

/* ───────────────────────────── runs ───────────────────────────────
 * A run is one agent turn executing inside this process. Its output is
 * buffered so the browser can drop and re-attach (refresh, closed tab)
 * without the turn noticing. Runs are kept in memory: they survive the
 * tab, not a server restart.
 * ────────────────────────────────────────────────────────────────── */

type Run = {
  id: string
  threadId: string
  chunks: UIMessageChunk[]
  listeners: Set<ReadableStreamDefaultController<UIMessageChunk>>
  done: boolean
  controller: AbortController
  startedAt: number
}

const globalForRuns = globalThis as unknown as { __xirynRuns?: Map<string, Run> }
const runs = (globalForRuns.__xirynRuns ??= new Map<string, Run>())

export function getActiveRun(threadId: string) {
  const run = runs.get(threadId)
  return run && !run.done ? run : undefined
}

export function activeThreadIds() {
  return [...runs.values()].filter((run) => !run.done).map((run) => run.threadId)
}

// Replays what the run has produced so far, then follows it live
export function subscribe(run: Run) {
  let self: ReadableStreamDefaultController<UIMessageChunk>
  return new ReadableStream<UIMessageChunk>({
    start(controller) {
      self = controller
      for (const chunk of run.chunks) controller.enqueue(chunk)
      if (run.done) controller.close()
      else run.listeners.add(controller)
    },
    cancel() {
      // The reader left; the run carries on
      run.listeners.delete(self)
    },
  })
}

export function stopRun(threadId: string) {
  const run = getActiveRun(threadId)
  if (!run) return false
  run.controller.abort()
  return true
}

function publish(run: Run, chunk: UIMessageChunk) {
  run.chunks.push(chunk)
  for (const listener of run.listeners) {
    try {
      listener.enqueue(chunk)
    } catch {
      run.listeners.delete(listener)
    }
  }
}

function finish(run: Run) {
  run.done = true
  for (const listener of run.listeners) {
    try {
      listener.close()
    } catch {}
  }
  run.listeners.clear()
  // Late reconnects get a 204 and read the saved message instead
  setTimeout(() => {
    if (runs.get(run.threadId) === run) runs.delete(run.threadId)
  }, 30_000)
}

/* ──────────────────────────── loading ──────────────────────────── */

export class TurnError extends Error {
  constructor(
    message: string,
    public status = 400
  ) {
    super(message)
    this.name = "TurnError"
  }
}

function loadThread(threadId: string) {
  const thread = db.query.threads
    .findFirst({
      where: eq(threads.id, threadId),
      with: {
        agent: true,
        squad: {
          with: {
            members: { orderBy: [asc(squadMembers.position)], with: { agent: true } },
          },
        },
      },
    })
    .sync()
  if (!thread) throw new TurnError("Thread not found", 404)
  return thread
}

export function loadMessages(threadId: string) {
  const rows = db
    .select()
    .from(messages)
    .where(eq(messages.threadId, threadId))
    .orderBy(asc(messages.createdAt))
    .all()
  return rows.map(
    (row) =>
      ({
        id: row.id,
        role: row.role,
        parts: row.parts,
        metadata: row.metadata ?? undefined,
      }) as XirynMessage
  )
}

function saveMessage(threadId: string, message: XirynMessage, createdAt = new Date()) {
  db.insert(messages)
    .values({
      id: message.id,
      threadId,
      role: message.role,
      parts: message.parts,
      metadata: message.metadata ?? null,
      createdAt,
    })
    .onConflictDoUpdate({
      target: messages.id,
      set: { parts: message.parts, metadata: message.metadata ?? null },
    })
    .run()
}

function textOf(message: XirynMessage) {
  return message.parts
    .flatMap((part) => (part.type === "text" ? [part.text] : []))
    .join(" ")
    .replace(/\s+/g, " ")
    .trim()
}

// Added to the instructions for the last step a turn is allowed
const LAST_STEP = `

# Step limit reached
This is your last step in this turn, and your tools are switched off. Tell the person what you have found or done so far, with the concrete details (names, times, prices, links, file paths), and what is still left. They can reply to have you carry on.`

// Screenshots are heavy. Only the most recent few go back to the model.
const SCREENS_IN_CONTEXT = 2

type Part = XirynMessage["parts"][number]

// Tool results that carry a screenshot: looks, and every desktop action
function hasScreen(part: Part): part is Part & { output: { image: string | null } } {
  if (!part.type.startsWith("tool-") || !("state" in part)) return false
  if (part.state !== "output-available") return false
  const output = (part as { output?: unknown }).output
  return typeof output === "object" && output !== null && "image" in output
}

// Keeps the image of the newest `keep` screenshots, newest first
function keepNewestScreens(parts: Part[], keep: number, counter = { kept: 0 }) {
  return parts
    .slice()
    .reverse()
    .map((part) => {
      if (!hasScreen(part) || !part.output.image) return part
      if (counter.kept < keep) {
        counter.kept++
        return part
      }
      return { ...part, output: { ...part.output, image: null } } as Part
    })
    .reverse()
}

function pruneScreens(history: XirynMessage[]) {
  const counter = { kept: 0 }
  return history
    .slice()
    .reverse()
    .map((message) =>
      message.role === "assistant"
        ? ({
            ...message,
            parts: keepNewestScreens(message.parts, SCREENS_IN_CONTEXT, counter),
          } as XirynMessage)
        : message
    )
    .reverse()
}

// A routine's message is shown as the plain task, but the model reads it as
// what it is: a run that's due now, to be done and answered with the result
function frameRoutineRuns(history: XirynMessage[]) {
  return history.map((message) => {
    const routine = message.role === "user" ? message.metadata?.routine : undefined
    if (!routine) return message
    return {
      ...message,
      parts: message.parts.map((part) =>
        part.type === "text"
          ? {
              ...part,
              text: `[Scheduled run of the routine "${routine.name}", due now. Do this task right now and reply with the result itself; don't schedule anything or promise it for later.]

${part.text}`,
            }
          : part
      ),
    } as XirynMessage
  })
}

// Desktop actions each return a screenshot. Saving all of them would grow
// the database by megabytes per task, so a saved reply keeps the images of
// what the agent chose to show or look at, plus the latest action's.
function trimActionScreens(reply: XirynMessage): XirynMessage {
  let latestAction = true
  const parts = reply.parts
    .slice()
    .reverse()
    .map((part) => {
      if (!hasScreen(part) || !isDesktopAction(part.type.slice("tool-".length))) {
        return part
      }
      if (latestAction) {
        latestAction = false
        return part
      }
      return { ...part, output: { ...part.output, image: null } } as Part
    })
    .reverse()
  return { ...reply, parts }
}

/* ─────────────────────── context compaction ─────────────────────
 * Every step of a tool loop resends the whole conversation. A desktop
 * task can take dozens of steps, each adding a screenshot or a fetched
 * page, so without care the input grows quadratically. Before each step
 * only the newest screenshots stay as images and only the newest tool
 * outputs stay whole; older ones shrink to a short stub.
 * ────────────────────────────────────────────────────────────────── */

const IMAGES_KEPT = 2
const OUTPUTS_KEPT = 6
const STUB_CHARS = 600

type ToolOutput = { type: string; value?: unknown }

function shrink(output: ToolOutput, keepImage: boolean, keepFull: boolean): ToolOutput {
  if (output.type === "content" && Array.isArray(output.value)) {
    if (keepImage) return output
    const text = (output.value as { type: string; text?: string }[])
      .filter((part) => part.type === "text")
      .map((part) => part.text)
      .join(" ")
    return { type: "text", value: `${text} [earlier screenshot omitted]`.trim() }
  }
  if (keepFull) return output
  const raw =
    typeof output.value === "string" ? output.value : JSON.stringify(output.value ?? "")
  if (raw.length <= STUB_CHARS) return output
  return {
    type: "text",
    value: `${raw.slice(0, STUB_CHARS)}… [${raw.length - STUB_CHARS} more characters of an earlier result trimmed]`,
  }
}

function compactContext(input: ModelMessage[]): ModelMessage[] {
  let images = 0
  let outputs = 0
  return input
    .slice()
    .reverse()
    .map((message) => {
      if (message.role !== "tool") return message
      const content = message.content
        .slice()
        .reverse()
        .map((part) => {
          if (part.type !== "tool-result") return part
          const output = part.output as ToolOutput
          const isImage = output.type === "content"
          const keepImage = isImage && images < IMAGES_KEPT
          const keepFull = outputs < OUTPUTS_KEPT
          if (isImage) images++
          outputs++
          return {
            ...part,
            output: shrink(output, keepImage, keepFull) as typeof part.output,
          }
        })
        .reverse()
      return { ...message, content }
    })
    .reverse()
}

/* ───────────────────────────── turns ───────────────────────────── */

export async function startTurn({
  threadId,
  message,
  agentId,
  channel = "web",
  routine,
}: {
  threadId: string
  message: XirynMessage
  agentId?: string
  channel?: "web" | "telegram"
  routine?: { id: string; name: string }
}) {
  if (getActiveRun(threadId)) {
    throw new TurnError("An agent is already working in this thread.", 409)
  }

  const thread = loadThread(threadId)
  const members: Agent[] = thread.squad
    ? thread.squad.members.map((member) => member.agent)
    : thread.agent
      ? [thread.agent]
      : []
  const first = members.find((member) => member.id === agentId) ?? members[0]
  if (!first) throw new TurnError("This thread has no agents left in it.", 410)

  const capabilities: Capabilities = {
    workstation: isWorkstationConfigured(),
    web: isWebConfigured(),
    channel,
    routine: routine?.name,
  }

  // Fail before anything is saved when the model can't be reached
  const specFor = (agent: Agent) => {
    const spec = resolveModelSpec(agent.model)
    if (!spec) {
      throw new TurnError(
        "No model is configured. Add a provider key to .env or open Settings → Providers."
      )
    }
    return spec
  }
  const firstSpec = specFor(first)
  // A monthly budget holds turns on paid models once it's spent
  const blocked = budgetBlock(firstSpec)
  if (blocked) throw new TurnError(blocked, 402)
  // Local models get a context their instructions fit in (once per model)
  await Promise.all(
    [...new Set(members.map((member) => resolveModelSpec(member.model)))].flatMap(
      (spec) => {
        const parsed = spec ? parseModelSpec(spec) : null
        return parsed?.provider === "ollama" ? [prepareLocalModel(parsed.model)] : []
      }
    )
  )
  const firstModel = (() => {
    try {
      return createModel(firstSpec, { sessionId: threadId })
    } catch (error) {
      throw new TurnError(error instanceof Error ? error.message : String(error))
    }
  })()

  // The person's message is on disk before the agent starts
  const userMessage: XirynMessage = {
    ...message,
    role: "user",
    metadata: {
      ...(thread.squad && { agentId: first.id }),
      ...(channel === "telegram" && { via: "telegram" as const }),
      ...(routine && { routine }),
      ...(message.metadata?.handback && { handback: message.metadata.handback }),
      ...(message.metadata?.vault && { vault: message.metadata.vault }),
    },
  }
  saveMessage(threadId, userMessage)
  const prompt = textOf(userMessage)
  db.update(threads)
    .set({
      title: thread.title ?? (prompt.slice(0, 80) || "Untitled"),
      preview: prompt.slice(0, 140),
      activeAt: new Date(),
    })
    .where(eq(threads.id, threadId))
    .run()

  const history = loadMessages(threadId)

  /* Delegation: whoever holds the turn owns the tools and the prompt */
  let current = first
  const held = [first.id]
  let brief: string | undefined
  // Where this thread lives in the app, for notifications
  const href = thread.squadId
    ? `/s/${thread.squadId}/${threadId}`
    : `/a/${first.id}/${threadId}`
  const attention = (
    type: "takeover" | "payment" | "secret",
    agent: Agent,
    reason: string
  ) =>
    emit({
      type,
      threadId,
      href,
      name: agent.name,
      glyph: agent.glyph,
      via: channel,
      reason,
    })
  // Loaded lazily: the bridge itself depends on this module
  const bridge = () => import("@/lib/telegram/bridge")
  const telegramFailed = (error: unknown) =>
    console.error("[xiryn] telegram: notice failed:", error)

  const env: ToolEnv = {
    current: () => current,
    threadId,
    onTakeoverRequested: async (agent, reason) => {
      attention("takeover", agent, reason)
      const { notifyTakeover } = await bridge()
      await notifyTakeover({ agent, threadId, squadId: thread.squadId, reason }).catch(
        telegramFailed
      )
    },
    onApprovalRequested: async (agent, approval, methods) => {
      attention(
        "payment",
        agent,
        `Wants to pay ${approval.amount} to ${approval.merchant}: ${approval.purpose ?? ""}`.trim()
      )
      const { notifyPayment } = await bridge()
      await notifyPayment({ agent, squadId: thread.squadId, approval, methods }).catch(
        telegramFailed
      )
    },
    onSecretRequested: async (agent, request) => {
      attention("secret", agent, request.reason)
      const { notifySecret } = await bridge()
      await notifySecret({ agent, threadId, squadId: thread.squadId, request }).catch(
        telegramFailed
      )
    },
  }

  const squadContext = (agent: Agent) =>
    thread.squad
      ? {
          squad: thread.squad as Squad,
          members,
          delegatedFrom: held.filter((id) => id !== agent.id),
          brief,
        }
      : undefined

  const tools: ToolSet = {
    ...(capabilities.workstation
      ? { ...createWorkstationTools(env), ...createVaultTools(env) }
      : {}),
    ...createMemoryTools(env),
    ...(capabilities.web ? createWebTools() : {}),
    // A routine's own runs don't schedule more routines
    ...(routine ? {} : createRoutineTools(env)),
    ...(thread.squad
      ? createDelegateTool((targetId, handoverBrief) => {
          const target = members.find((member) => member.id === targetId)
          if (!target) throw new Error("No agent in this squad has that id.")
          if (held.includes(target.id)) {
            throw new Error(
              `${target.name} already had this request. Handle it yourself.`
            )
          }
          // Validate the target's model now, so a broken config fails the call
          createModel(specFor(target), { sessionId: threadId })
          current = target
          held.push(target.id)
          brief = handoverBrief
          return { agentId: target.id, name: target.name }
        })
      : {}),
  }

  const run: Run = {
    id: nanoid(),
    threadId,
    chunks: [],
    listeners: new Set(),
    done: false,
    controller: new AbortController(),
    startedAt: Date.now(),
  }
  runs.set(threadId, run)
  emit({
    type: "turn-started",
    threadId,
    href,
    name: first.name,
    glyph: first.glyph,
    via: channel,
  })

  // Accumulated across steps so stopped and failed turns are still metered
  const usage = { input: 0, output: 0, reasoning: 0, cached: 0, steps: 0, toolCalls: 0 }
  // Priced call by call, at the rate of whichever model made the call: a
  // squad can hand the turn to an agent on another model. Null once any
  // call ran on a model without a known price.
  const customPrices = getCustomPrices()
  let activeSpec = firstSpec
  let cost: number | null = 0
  const addUsage = (step: LanguageModelUsage) => {
    const call = {
      input: step.inputTokens ?? 0,
      output: step.outputTokens ?? 0,
      cached: step.inputTokenDetails?.cacheReadTokens ?? 0,
    }
    usage.input += call.input
    usage.output += call.output
    usage.reasoning += step.outputTokenDetails?.reasoningTokens ?? 0
    usage.cached += call.cached
    const callUsd = callCost(findPrice(activeSpec, { custom: customPrices }), call)
    cost = cost === null || callUsd === null ? null : cost + callUsd
  }
  let failure: string | null = null
  let appliedAgentId = first.id
  const maxSteps = getMaxSteps()

  try {
    const result = streamText({
      model: firstModel,
      instructions: buildInstructions(first, capabilities, squadContext(first)),
      messages: await convertToModelMessages(pruneScreens(frameRoutineRuns(history)), {
        tools,
        ignoreIncompleteToolCalls: true,
      }),
      tools,
      // The turn also ends when the agent needs the person: its screen,
      // a payment decision or a detail only they have
      stopWhen: [
        isStepCount(maxSteps),
        hasToolCall("request_takeover"),
        hasToolCall("request_payment_approval"),
        hasToolCall("request_secret"),
      ],
      abortSignal: run.controller.signal,
      prepareStep: ({ messages: stepMessages, stepNumber }) => {
        // Long tool loops resend everything each step; keep it lean
        const compacted = compactContext(stepMessages)
        // The last step answers instead of acting, so a long task always
        // ends with what was found and what's left
        const lastStep = stepNumber === maxSteps - 1
        const delegated = current.id !== appliedAgentId
        if (!delegated && !lastStep) return { messages: compacted }
        appliedAgentId = current.id
        if (delegated) activeSpec = specFor(current)
        return {
          messages: compacted,
          // After a delegation the next step runs as the new agent, on its model
          ...(delegated && {
            model: createModel(specFor(current), { sessionId: threadId }),
          }),
          instructions:
            buildInstructions(current, capabilities, squadContext(current)) +
            (lastStep ? LAST_STEP : ""),
          ...(lastStep && { toolChoice: "none" as const }),
        }
      },
      // Counted per model call, so a turn stopped mid-tool is still metered
      onLanguageModelCallEnd: (call) => addUsage(call.usage),
      onStepEnd: (step) => {
        usage.steps++
        usage.toolCalls += step.toolCalls.length
      },
      onError: ({ error }) => {
        failure = describeError(error)
        console.error(`[xiryn] turn failed in thread ${threadId}:`, error)
      },
    })

    const stream = toUIMessageStream<ToolSet, XirynMessage>({
      stream: result.stream,
      originalMessages: history,
      generateMessageId: () => nanoid(),
      messageMetadata: ({ part }) => {
        if (part.type === "start") return { agentId: first.id, model: firstSpec }
        if (part.type === "finish") {
          return {
            agentId: first.id,
            model: firstSpec,
            usage: { input: usage.input, output: usage.output, cached: usage.cached },
            cost,
            durationMs: Date.now() - run.startedAt,
          }
        }
        return undefined
      },
      onError: (error) => describeError(error),
      onEnd: ({ responseMessage, isAborted }) => {
        const durationMs = Date.now() - run.startedAt
        const reply = {
          ...responseMessage,
          metadata: {
            ...responseMessage.metadata,
            agentId: first.id,
            model: firstSpec,
            usage: { input: usage.input, output: usage.output, cached: usage.cached },
            cost,
            durationMs,
          },
        } as XirynMessage

        if (reply.parts.length > 0) saveMessage(threadId, trimActionScreens(reply))

        const preview = textOf(reply)
        db.update(threads)
          .set({
            activeAt: new Date(),
            ...(preview && { preview: preview.slice(0, 140) }),
          })
          .where(eq(threads.id, threadId))
          .run()

        db.insert(turns)
          .values({
            threadId,
            agentId: first.id,
            model: firstSpec,
            inputTokens: usage.input,
            outputTokens: usage.output,
            reasoningTokens: usage.reasoning,
            cachedTokens: usage.cached,
            steps: usage.steps,
            toolCalls: usage.toolCalls,
            durationMs,
            costMicros: cost === null ? null : toMicros(cost),
            status: failure ? "failed" : isAborted ? "stopped" : "completed",
            error: failure,
          })
          .run()

        // Tell the person, wherever they are. Stopping a turn yourself needs
        // no news, and a hand-off has already sent its own.
        const handedOver = reply.parts.some((part) =>
          [
            "tool-request_takeover",
            "tool-request_payment_approval",
            "tool-request_secret",
          ].includes(part.type)
        )
        if (!isAborted && !handedOver) {
          emit({
            type: "turn-finished",
            threadId,
            href,
            name: current.name,
            glyph: current.glyph,
            via: channel,
            preview: previewText(
              reply.parts
                .flatMap((part) => (part.type === "text" ? [part.text] : []))
                .join("\n\n")
            ),
            ok: !failure,
            ...(failure && { error: failure }),
            durationMs,
            model: firstSpec,
          })
          if (channel !== "telegram") {
            import("@/lib/telegram/bridge")
              .then(({ notifyFinished }) =>
                notifyFinished({
                  name: current.name,
                  agentId: current.id,
                  squadId: thread.squadId,
                  threadId,
                  // Line breaks kept, so tables and lists format on Telegram
                  reply: reply.parts
                    .flatMap((part) => (part.type === "text" ? [part.text] : []))
                    .join("\n\n")
                    .trim(),
                  error: failure,
                  durationMs,
                  always: !!routine,
                })
              )
              .catch((error) =>
                console.error("[xiryn] telegram: finished notice failed:", error)
              )
          }
        }
      },
    })

    // Drain the stream in the background, whoever is (or isn't) listening
    void (async () => {
      const reader = stream.getReader()
      try {
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          publish(run, value)
        }
      } catch (error) {
        publish(run, { type: "error", errorText: describeError(error) })
      } finally {
        finish(run)
      }
    })()
  } catch (error) {
    finish(run)
    throw error
  }

  return run
}

function describeError(error: unknown): string {
  if (error instanceof Error) {
    const cause = (error as { responseBody?: string }).responseBody
    if (cause) {
      try {
        const parsed = JSON.parse(cause)
        const detail = parsed?.error?.message ?? parsed?.message
        if (typeof detail === "string") return `${error.message} — ${detail}`
      } catch {}
    }
    return error.message
  }
  return String(error)
}
