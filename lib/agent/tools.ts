import { tool, type InferUITools, type UIDataTypes, type UIMessage } from "ai"
import { and, asc, eq } from "drizzle-orm"
import { z } from "zod"

import { db } from "@/db"
import {
  agents,
  memories,
  routines,
  routineScheduleSchema,
  squads,
  threads,
  type Agent,
  type Routine,
} from "@/db/schema"
import { describeSchedule, nextRun } from "@/lib/schedule"
import {
  activeApproval,
  createApproval,
  getVaultItem,
  hostMatches,
  listVault,
  markVaultUsed,
  siteOf,
  VAULT_FIELDS,
  vaultValue,
  type Approval,
  type VaultItemView,
  type VaultKind,
} from "@/lib/vault"
import { webFetch, webSearch } from "@/lib/web"
import {
  captureScreen,
  click,
  currentPage,
  maskFocusedField,
  drag,
  listDirectory,
  movePointer,
  pressKey,
  readFile,
  runCommand,
  scroll,
  typeSecret,
  typeText,
  writeFile,
} from "@/lib/workstation"

// The tool belt an agent carries. Every tool acts on behalf of whichever
// agent holds the turn right now, which changes when a squad delegates.

export type SecretRequest = {
  kind: VaultKind
  reason: string
  // For a login: the site it's for
  site: string | null
  // The site the browser was on when it was asked for
  host: string | null
}

export type ToolEnv = {
  current: () => Agent
  threadId: string
  // Lets the person know, wherever they are, that the desktop is theirs
  onTakeoverRequested?: (agent: Agent, reason: string) => Promise<void> | void
  // A payment waiting for their decision
  onApprovalRequested?: (
    agent: Agent,
    approval: Approval,
    methods: VaultItemView[]
  ) => Promise<void> | void
  // A detail only they can give, through a secure form
  onSecretRequested?: (agent: Agent, request: SecretRequest) => Promise<void> | void
}

const MAX_OUTPUT = 20_000

function clip(text: string) {
  if (text.length <= MAX_OUTPUT) return text
  return `${text.slice(0, MAX_OUTPUT)}\n… ${text.length - MAX_OUTPUT} more characters truncated`
}

const coordinates = {
  x: z.number().int().min(0).describe("Pixels from the left edge of the screen"),
  y: z.number().int().min(0).describe("Pixels from the top edge of the screen"),
}

/* ──────────────────────────── screen ──────────────────────────── */

async function capture(agentId: string) {
  const shot = await captureScreen(agentId)
  // Old captures are blanked out of saved history (see pruneScreens)
  return {
    image: shot.image as string | null,
    mediaType: shot.mediaType,
    width: shot.width as number | null,
    height: shot.height as number | null,
  }
}

export type ScreenCapture = Awaited<ReturnType<typeof capture>>

// The model sees the picture itself, not its base64. Old captures are
// stripped from the history (image: null) to keep the context small.
function screenContent(output: ScreenCapture, caption: string) {
  if (!output.image) {
    return {
      type: "content" as const,
      value: [
        { type: "text" as const, text: "[Earlier screenshot omitted to save context.]" },
      ],
    }
  }
  return {
    type: "content" as const,
    value: [
      {
        type: "text" as const,
        text: `${caption} Screenshot of the ${output.width}×${output.height} display; coordinates are pixels from the top-left corner.`,
      },
      {
        type: "file" as const,
        mediaType: output.mediaType,
        data: { type: "data" as const, data: output.image },
      },
    ],
  }
}

function screenToModel({ output }: { output: ScreenCapture }) {
  return screenContent(output, "")
}

// Desktop actions answer with the screen a moment after they're done, so
// the agent sees what happened without spending a step on screen_capture
const DESKTOP_ACTIONS = [
  "pointer_click",
  "pointer_move",
  "pointer_drag",
  "pointer_scroll",
  "key_type",
  "key_press",
] as const

export function isDesktopAction(name: string) {
  return (DESKTOP_ACTIONS as readonly string[]).includes(name)
}

// Tools that only work for a model that can see the screen. A model that
// can't works its machine through the shell and files, and hands the screen
// to the person when a task needs it.
export const SIGHT_TOOLS: readonly string[] = [
  "screen_capture",
  "screen_share",
  ...DESKTOP_ACTIONS,
  "vault_list",
  "vault_fill",
  "request_payment_approval",
  "request_secret",
]

async function thenLook<T extends object>(agentId: string, done: T, settleMs: number) {
  await new Promise((resolve) => setTimeout(resolve, settleMs))
  try {
    return { ...done, ...(await capture(agentId)) }
  } catch {
    // The action happened; only the look afterwards failed
    return { ...done, image: null, mediaType: "image/jpeg", width: null, height: null }
  }
}

function actionToModel(output: ScreenCapture) {
  return screenContent(output, "Done. The screen just after:")
}

const AFTER = "Returns a screenshot taken just after, so you see the result."

/* ────────────────────────── workstation ───────────────────────── */

export function createWorkstationTools(env: ToolEnv) {
  const agentId = () => env.current().id

  return {
    shell: tool({
      description:
        "Run a shell command on your workstation (Linux, bash, with passwordless sudo). Returns combined output and the exit code. Each call is a fresh shell that starts in your home directory unless `cwd` is given. Programs started in the background keep running.",
      inputSchema: z.object({
        command: z.string().min(1).describe("The command to run"),
        cwd: z.string().optional().describe("Working directory"),
        timeout: z
          .number()
          .int()
          .min(1)
          .max(900)
          .optional()
          .describe("Seconds before the command is abandoned. Default 120."),
      }),
      execute: async ({ command, cwd, timeout = 120 }) => {
        const started = Date.now()
        const result = await runCommand(agentId(), command, {
          cwd,
          timeoutSeconds: timeout,
        })
        return {
          exitCode: result.exitCode,
          output: clip(result.output),
          durationMs: Date.now() - started,
        }
      },
    }),

    fs_read: tool({
      description: "Read a text file from your workstation.",
      inputSchema: z.object({
        path: z.string().describe("Path on the workstation; relative paths start at ~"),
      }),
      execute: async ({ path }) => {
        const file = await readFile(agentId(), path)
        return { path, content: clip(file.content.toString("utf8")), bytes: file.bytes }
      },
    }),

    fs_write: tool({
      description:
        "Create or overwrite a text file on your workstation. Missing parent folders are created.",
      inputSchema: z.object({
        path: z.string().describe("Path on the workstation; relative paths start at ~"),
        content: z.string().describe("The complete new contents"),
      }),
      execute: async ({ path, content }) => {
        const bytes = Buffer.from(content, "utf8")
        await writeFile(agentId(), path, bytes)
        return { path, bytes: bytes.byteLength }
      },
    }),

    fs_list: tool({
      description: "List a directory on your workstation.",
      inputSchema: z.object({
        path: z
          .string()
          .default(".")
          .describe("Path on the workstation; relative paths start at ~"),
      }),
      execute: async ({ path }) => {
        const entries = await listDirectory(agentId(), path)
        return { path, entries: entries.slice(0, 500) }
      },
    }),

    screen_capture: tool({
      description:
        "Look at your workstation's desktop. Only you see this screenshot. Desktop actions already return a screenshot of their result, so use this to look before your first action or after waiting for something to load.",
      inputSchema: z.object({}),
      execute: async () => capture(agentId()),
      toModelOutput: screenToModel,
    }),

    screen_share: tool({
      description:
        "Show your desktop to the person: the screenshot appears in the conversation. Use only when they ask to see the screen.",
      inputSchema: z.object({}),
      execute: async () => capture(agentId()),
      toModelOutput: screenToModel,
    }),

    pointer_click: tool({
      description: `Click at a point on the desktop. ${AFTER}`,
      inputSchema: z.object({
        ...coordinates,
        button: z.enum(["left", "right", "middle"]).default("left"),
        double: z.boolean().default(false),
      }),
      execute: async ({ x, y, button, double }) => {
        await click(agentId(), x, y, button, double)
        return thenLook(agentId(), { x, y, button, double }, 900)
      },
      toModelOutput: ({ output }) => actionToModel(output),
    }),

    pointer_move: tool({
      description: `Move the pointer without clicking, e.g. to reveal a hover menu. ${AFTER}`,
      inputSchema: z.object(coordinates),
      execute: async ({ x, y }) => {
        await movePointer(agentId(), x, y)
        return thenLook(agentId(), { x, y }, 400)
      },
      toModelOutput: ({ output }) => actionToModel(output),
    }),

    pointer_drag: tool({
      description: `Press the left button at one point, drag to another and release. ${AFTER}`,
      inputSchema: z.object({
        fromX: coordinates.x,
        fromY: coordinates.y,
        toX: coordinates.x,
        toY: coordinates.y,
      }),
      execute: async ({ fromX, fromY, toX, toY }) => {
        await drag(agentId(), fromX, fromY, toX, toY)
        return thenLook(agentId(), { fromX, fromY, toX, toY }, 500)
      },
      toModelOutput: ({ output }) => actionToModel(output),
    }),

    pointer_scroll: tool({
      description: `Scroll the mouse wheel at a point on the desktop. ${AFTER}`,
      inputSchema: z.object({
        ...coordinates,
        direction: z.enum(["up", "down"]),
        amount: z.number().int().min(1).max(30).default(3).describe("Wheel notches"),
      }),
      execute: async ({ x, y, direction, amount }) => {
        await scroll(agentId(), x, y, direction, amount)
        return thenLook(agentId(), { x, y, direction, amount }, 500)
      },
      toModelOutput: ({ output }) => actionToModel(output),
    }),

    key_type: tool({
      description: `Type text into the focused element on the desktop. Newlines are sent as Enter. ${AFTER}`,
      inputSchema: z.object({ text: z.string() }),
      execute: async ({ text }) => {
        await typeText(agentId(), text)
        return thenLook(agentId(), { characters: text.length }, 500)
      },
      toModelOutput: ({ output }) => actionToModel(output),
    }),

    key_press: tool({
      description: `Press one key, optionally with modifiers held — e.g. key 'enter', or key 'l' with ['ctrl']. ${AFTER}`,
      inputSchema: z.object({
        key: z
          .string()
          .describe(
            "A letter or digit, or one of: enter, escape, tab, backspace, delete, space, up, down, left, right, home, end, pageup, pagedown, f1–f12"
          ),
        modifiers: z.array(z.enum(["ctrl", "alt", "shift", "cmd"])).default([]),
      }),
      execute: async ({ key, modifiers }) => {
        // Models sometimes send a modifier as both the key and a modifier
        const held = modifiers.filter((modifier) => modifier !== key.toLowerCase())
        await pressKey(agentId(), key, held)
        // Enter usually submits or navigates; give the page longer
        const settle = /^(enter|return)$/i.test(key) ? 1500 : 500
        return thenLook(agentId(), { key, modifiers: held }, settle)
      },
      toModelOutput: ({ output }) => actionToModel(output),
    }),

    request_takeover: tool({
      description:
        "Pause and hand your desktop to the person for a step only they should do: signing in, entering a one-time code, paying, solving a CAPTCHA, or a choice they must make on screen. Leave the page ready, then describe exactly what is waiting and what they need to do. Your turn ends with this call; they will hand control back (with a note if needed) when they're done.",
      inputSchema: z.object({
        reason: z
          .string()
          .min(1)
          .describe(
            "What is on screen and what the person needs to do, in one or two sentences"
          ),
      }),
      execute: async ({ reason }) => {
        await env.onTakeoverRequested?.(env.current(), reason)
        return { reason }
      },
    }),
  }
}

/* ───────────────────────────── vault ──────────────────────────── */

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

export function createVaultTools(env: ToolEnv) {
  const agentId = () => env.current().id
  const page = () => currentPage(agentId()).catch(() => null)

  return {
    vault_list: tool({
      description:
        "See what the person keeps in their vault: saved logins, cards, UPI IDs and personal details. You get each item's id, label and a masked hint, never the values.",
      inputSchema: z.object({}),
      execute: async () => ({
        items: listVault({ temporary: true }).map(({ id, kind, label, hint, site }) => ({
          id,
          kind,
          label,
          hint,
          site,
          fields: VAULT_FIELDS[kind],
        })),
      }),
    }),

    vault_fill: tool({
      description:
        "Type a value from the person's vault into a field on your desktop, without you ever seeing it. Click the field first, or pass x and y to have it clicked. A login only fills on its own site; a card or UPI ID only after the person approved the payment with request_payment_approval, and only on the site they approved. The field then shows dots. Returns no screenshot: take one with screen_capture to check the form.",
      inputSchema: z.object({
        id: z
          .string()
          .describe("The vault item's id, from vault_list or the person's message"),
        field: z
          .string()
          .describe(
            "Which value to type: number, expiry, expiry_month, expiry_year, cvv or name for a card; id for UPI; username or password for a login; name, email, phone, address, city, postcode… for personal details; code for a one-time code"
          ),
        x: coordinates.x.optional(),
        y: coordinates.y.optional(),
      }),
      execute: async ({ id, field, x, y }) => {
        const item = getVaultItem(id)
        if (!item)
          throw new Error("There's no vault item with that id. Check vault_list.")
        const where = await page()
        // Vault values go into web pages only, never a terminal or another app
        if (!where) {
          throw new Error(
            "The browser isn't the focused window. Click the field on the web page first: vault values are only typed into a page."
          )
        }
        if (item.kind === "login" && !hostMatches(where?.host ?? null, item.site)) {
          throw new Error(
            `"${item.label}" is a login for ${item.site}, but the browser is on ${where?.host ?? "no website"}. Logins only fill on their own site.`
          )
        }
        if (item.kind === "card" || item.kind === "upi") {
          const approval = activeApproval(env.threadId, item.id)
          if (!approval) {
            throw new Error(
              "This payment method can't be used until the person approves the payment. Call request_payment_approval first."
            )
          }
          if (approval.host && !hostMatches(where?.host ?? null, approval.host)) {
            throw new Error(
              `The payment was approved on ${approval.host}, but the browser is now on ${where?.host ?? "no website"}. Ask for approval again on this site.`
            )
          }
        }
        const value = vaultValue(item.id, field)
        if (x !== undefined && y !== undefined) {
          await click(agentId(), x, y, "left", false)
          await sleep(300)
        }
        await typeSecret(agentId(), value)
        await maskFocusedField(agentId())
        markVaultUsed(item.id)
        return {
          filled: field.replace(/_/g, " "),
          item: item.hint,
          site: where?.host ?? null,
        }
      },
    }),

    request_payment_approval: tool({
      description:
        "Ask the person to approve a payment before you pay for anything. Call it on the checkout page once the final amount is known. They see the merchant, the amount and the site, and choose: approve with a saved card or UPI ID (you then fill it with vault_fill), take over and pay themselves, or decline. Your turn ends with this call; their decision arrives as a message.",
      inputSchema: z.object({
        merchant: z.string().min(1).describe("Who is being paid, e.g. MakeMyTrip"),
        amount: z
          .string()
          .min(1)
          .describe("The exact total with its currency, e.g. ₹19,062"),
        purpose: z.string().min(1).describe("What it pays for, in one short sentence"),
      }),
      execute: async ({ merchant, amount, purpose }) => {
        const where = await page()
        const approval = createApproval({
          threadId: env.threadId,
          agentId: agentId(),
          merchant,
          amount,
          purpose,
          host: where?.host ?? null,
        })
        const methods = listVault({ temporary: true }).filter(
          (item) => item.kind === "card" || item.kind === "upi"
        )
        await env.onApprovalRequested?.(env.current(), approval, methods)
        return {
          approvalId: approval.id,
          merchant,
          amount,
          purpose,
          site: approval.host,
          savedMethods: methods.map((method) => method.hint),
        }
      },
    }),

    request_secret: tool({
      description:
        "Ask the person for something only they have: a login, a card or UPI ID, personal details, or a one-time code they were sent. They enter it in a secure form; it goes into their vault (kept for next time if they choose), never into this conversation, and you get an item id to use with vault_fill. Check vault_list first. Your turn ends with this call.",
      inputSchema: z.object({
        kind: z
          .enum(["login", "card", "upi", "identity", "code"])
          .describe(
            "login, card, upi, identity (name, phone, address…) or code (a one-time code / OTP)"
          ),
        reason: z
          .string()
          .min(1)
          .describe("What it's for, e.g. 'Your Swiggy login, to place the order'"),
        site: z.string().optional().describe("For a login: the site it's for"),
      }),
      execute: async ({ kind, reason, site }) => {
        const where = await page()
        const request: SecretRequest = {
          kind,
          reason,
          site: kind === "login" ? siteOf(site || where?.host || "") || null : null,
          host: where?.host ?? null,
        }
        await env.onSecretRequested?.(env.current(), request)
        return request
      },
    }),
  }
}

/* ──────────────────────────── memory ──────────────────────────── */

export function createMemoryTools(env: ToolEnv) {
  return {
    memory_write: tool({
      description:
        "Save a durable note to your long-term memory. It will be in front of you in every future conversation, in every thread. Use it for facts about the person, their projects, preferences, decisions and standing instructions — and whenever they ask you to remember something.",
      inputSchema: z.object({
        note: z
          .string()
          .min(1)
          .max(2000)
          .describe(
            "One self-contained statement that makes sense without this conversation"
          ),
      }),
      execute: async ({ note }) => {
        const [row] = db
          .insert(memories)
          .values({ agentId: env.current().id, content: note.trim() })
          .returning({ id: memories.id })
          .all()
        return { id: row.id, saved: note.trim() }
      },
    }),

    memory_forget: tool({
      description:
        "Delete a note from your memory by its id, when it is wrong, outdated or the person asks you to forget it.",
      inputSchema: z.object({
        id: z.string().describe("The note's id, shown in your memory"),
      }),
      execute: async ({ id }) => {
        const removed = db
          .delete(memories)
          .where(and(eq(memories.id, id), eq(memories.agentId, env.current().id)))
          .returning({ id: memories.id })
          .all()
        if (removed.length === 0) throw new Error(`No note with id ${id} in your memory.`)
        return { forgotten: id }
      },
    }),
  }
}

/* ───────────────────────────── web ────────────────────────────── */

// Text from the web is data, never instructions. The model reads it inside
// a marker it can tell apart from the person's words (the instructions say
// what the marker means), and a page can't close the marker early.
export function untrusted(source: string, text: string) {
  const defused = text.replace(/<\s*\/\s*untrusted\s*>/gi, "</untrusted_>")
  return `<untrusted source="${source.replace(/["<>\n]/g, "")}">\n${defused}\n</untrusted>`
}

export function createWebTools() {
  return {
    web_search: tool({
      description:
        "Search the web. Returns titles, URLs and snippets. Follow up with web_fetch to read a result in full.",
      inputSchema: z.object({
        query: z.string().min(1),
        limit: z.number().int().min(1).max(10).default(5),
      }),
      execute: async ({ query, limit }) => ({
        query,
        results: await webSearch(query, limit),
      }),
      toModelOutput: ({ output }) => ({
        type: "text" as const,
        value: output.results.length
          ? untrusted(
              "web search",
              output.results
                .map(
                  (result) => `- ${result.title}\n  ${result.url}\n  ${result.snippet}`
                )
                .join("\n")
            )
          : `No results for "${output.query}".`,
      }),
    }),

    web_fetch: tool({
      description:
        "Read a web page as clean markdown. Use it on URLs from search results or ones the person gives you.",
      inputSchema: z.object({ url: z.url() }),
      execute: async ({ url }) => webFetch(url),
      toModelOutput: ({ output }) => ({
        type: "text" as const,
        value: `${output.status ? `HTTP ${output.status}. ` : ""}${untrusted(
          output.url,
          [output.title && `# ${output.title}`, output.markdown]
            .filter(Boolean)
            .join("\n\n")
        )}`,
      }),
    }),
  }
}

/* ─────────────────────────── delegation ───────────────────────── */

export type Delegation = { agentId: string; name: string }

export function createDelegateTool(
  delegate: (agentId: string, brief: string) => Delegation
) {
  return {
    delegate: tool({
      description:
        "Hand this request to another agent in the squad whose role fits it better. They take over the rest of the turn and reply to the person in your place.",
      inputSchema: z.object({
        agentId: z.string().describe("The id of the squad member to hand over to"),
        brief: z.string().describe("What they should do, in one or two sentences"),
      }),
      execute: async ({ agentId, brief }) => delegate(agentId, brief),
      // Spelled out for the model: the next step belongs to someone else
      toModelOutput: ({ output }) => ({
        type: "text" as const,
        value: `Handover complete. ${output.name} now holds this turn and must do the work and answer the person.`,
      }),
    }),
  }
}

/* ──────────────────────────── routines ─────────────────────────── */

const WEEKDAY_NAMES = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
] as const

function routineOwner(routine: Routine) {
  if (routine.agentId) {
    return db
      .select({ name: agents.name })
      .from(agents)
      .where(eq(agents.id, routine.agentId))
      .get()?.name
  }
  if (!routine.squadId) return undefined
  return db
    .select({ name: squads.name })
    .from(squads)
    .where(eq(squads.id, routine.squadId))
    .get()?.name
}

function describeRoutine(routine: Routine) {
  return {
    id: routine.id,
    name: routine.name,
    by: routineOwner(routine) ?? null,
    when: describeSchedule(routine.schedule),
    on: routine.enabled,
    nextRun: routine.nextRunAt
      ? routine.nextRunAt.toLocaleString("en-GB", {
          weekday: "short",
          day: "numeric",
          month: "short",
          hour: "2-digit",
          minute: "2-digit",
        })
      : null,
    task: routine.prompt,
  }
}

// Scheduling from a conversation: "every morning at 8, send me…"
export function createRoutineTools(env: ToolEnv) {
  return {
    routine_create: tool({
      description:
        'Schedule a task to run on its own later, in the person\'s local time: every day, on weekdays, once a week, every few hours, or just once at a set date and time. Use it whenever they ask for something to happen regularly or at a set time ("every morning at 8, brief me on…", "on Fridays at 5 check…", "tomorrow at 9 remind me…"). Each run, the task arrives as a message in the routine\'s own thread and is done without them watching; they\'re notified with the result in the app, on their desktop and on Telegram. It keeps working while Xiryn runs, even with no browser open. Ask first if the time is ambiguous.',
      inputSchema: z.object({
        name: z.string().min(1).max(60).describe('A short name, e.g. "Morning brief"'),
        task: z
          .string()
          .min(1)
          .max(4000)
          .describe(
            'What to do on one run, as a self-contained instruction to yourself that is read later without this conversation. Leave the schedule out: "Write me a short motivational quote", not "Every Sunday, send me a quote"'
          ),
        when: z
          .enum(["daily", "weekdays", "weekly", "hourly", "once"])
          .describe(
            "daily, weekdays (Monday to Friday), weekly (one day a week), hourly (every few hours) or once"
          ),
        time: z
          .string()
          .optional()
          .describe("For daily, weekdays and weekly: 24-hour local time, e.g. 08:30"),
        day: z.enum(WEEKDAY_NAMES).optional().describe("For weekly: the day"),
        every: z
          .number()
          .int()
          .min(1)
          .max(24)
          .optional()
          .describe("For hourly: how many hours apart"),
        at: z
          .string()
          .optional()
          .describe(
            "For once: local date and time as YYYY-MM-DDTHH:MM, e.g. 2026-10-21T09:00"
          ),
      }),
      execute: async ({ name, task, when, time, day, every, at }) => {
        const parsed = routineScheduleSchema.safeParse(
          when === "hourly"
            ? { kind: when, every: every ?? 1 }
            : when === "once"
              ? { kind: when, at }
              : when === "weekly"
                ? { kind: when, time, day: day ? WEEKDAY_NAMES.indexOf(day) : undefined }
                : { kind: when, time }
        )
        if (!parsed.success) {
          throw new Error(
            `The schedule isn't complete: ${parsed.error.issues
              .map((issue) => `${issue.path.join(".") || "schedule"}: ${issue.message}`)
              .join("; ")}`
          )
        }
        const next = nextRun(parsed.data)
        if (!next)
          throw new Error("That time has already passed. Pick one in the future.")
        // In a squad's thread the routine belongs to the squad
        const thread = db
          .select({ squadId: threads.squadId })
          .from(threads)
          .where(eq(threads.id, env.threadId))
          .get()
        const [routine] = db
          .insert(routines)
          .values({
            name: name.trim(),
            agentId: thread?.squadId ? null : env.current().id,
            squadId: thread?.squadId ?? null,
            prompt: task.trim(),
            schedule: parsed.data,
            nextRunAt: next,
          })
          .returning()
          .all()
        return describeRoutine(routine)
      },
    }),

    routine_list: tool({
      description:
        "List the scheduled routines in this workspace: what each does, when, and when it runs next.",
      inputSchema: z.object({}),
      execute: async () => ({
        routines: db
          .select()
          .from(routines)
          .orderBy(asc(routines.createdAt))
          .all()
          .map(describeRoutine),
      }),
    }),

    routine_delete: tool({
      description:
        "Delete a scheduled routine by its id (from routine_list) when the person asks to stop or cancel it. Its thread and past results are kept.",
      inputSchema: z.object({ id: z.string().describe("The routine's id") }),
      execute: async ({ id }) => {
        const routine = db.select().from(routines).where(eq(routines.id, id)).get()
        if (!routine)
          throw new Error("No routine has that id. Use routine_list to find it.")
        db.delete(routines).where(eq(routines.id, id)).run()
        return { deleted: routine.name }
      },
    }),
  }
}

/* ───────────────────────────── types ──────────────────────────── */

export type XirynTools = ReturnType<typeof createWorkstationTools> &
  ReturnType<typeof createVaultTools> &
  ReturnType<typeof createMemoryTools> &
  ReturnType<typeof createWebTools> &
  ReturnType<typeof createRoutineTools> &
  ReturnType<typeof createDelegateTool>

export type XirynMetadata = {
  // The agent that started the reply, or that a squad message was sent to
  agentId?: string
  model?: string
  usage?: { input: number; output: number; cached?: number }
  // What the reply cost in dollars: 0 on a local model, null when the
  // model's price isn't known
  cost?: number | null
  durationMs?: number
  // Set on messages that arrived through Telegram
  via?: "telegram"
  // Set on the message a routine sends when it runs
  routine?: { id: string; name: string }
  // Set on the message sent when the person hands the desktop back
  handback?: { note?: string }
  // Set on the message that answers a payment approval or a secret request
  vault?: {
    action: "approved" | "declined" | "taken-over" | "provided"
    summary: string
  }
}

export type XirynMessage = UIMessage<XirynMetadata, UIDataTypes, InferUITools<XirynTools>>
