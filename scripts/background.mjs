#!/usr/bin/env node
// Runs Xiryn in the background, so agents and routines keep working with no
// terminal and no browser open. It serves a production build (built here on
// first use, and again after updates), on 127.0.0.1 only, like `npm run dev`.
//
//   npm run background                 start it
//   npm run background -- stop         stop it
//   npm run background -- status       is it running?
//   npm run background -- login        also start it whenever you log in
//   npm run background -- no-login     stop starting it at login
//
// Output goes to data/xiryn.log.

import { spawn, spawnSync } from "node:child_process"
import {
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs"
import os from "node:os"
import path from "node:path"

const root = path.resolve(import.meta.dirname, "..")
const script = path.join(root, "scripts", "background.mjs")
const dataDir = path.resolve(root, process.env.XIRYN_DATA_DIR || "data")
const pidFile = path.join(dataDir, "background.pid")
const logFile = path.join(dataDir, "xiryn.log")
const builtFile = path.join(dataDir, "background-build.json")
const URL = "http://127.0.0.1:6796"
const next = path.join(root, "node_modules", "next", "dist", "bin", "next")

// The link that opens Xiryn in a browser (lib/browser-key.ts), once the
// server has made its key
function link() {
  try {
    const key = readFileSync(path.join(dataDir, "browser.key"), "utf8").trim()
    return `${URL}/unlock?key=${key}`
  } catch {
    return URL
  }
}

const command = process.argv[2] ?? "start"
const dryRun = process.argv.includes("--dry-run")

const dim = (s) => `\x1b[2m${s}\x1b[0m`
const bold = (s) => `\x1b[1m${s}\x1b[0m`
const ok = (s) => `\x1b[32m✓\x1b[0m ${s}`
const warn = (s) => `\x1b[33m!\x1b[0m ${s}`
const bad = (s) => `\x1b[31m✗\x1b[0m ${s}`

mkdirSync(dataDir, { recursive: true })

/* ──────────────────────────── helpers ──────────────────────────── */

function readPid() {
  try {
    const pid = Number(readFileSync(pidFile, "utf8").trim())
    return Number.isInteger(pid) && pid > 0 ? pid : null
  } catch {
    return null
  }
}

function alive(pid) {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

async function answering() {
  try {
    const response = await fetch(URL, {
      signal: AbortSignal.timeout(3000),
      redirect: "manual",
    })
    return response.status > 0
  } catch {
    return false
  }
}

// What the build was made from: the version and, in a git clone, the commit
function source() {
  const version = JSON.parse(
    readFileSync(path.join(root, "package.json"), "utf8")
  ).version
  const head = spawnSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" })
  return { version, commit: head.status === 0 ? head.stdout.trim() : null }
}

function needsBuild() {
  if (!existsSync(path.join(root, ".next", "BUILD_ID"))) return true
  try {
    const built = JSON.parse(readFileSync(builtFile, "utf8"))
    const now = source()
    return built.version !== now.version || built.commit !== now.commit
  } catch {
    return true
  }
}

function build() {
  console.log(
    dim("  building Xiryn for the background (a minute or two, once per update)…\n")
  )
  const result = spawnSync(process.execPath, [next, "build"], {
    cwd: root,
    stdio: "inherit",
  })
  if (result.status !== 0) {
    console.log(bad("The build failed. Fix what it says above, then try again."))
    process.exit(1)
  }
  writeFileSync(builtFile, JSON.stringify(source()))
}

/* ──────────────────────────── commands ─────────────────────────── */

async function start() {
  const pid = readPid()
  if ((pid && alive(pid)) || (await answering())) {
    console.log(ok(`Xiryn is already running. Open it: ${bold(link())}`))
    return
  }
  if (needsBuild()) build()

  const log = openSync(logFile, "a")
  const child = spawn(
    process.execPath,
    [next, "start", "--hostname", "127.0.0.1", "--port", "6796"],
    {
      cwd: root,
      detached: true,
      stdio: ["ignore", log, log],
      windowsHide: true,
      env: { ...process.env, NODE_ENV: "production" },
    }
  )
  child.unref()
  closeSync(log)
  writeFileSync(pidFile, String(child.pid))

  const deadline = Date.now() + 90_000
  while (Date.now() < deadline) {
    if (await answering()) {
      console.log(ok(`Xiryn is running in the background. Open it: ${bold(link())}`))
      console.log(
        dim(
          `  Close this terminal any time. Stop it with: npm run background -- stop\n  Log: ${logFile}`
        )
      )
      return
    }
    if (!alive(child.pid)) break
    await new Promise((resolve) => setTimeout(resolve, 1000))
  }
  console.log(bad(`Xiryn didn't start. See the log: ${logFile}`))
  process.exit(1)
}

// The Node processes in a process tree on Windows, the root first
function nodeTree(root) {
  const result = spawnSync(
    "powershell.exe",
    [
      "-NoProfile",
      "-NonInteractive",
      "-Command",
      "Get-CimInstance Win32_Process | Select-Object ProcessId,ParentProcessId,Name | ConvertTo-Json -Compress",
    ],
    { encoding: "utf8", windowsHide: true }
  )
  let processes = []
  try {
    processes = JSON.parse(result.stdout)
  } catch {
    return [root]
  }
  const tree = [root]
  for (let i = 0; i < tree.length; i++) {
    for (const p of processes) {
      if (p.ParentProcessId === tree[i] && /^node(\.exe)?$/i.test(p.Name))
        tree.push(p.ProcessId)
    }
  }
  return tree
}

function stop() {
  const pid = readPid()
  if (!pid || !alive(pid)) {
    rmSync(pidFile, { force: true })
    console.log(ok("Xiryn isn't running in the background"))
    return
  }
  if (process.platform === "win32") {
    // The server's own Node processes only: apps it started for you, like
    // Ollama or Docker Desktop, keep running
    for (const node of nodeTree(pid)) {
      spawnSync("taskkill", ["/PID", String(node), "/F"], { stdio: "ignore" })
    }
  } else {
    // The whole group: the server and its workers. Apps it started for you,
    // like Ollama, run in groups of their own and keep running
    try {
      process.kill(-pid, "SIGTERM")
    } catch {
      try {
        process.kill(pid, "SIGTERM")
      } catch {}
    }
  }
  rmSync(pidFile, { force: true })
  console.log(ok("Stopped Xiryn"))
}

async function status() {
  const pid = readPid()
  const background = !!pid && alive(pid)
  const up = await answering()
  if (background && up) console.log(ok(`running in the background at ${bold(URL)}`))
  else if (up)
    console.log(ok(`running at ${bold(URL)} ${dim("(not in the background)")}`))
  else if (background) console.log(warn(`starting… ${dim(`(log: ${logFile})`)}`))
  else console.log(dim("  not running"))
  const login = loginEntry()
  console.log(dim(`  starts at login: ${login && existsSync(login.file) ? "yes" : "no"}`))
}

/* ─────────────────────────── at login ──────────────────────────── */

const quote = (value) => `"${value.replace(/"/g, '\\"')}"`

// Where each system looks for things to start at login, and what to put there
function loginEntry() {
  const home = os.homedir()
  if (process.platform === "win32") {
    const startup = path.join(
      process.env.APPDATA ?? path.join(home, "AppData", "Roaming"),
      "Microsoft",
      "Windows",
      "Start Menu",
      "Programs",
      "Startup"
    )
    // A hidden window: no console flashes up at login
    const run = `"""${process.execPath}"" ""${script}"" start"`
    return {
      file: path.join(startup, "Xiryn.vbs"),
      content: `' Starts Xiryn in the background at login (npm run background -- no-login removes this)\r\nCreateObject("WScript.Shell").Run ${run}, 0, False\r\n`,
    }
  }
  if (process.platform === "darwin") {
    const escape = (value) =>
      value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    return {
      file: path.join(home, "Library", "LaunchAgents", "com.xiryn.background.plist"),
      content: `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>com.xiryn.background</string>
  <key>ProgramArguments</key>
  <array>
    <string>${escape(process.execPath)}</string>
    <string>${escape(script)}</string>
    <string>start</string>
  </array>
  <key>WorkingDirectory</key><string>${escape(root)}</string>
  <key>EnvironmentVariables</key>
  <dict><key>PATH</key><string>${escape(process.env.PATH ?? "/usr/bin:/bin")}</string></dict>
  <key>RunAtLoad</key><true/>
</dict>
</plist>
`,
    }
  }
  const config = process.env.XDG_CONFIG_HOME || path.join(home, ".config")
  return {
    file: path.join(config, "autostart", "xiryn.desktop"),
    content: `[Desktop Entry]
Type=Application
Name=Xiryn
Comment=Starts Xiryn in the background at login
Exec=${quote(process.execPath)} ${quote(script)} start
Path=${root}
NoDisplay=true
X-GNOME-Autostart-enabled=true
`,
  }
}

function login() {
  const entry = loginEntry()
  if (dryRun) {
    console.log(`${bold(entry.file)}\n\n${entry.content}`)
    return
  }
  mkdirSync(path.dirname(entry.file), { recursive: true })
  writeFileSync(entry.file, entry.content)
  console.log(ok(`Xiryn will start in the background whenever you log in`))
  console.log(dim(`  ${entry.file}\n  Undo with: npm run background -- no-login`))
}

function noLogin() {
  const entry = loginEntry()
  if (!existsSync(entry.file)) {
    console.log(ok("Xiryn doesn't start at login"))
    return
  }
  rmSync(entry.file, { force: true })
  console.log(ok("Xiryn no longer starts at login"))
}

/* ────────────────────────────── run ────────────────────────────── */

console.log("\n  xiryn · background\n")
switch (command) {
  case "start":
    await start()
    break
  case "stop":
    stop()
    break
  case "restart":
    stop()
    await start()
    break
  case "status":
    await status()
    break
  case "login":
    login()
    break
  case "no-login":
    noLogin()
    break
  default:
    console.log(
      `  Use: npm run background [-- start | stop | restart | status | login | no-login]`
    )
    process.exit(1)
}
console.log()
