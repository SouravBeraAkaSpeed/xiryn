import { execFile } from "node:child_process"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"

// On Windows, Docker Desktop's Linux machine (WSL 2) gets the memory and
// processors set in %UserProfile%\.wslconfig. When someone gives an agent
// more than that allows, Xiryn offers to raise it. The app does this at the
// person's request, never an agent, and keeps a backup.

export const WSL_CONFIG = path.join(os.homedir(), ".wslconfig")

// The file with [wsl2] memory and processors set, everything else kept
export function withWslLimits(
  text: string,
  limits: { memoryGb: number; processors: number }
) {
  const lines = text.replace(/\r\n/g, "\n").split("\n")
  const values: Record<string, string> = {
    memory: `${Math.ceil(limits.memoryGb)}GB`,
    processors: String(Math.ceil(limits.processors)),
  }
  let section = ""
  let sectionStart = -1
  const seen = new Set<string>()
  const out: string[] = []
  for (const line of lines) {
    const header = line.match(/^\s*\[([^\]]+)\]\s*$/)
    if (header) {
      // Leaving [wsl2]: add what it didn't have yet, before its blank lines
      if (section === "wsl2") insertMissing(out, values, seen)
      section = header[1].trim().toLowerCase()
      if (section === "wsl2") sectionStart = out.length
      out.push(line)
      continue
    }
    const key = line.match(/^\s*([A-Za-z]+)\s*=/)?.[1]?.toLowerCase()
    if (section === "wsl2" && key && key in values) {
      out.push(`${key}=${values[key]}`)
      seen.add(key)
      continue
    }
    out.push(line)
  }
  if (section === "wsl2") insertMissing(out, values, seen)
  if (sectionStart === -1) {
    while (out.length && out[out.length - 1] === "") out.pop()
    if (out.length) out.push("")
    out.push("[wsl2]", ...missing(values, seen))
  }
  return out.join("\r\n").replace(/(\r\n)*$/, "\r\n")
}

function insertMissing(out: string[], values: Record<string, string>, seen: Set<string>) {
  let at = out.length
  while (at > 0 && out[at - 1].trim() === "") at--
  out.splice(at, 0, ...missing(values, seen))
}

function missing(values: Record<string, string>, seen: Set<string>) {
  return Object.entries(values)
    .filter(([key]) => !seen.has(key))
    .map(([key, value]) => {
      seen.add(key)
      return `${key}=${value}`
    })
}

export function raiseWslLimits(limits: { memoryGb: number; processors: number }) {
  if (process.platform !== "win32") throw new Error("Only on Windows.")
  const current = fs.existsSync(WSL_CONFIG) ? fs.readFileSync(WSL_CONFIG, "utf8") : ""
  if (current) fs.writeFileSync(`${WSL_CONFIG}.xiryn-backup`, current)
  fs.writeFileSync(WSL_CONFIG, withWslLimits(current, limits))
}

// Restarts WSL so the new limits apply; Docker Desktop then needs starting
// again, which ensureEngine() does
export function shutdownWsl() {
  return new Promise<void>((resolve, reject) => {
    execFile(
      "wsl.exe",
      ["--shutdown"],
      { timeout: 60_000, windowsHide: true },
      (error) =>
        error
          ? reject(new Error("Couldn't restart WSL. Restart Docker Desktop yourself."))
          : resolve()
    )
  })
}
