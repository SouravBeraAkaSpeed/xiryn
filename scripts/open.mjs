#!/usr/bin/env node
// npm run open: opens Xiryn in your browser with its link. Xiryn only
// answers a browser that was given that link (lib/browser-key.ts); the key
// lives in the data directory, which only you can read.

import { spawn } from "node:child_process"
import { readFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const dataDir = path.resolve(root, process.env.XIRYN_DATA_DIR || "data")
const origin = (process.env.XIRYN_URL || "http://127.0.0.1:6796").replace(/\/+$/, "")

let key
try {
  key = readFileSync(path.join(dataDir, "browser.key"), "utf8").trim()
} catch {
  console.log("Xiryn hasn't made its link yet. Start it first: npm run dev")
  process.exit(1)
}

const url = `${origin}/unlock?key=${key}`
console.log(`Opening Xiryn: ${url}`)
const [command, args] =
  process.platform === "win32"
    ? ["rundll32", ["url.dll,FileProtocolHandler", url]]
    : process.platform === "darwin"
      ? ["open", [url]]
      : ["xdg-open", [url]]
spawn(command, args, { detached: true, stdio: "ignore", windowsHide: true })
  .on("error", () =>
    console.log("Couldn't open a browser. Open the link above yourself.")
  )
  .unref()
