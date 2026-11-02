"use server"

import os from "node:os"

import { eq } from "drizzle-orm"
import { revalidatePath } from "next/cache"
import { z } from "zod"

import { db } from "@/db"
import { agents } from "@/db/schema"
import { ensureEngine, probeEngine } from "@/lib/docker"
import {
  machineSpec,
  machineSpecSchema,
  saveMachineSpec,
  SCREEN_SIZES,
  type MachineSpec,
} from "@/lib/machines"
import { raiseWslLimits, shutdownWsl } from "@/lib/wsl"

// Sizing an agent's computer. Three limits apply: what this computer has,
// what the container engine is allowed, and sense. Past the engine's limit,
// Windows can raise it (.wslconfig) with the person's consent; macOS engines
// are set in their own settings.

const GB = 1024 ** 3
// Left for the operating system and Xiryn itself
const HOST_RESERVE_GB = 1
const ENGINE_RESERVE_GB = 0.25

export async function machineView(agentId: string) {
  const engine = await probeEngine().catch(() => null)
  return {
    spec: machineSpec(agentId),
    sizes: SCREEN_SIZES.map(([width, height]) => ({ width, height })),
    host: { cpus: os.cpus().length, memoryGb: os.totalmem() / GB },
    engine:
      engine?.state === "ready"
        ? { cpus: engine.cpus, memoryGb: engine.memoryBytes / GB, os: engine.os }
        : null,
    canRaiseEngine: process.platform === "win32",
  }
}

type SaveResult =
  | { ok: true }
  | { ok: false; error: string }
  // More than the container engine allows: offer to raise it
  | { ok: false; error: string; engineNeeds: { cpus: number; memoryGb: number } }

export async function saveMachine(
  agentId: string,
  input: MachineSpec
): Promise<SaveResult> {
  const parsed = machineSpecSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message }
  const spec = parsed.data
  const agent = db
    .select({ id: agents.id })
    .from(agents)
    .where(eq(agents.id, agentId))
    .get()
  if (!agent) return { ok: false, error: "That agent no longer exists." }

  const hostCpus = os.cpus().length
  const hostMemory = os.totalmem() / GB - HOST_RESERVE_GB
  if (spec.cpus > hostCpus) {
    return { ok: false, error: `This computer has ${hostCpus} processors.` }
  }
  if (spec.memoryGb > hostMemory) {
    return {
      ok: false,
      error: `This computer can give an agent at most ${Math.floor(hostMemory)} GB of memory.`,
    }
  }
  const engine = await probeEngine().catch(() => null)
  if (engine?.state === "ready") {
    const engineMemory = engine.memoryBytes / GB - ENGINE_RESERVE_GB
    if (spec.cpus > engine.cpus || spec.memoryGb > engineMemory) {
      return {
        ok: false,
        error: `The container engine is allowed ${engine.cpus} processors and ${Math.floor(engine.memoryBytes / GB)} GB of memory, less than this size needs.`,
        engineNeeds: {
          cpus: Math.max(spec.cpus, engine.cpus),
          memoryGb: Math.max(spec.memoryGb + 1, engine.memoryBytes / GB),
        },
      }
    }
  }
  saveMachineSpec(agentId, spec)
  revalidatePath(`/a/${agentId}`, "layout")
  return { ok: true }
}

// What saveMachine said the engine needs. Numbers only, never NaN or
// Infinity; what's written is also capped at what this computer has.
const engineNeedsSchema = z.object({
  cpus: z.number().min(0.5).max(1024),
  memoryGb: z.number().min(1).max(4096),
})

// Windows only, at the person's request: give the WSL 2 machine more room,
// then restart it and the engine so the new limits apply
export async function raiseEngineLimits(needs: { cpus: number; memoryGb: number }) {
  if (process.platform !== "win32") {
    return {
      ok: false as const,
      error: "Change this in your container engine's settings.",
    }
  }
  const parsed = engineNeedsSchema.safeParse(needs)
  if (!parsed.success) {
    return {
      ok: false as const,
      error: "Those limits aren't something an agent can use.",
    }
  }
  // Whole numbers, at least one, and never more than this computer has:
  // they're written into .wslconfig as they are
  const hostCpus = os.cpus().length
  const hostMemory = Math.max(1, Math.floor(os.totalmem() / GB - HOST_RESERVE_GB))
  try {
    raiseWslLimits({
      processors: Math.max(1, Math.min(Math.ceil(parsed.data.cpus), hostCpus)),
      memoryGb: Math.max(1, Math.min(Math.ceil(parsed.data.memoryGb), hostMemory)),
    })
    await shutdownWsl()
    await ensureEngine(240_000)
    return { ok: true as const }
  } catch (error) {
    return {
      ok: false as const,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}
