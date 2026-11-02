"use server"

import { eq, inArray, notExists, or } from "drizzle-orm"
import { revalidatePath } from "next/cache"

import { db } from "@/db"
import {
  agentInputSchema,
  agents,
  squadMembers,
  squads,
  threads,
  type AgentInput,
} from "@/db/schema"
import { stopRunAndWait } from "@/lib/agent/runtime"
import { engineSnapshot } from "@/lib/docker"
import { deleteWorkstation } from "@/lib/workstation"

function normalize(values: AgentInput) {
  const data = agentInputSchema.parse(values)
  return {
    ...data,
    instructions: data.instructions?.trim() || null,
    model: data.model?.trim() || null,
  }
}

// A new agent comes with an empty thread to talk to it in
export async function createAgent(values: AgentInput) {
  const data = normalize(values)
  const result = db.transaction((tx) => {
    const [agent] = tx.insert(agents).values(data).returning().all()
    const [thread] = tx
      .insert(threads)
      .values({ agentId: agent.id })
      .returning({ id: threads.id })
      .all()
    return { agent, threadId: thread.id }
  })
  revalidatePath("/", "layout")
  return result
}

export async function updateAgent(agentId: string, values: AgentInput) {
  const data = normalize(values)
  const [agent] = db
    .update(agents)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(agents.id, agentId))
    .returning()
    .all()
  if (!agent) throw new Error("Agent not found")
  revalidatePath("/", "layout")
  return agent
}

// Deletes the agent, its threads, its memory — and its workstation. Errors
// come back as values: a production build hides thrown messages.
export async function deleteAgent(agentId: string) {
  const agent = db.select().from(agents).where(eq(agents.id, agentId)).get()
  if (!agent) return { ok: false as const, error: "That agent no longer exists." }

  // Its own threads, and its squads' threads (a squad can hand it the turn).
  // Each run is stopped and has saved its last row before anything goes.
  const busy = db
    .select({ id: threads.id })
    .from(threads)
    .where(
      or(
        eq(threads.agentId, agentId),
        inArray(
          threads.squadId,
          db
            .select({ id: squadMembers.squadId })
            .from(squadMembers)
            .where(eq(squadMembers.agentId, agentId))
        )
      )
    )
    .all()
  await Promise.all(busy.map((thread) => stopRunAndWait(thread.id)))

  db.transaction((tx) => {
    tx.delete(agents).where(eq(agents.id, agentId)).run()
    // A squad left with nobody in it has nothing to show
    tx.delete(squads)
      .where(
        notExists(
          tx.select().from(squadMembers).where(eq(squadMembers.squadId, squads.id))
        )
      )
      .run()
  })
  revalidatePath("/", "layout")

  // Then the machine and its files. With Docker stopped, or if removing it
  // fails, the cleanup that runs in the background removes them later.
  let machine: "removed" | "later" = "later"
  if (engineSnapshot()?.state === "ready") {
    try {
      await deleteWorkstation(agentId)
      machine = "removed"
    } catch (error) {
      console.error(`[xiryn] couldn't remove ${agent.name}'s machine yet:`, error)
    }
  }
  return { ok: true as const, machine }
}
