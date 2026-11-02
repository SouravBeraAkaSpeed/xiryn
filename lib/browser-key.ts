import { createHmac, randomBytes, timingSafeEqual } from "node:crypto"
import fs from "node:fs"
import path from "node:path"

// Xiryn has no accounts, and its agents' machines can reach this computer's
// loopback through Docker (host.docker.internal), with any Host header they
// like. So a browser has to show it belongs to the person: it was opened
// with Xiryn's link, which carries a key from the data directory that no
// agent's machine can read, and it keeps a cookie made from that key.
// Read by proxy.ts, so only Node built-ins here.

const DATA_DIR = path.resolve(
  /*turbopackIgnore: true*/ process.env.XIRYN_DATA_DIR || "data"
)
const KEY_FILE = path.join(DATA_DIR, "browser.key")

export const BROWSER_COOKIE = "xiryn_browser"
// Browsers keep a cookie for at most 400 days
export const BROWSER_COOKIE_MAX_AGE = 400 * 24 * 60 * 60

let cached: string | null = null

function valid(key: string) {
  return /^[A-Za-z0-9_-]{40,}$/.test(key)
}

// The key, made the first time Xiryn starts. `created` is true for the call
// that made it.
export function browserKey(): { key: string; created: boolean } {
  if (cached) return { key: cached, created: false }
  fs.mkdirSync(DATA_DIR, { recursive: true })
  try {
    const existing = fs.readFileSync(KEY_FILE, "utf8").trim()
    if (valid(existing)) {
      cached = existing
      return { key: existing, created: false }
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error
  }
  const fresh = randomBytes(32).toString("base64url")
  try {
    fs.writeFileSync(KEY_FILE, fresh, { flag: "wx", mode: 0o600 })
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error
    // Made at the same moment elsewhere, or there but unusable
    const raced = fs.readFileSync(KEY_FILE, "utf8").trim()
    if (valid(raced)) {
      cached = raced
      return { key: raced, created: false }
    }
    fs.writeFileSync(KEY_FILE, fresh, { mode: 0o600 })
  }
  cached = fresh
  return { key: fresh, created: true }
}

// What the browser keeps: derived from the key, never the key itself
export function browserCookie(key: string) {
  return createHmac("sha256", key).update("xiryn-browser").digest("base64url")
}

export function sameSecret(given: string, expected: string) {
  const a = Buffer.from(given)
  const b = Buffer.from(expected)
  return a.length === b.length && timingSafeEqual(a, b)
}

export function unlockUrl(origin = process.env.XIRYN_URL || "http://127.0.0.1:6796") {
  return `${origin.replace(/\/+$/, "")}/unlock?key=${browserKey().key}`
}
