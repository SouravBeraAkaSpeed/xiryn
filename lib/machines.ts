import { eq } from "drizzle-orm"
import { z } from "zod"

import { db } from "@/db"
import { agentMachines } from "@/db/schema"
import { getSetting } from "@/lib/config"

// How big each agent's computer is: processors, memory and screen. People
// can give an agent as much as their machine has; the container engine's own
// limit is checked when saving (actions/machines.ts).

export type MachineSpec = {
  cpus: number
  memoryGb: number
  width: number
  height: number
}

export const SCREEN_SIZES = [
  [1280, 800],
  [1440, 900],
  [1600, 1000],
  [1920, 1080],
  [2560, 1440],
] as const

const DEFAULT_SCREEN = SCREEN_SIZES[0]

function setting(key: "workstation.cpus" | "workstation.memory", fallback: number) {
  const value = Number.parseFloat(getSetting(key) ?? "")
  return Number.isFinite(value) && value > 0 ? value : fallback
}

// The agent's size, or the workspace defaults
export function machineSpec(agentId: string): MachineSpec {
  const row = db
    .select()
    .from(agentMachines)
    .where(eq(agentMachines.agentId, agentId))
    .get()
  if (row) {
    return {
      cpus: row.cpus,
      memoryGb: row.memoryGb,
      width: row.screenWidth,
      height: row.screenHeight,
    }
  }
  return {
    cpus: setting("workstation.cpus", 2),
    memoryGb: setting("workstation.memory", 4),
    width: DEFAULT_SCREEN[0],
    height: DEFAULT_SCREEN[1],
  }
}

// Written on the container, so a machine built with another size is rebuilt
// the next time it starts
export function machineKey(spec: MachineSpec) {
  return `${spec.cpus}c-${spec.memoryGb}g-${spec.width}x${spec.height}`
}

export const machineSpecSchema = z
  .object({
    cpus: z.number().min(0.5, "Give it at least half a processor.").max(256),
    memoryGb: z.number().min(1, "Give it at least 1 GB of memory.").max(1024),
    width: z.number().int(),
    height: z.number().int(),
  })
  .refine(
    (spec) => SCREEN_SIZES.some(([w, h]) => w === spec.width && h === spec.height),
    { message: "Pick one of the listed screen sizes.", path: ["width"] }
  )

export function saveMachineSpec(agentId: string, spec: MachineSpec) {
  const values = {
    cpus: spec.cpus,
    memoryGb: spec.memoryGb,
    screenWidth: spec.width,
    screenHeight: spec.height,
    updatedAt: new Date(),
  }
  db.insert(agentMachines)
    .values({ agentId, ...values })
    .onConflictDoUpdate({ target: agentMachines.agentId, set: values })
    .run()
}

// A JPEG's width and height from its frame header, so a screenshot reports
// the size it really has, whatever the agent's screen is set to
export function jpegSize(base64: string): { width: number; height: number } | null {
  const bytes = Buffer.from(base64.slice(0, 65_536), "base64")
  let i = 2
  while (i + 9 < bytes.length) {
    if (bytes[i] !== 0xff) return null
    const marker = bytes[i + 1]
    const length = bytes.readUInt16BE(i + 2)
    // Start-of-frame markers (baseline, progressive, …), not DHT/JPG/DAC
    if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
      return { height: bytes.readUInt16BE(i + 5), width: bytes.readUInt16BE(i + 7) }
    }
    i += 2 + length
  }
  return null
}
