#!/usr/bin/env node
// First-run helper. Checks Node, creates .env from the template, gets Docker
// installed and running (asking first), builds the agent workstation image,
// and tells you which keys are still missing. Never prints a key's value.
//
//   npm run setup                     everything
//   npm run setup -- --yes            don't ask before installing or starting Docker
//   npm run setup -- --skip-docker    leave Docker alone
//   npm run setup -- --local          also set up free local models with Ollama
//                                     (--model=qwen3.5:9b picks one yourself)
//   npm run workstation:build         only (re)build the workstation image

import { spawn, spawnSync } from "node:child_process"
import { createHash } from "node:crypto"
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs"
import os from "node:os"
import path from "node:path"
import { createInterface } from "node:readline/promises"

const root = path.resolve(import.meta.dirname, "..")
const args = new Set(process.argv.slice(2))
const workstationOnly = args.has("--workstation-only")
const assumeYes = args.has("--yes") || args.has("-y")
const interactive = process.stdin.isTTY && !process.env.CI

const dim = (s) => `\x1b[2m${s}\x1b[0m`
const bold = (s) => `\x1b[1m${s}\x1b[0m`
const ok = (s) => `\x1b[32m✓\x1b[0m ${s}`
const warn = (s) => `\x1b[33m!\x1b[0m ${s}`
const bad = (s) => `\x1b[31m✗\x1b[0m ${s}`

console.log("\n  xiryn · setup\n")

/* ───────────────────────────── node ────────────────────────────── */

const [major, minor] = process.versions.node.split(".").map(Number)
if (major < 20 || (major === 20 && minor < 9)) {
  console.log(
    bad(`Node ${process.versions.node} is too old — Xiryn needs 20.9 or newer.`)
  )
  process.exit(1)
}
console.log(ok(`node ${process.versions.node}`))

const envPath = path.join(root, ".env")
if (!workstationOnly) {
  if (!existsSync(envPath)) {
    copyFileSync(path.join(root, ".env.example"), envPath)
    console.log(ok(`created .env ${dim("from .env.example")}`))
  } else {
    console.log(ok(`.env exists ${dim("(left untouched)")}`))
  }
  mkdirSync(path.join(root, process.env.XIRYN_DATA_DIR || "data"), { recursive: true })
}

/* ──────────────────────────── docker ───────────────────────────── */

const programFiles = process.env.ProgramFiles || "C:\\Program Files"
const desktopApp =
  process.platform === "win32"
    ? path.join(programFiles, "Docker", "Docker", "Docker Desktop.exe")
    : process.platform === "darwin"
      ? "/Applications/Docker.app"
      : null

function dockerBinary() {
  const candidates = [
    "docker",
    ...(process.platform === "win32"
      ? [path.join(programFiles, "Docker", "Docker", "resources", "bin", "docker.exe")]
      : process.platform === "darwin"
        ? [
            "/usr/local/bin/docker",
            "/Applications/Docker.app/Contents/Resources/bin/docker",
          ]
        : []),
  ]
  for (const candidate of candidates) {
    const result = spawnSync(candidate, ["--version"], { encoding: "utf8" })
    if (!result.error && result.status === 0) return candidate
  }
  return null
}

const has = (command) => !spawnSync(command, ["--version"], { stdio: "ignore" }).error

async function ask(question) {
  if (assumeYes) return true
  if (!interactive) return false
  const rl = createInterface({ input: process.stdin, output: process.stdout })
  const answer = (await rl.question(`  ${question} ${dim("[Y/n]")} `))
    .trim()
    .toLowerCase()
  rl.close()
  return answer === "" || answer === "y" || answer === "yes"
}

// Runs a command in your terminal, so you see it and can answer its prompts
function run(command, commandArgs, options = {}) {
  console.log(dim(`  $ ${[command, ...commandArgs].join(" ")}`))
  return new Promise((resolve) => {
    const child = spawn(command, commandArgs, { stdio: "inherit", ...options })
    child.on("error", () => resolve(false))
    child.on("close", (code) => resolve(code === 0))
  })
}

function installPlan() {
  if (process.platform === "win32") {
    return has("winget")
      ? {
          command: "winget",
          args: [
            "install",
            "-e",
            "--id",
            "Docker.DockerDesktop",
            "--accept-package-agreements",
            "--accept-source-agreements",
          ],
        }
      : null
  }
  if (process.platform === "darwin") {
    return has("brew")
      ? { command: "brew", args: ["install", "--cask", "docker-desktop"] }
      : null
  }
  return { command: "sh", args: ["-c", "curl -fsSL https://get.docker.com | sudo sh"] }
}

const manualInstall = {
  win32: "https://docs.docker.com/desktop/setup/install/windows-install/",
  darwin: "https://docs.docker.com/desktop/setup/install/mac-install/",
  linux: "https://docs.docker.com/engine/install/",
}

async function installDocker() {
  console.log(warn("Docker isn't installed. Agents need it for their workstations."))
  const plan = installPlan()
  if (!plan) {
    console.log(`    Install Docker Desktop: ${manualInstall[process.platform]}`)
    return null
  }
  console.log(
    `    It can be installed with: ${bold([plan.command, ...plan.args].join(" "))}`
  )
  if (!(await ask("Install Docker now?"))) {
    console.log(dim("    Skipped. Run it yourself, or `npm run setup` again later."))
    return null
  }
  if (!(await run(plan.command, plan.args))) {
    console.log(bad(`Docker didn't install. See ${manualInstall[process.platform]}`))
    return null
  }
  if (process.platform === "linux") {
    const user = process.env.USER
    if (user) await run("sudo", ["usermod", "-aG", "docker", user])
    console.log(warn("Log out and back in so your user can use Docker without sudo."))
  }
  if (process.platform === "win32") {
    console.log(
      warn(
        "Docker Desktop may ask you to restart Windows or enable WSL 2 the first time."
      )
    )
  }
  return dockerBinary()
}

function engineReady(docker) {
  const result = spawnSync(docker, ["info", "--format", "{{.ServerVersion}}"], {
    encoding: "utf8",
    timeout: 20_000,
  })
  return result.status === 0 && result.stdout.trim() ? result.stdout.trim() : null
}

async function startEngine(docker) {
  if (desktopApp && existsSync(desktopApp)) {
    console.log(dim("  starting Docker Desktop…"))
    if (process.platform === "win32") {
      spawn(desktopApp, [], { detached: true, stdio: "ignore" }).unref()
    } else {
      spawn("open", ["-a", desktopApp], { detached: true, stdio: "ignore" }).unref()
    }
  } else if (process.platform === "linux") {
    const root = process.getuid?.() === 0
    const command = root ? "systemctl" : "sudo"
    const args = root ? ["start", "docker"] : ["systemctl", "start", "docker"]
    // Without a terminal, sudo can only work if it needs no password
    const canSudo =
      root ||
      interactive ||
      spawnSync("sudo", ["-n", "true"], { stdio: "ignore" }).status === 0
    if (!canSudo) {
      console.log(warn("Docker isn't running. Start it in your own terminal with:"))
      console.log(`    ${bold("sudo systemctl start docker")}`)
      return null
    }
    if (
      !(await ask("Docker isn't running. Start it with `sudo systemctl start docker`?"))
    ) {
      return null
    }
    if (!(await run(command, args))) return null
  } else {
    return null
  }
  const deadline = Date.now() + 180_000
  while (Date.now() < deadline) {
    const version = engineReady(docker)
    if (version) return version
    process.stdout.write(".")
    await new Promise((resolve) => setTimeout(resolve, 3000))
  }
  process.stdout.write("\n")
  return null
}

// The workstation image tag: a fingerprint of ./workstation.
// Kept in step with fingerprint() in lib/workstation-image.ts.
function sourceFiles(dir, prefix = "") {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name
    return entry.isDirectory()
      ? sourceFiles(path.join(dir, entry.name), relative)
      : [relative]
  })
}

function imageTag() {
  const source = path.join(root, "workstation")
  const hash = createHash("sha256")
  for (const file of sourceFiles(source).sort()) {
    hash.update(file)
    hash.update("\0")
    hash.update(readFileSync(path.join(source, ...file.split("/"))))
    hash.update("\0")
  }
  return `xiryn-workstation:${hash.digest("hex").slice(0, 12)}`
}

async function buildImage(docker) {
  const tag = imageTag()
  const present = spawnSync(docker, ["image", "inspect", tag], { stdio: "ignore" })
  if (present.status === 0 && !workstationOnly) {
    console.log(ok(`workstation image ${dim(tag)}`))
    return true
  }
  console.log(
    `\n  Building the agent workstation image ${dim(`(${tag})`)} — a Linux desktop,\n  Chromium and dev tools. A few minutes the first time; later builds are quick.\n`
  )
  const built = await run(docker, [
    "build",
    "--tag",
    tag,
    "--label",
    "xiryn.workstation-image=1",
    path.join(root, "workstation"),
  ])
  if (!built) {
    console.log(
      bad("The workstation image didn't build. Xiryn will try again on first use.")
    )
    return false
  }
  // Older versions go once nothing uses them
  const tags = spawnSync(
    docker,
    ["images", "xiryn-workstation", "--format", "{{.Tag}}"],
    {
      encoding: "utf8",
    }
  )
  for (const old of (tags.stdout ?? "").split(/\r?\n/).filter(Boolean)) {
    if (`xiryn-workstation:${old}` !== tag) {
      spawnSync(docker, ["rmi", `xiryn-workstation:${old}`], { stdio: "ignore" })
    }
  }
  console.log(ok(`workstation image ${dim(tag)}`))
  return true
}

let workstations = "skipped"
if (!args.has("--skip-docker")) {
  console.log()
  let docker = dockerBinary()
  if (!docker) docker = await installDocker()
  if (docker) {
    let version = engineReady(docker)
    if (!version) {
      console.log(warn("Docker is installed but not running."))
      version = await startEngine(docker)
    }
    if (version) {
      console.log(ok(`docker ${version}`))
      workstations = (await buildImage(docker)) ? "ready" : "image pending"
    } else {
      console.log(
        warn("Docker isn't running yet. Start Docker, then run `npm run setup` again.")
      )
      workstations = "docker stopped"
    }
  } else {
    workstations = "no docker"
  }
}

if (workstationOnly) {
  console.log()
  process.exit(workstations === "ready" ? 0 : 1)
}

/* ───────────────────────── local models ────────────────────────── *
 * --local (or XIRYN_LOCAL=1) runs every agent on a free model on this
 * computer: installs Ollama if it's missing (asking first), starts it,
 * downloads a model that fits the machine's memory and makes it the
 * default. Nothing leaves the computer, and nothing is billed.
 * ────────────────────────────────────────────────────────────────── */

const OLLAMA_URL = "http://127.0.0.1:11434"

// Tool calling and vision, so agents can also use their desktop. Smaller
// machines get smaller models; the agents' desktops need memory too.
function recommendedModel() {
  const gb = os.totalmem() / 1024 ** 3
  if (gb < 12) return { model: "qwen3.5:2b", size: "2.7 GB" }
  if (gb < 20) return { model: "qwen3.5:4b", size: "3.3 GB" }
  if (gb < 40) return { model: "qwen3.5:9b", size: "6.6 GB" }
  return { model: "qwen3.6:27b", size: "about 17 GB" }
}

function ollamaBinary() {
  const candidates = [
    "ollama",
    ...(process.platform === "win32"
      ? [path.join(process.env.LOCALAPPDATA ?? "", "Programs", "Ollama", "ollama.exe")]
      : process.platform === "darwin"
        ? [
            "/usr/local/bin/ollama",
            "/opt/homebrew/bin/ollama",
            "/Applications/Ollama.app/Contents/Resources/ollama",
          ]
        : ["/usr/local/bin/ollama", "/usr/bin/ollama"]),
  ]
  for (const candidate of candidates) {
    const result = spawnSync(candidate, ["--version"], { encoding: "utf8" })
    if (!result.error && result.status === 0) return candidate
  }
  return null
}

async function ollamaUp() {
  try {
    const response = await fetch(`${OLLAMA_URL}/api/version`, {
      signal: AbortSignal.timeout(2000),
    })
    return response.ok ? ((await response.json()).version ?? "running") : null
  } catch {
    return null
  }
}

async function installOllama() {
  const plan =
    process.platform === "win32"
      ? has("winget")
        ? {
            command: "winget",
            args: [
              "install",
              "-e",
              "--id",
              "Ollama.Ollama",
              "--accept-package-agreements",
              "--accept-source-agreements",
            ],
          }
        : null
      : process.platform === "darwin"
        ? has("brew")
          ? { command: "brew", args: ["install", "ollama"] }
          : null
        : { command: "sh", args: ["-c", "curl -fsSL https://ollama.com/install.sh | sh"] }
  console.log(
    warn("Ollama isn't installed. It runs the models on this computer, for free.")
  )
  if (!plan) {
    console.log(
      `    Install it from ${bold("https://ollama.com/download")}, then run this again.`
    )
    return null
  }
  console.log(
    `    It can be installed with: ${bold([plan.command, ...plan.args].join(" "))}`
  )
  if (!(await ask("Install Ollama now?"))) {
    console.log(dim("    Skipped. Install it from https://ollama.com/download later."))
    return null
  }
  if (!(await run(plan.command, plan.args))) {
    console.log(bad("Ollama didn't install. Get it from https://ollama.com/download"))
    return null
  }
  return ollamaBinary()
}

async function startOllama(binary) {
  console.log(dim("  starting Ollama…"))
  if (process.platform === "darwin" && existsSync("/Applications/Ollama.app")) {
    spawn("open", ["-a", "Ollama"], { detached: true, stdio: "ignore" }).unref()
  } else {
    spawn(binary, ["serve"], {
      detached: true,
      stdio: "ignore",
      windowsHide: true,
    }).unref()
  }
  const deadline = Date.now() + 60_000
  while (Date.now() < deadline) {
    const version = await ollamaUp()
    if (version) return version
    await new Promise((resolve) => setTimeout(resolve, 1500))
  }
  return null
}

async function installedModels() {
  try {
    const response = await fetch(`${OLLAMA_URL}/api/tags`, {
      signal: AbortSignal.timeout(5000),
    })
    const json = await response.json()
    return (json.models ?? []).map((m) => m.name)
  } catch {
    return []
  }
}

// Downloads a model through Ollama's own API, for when Ollama is running but
// its command isn't on the PATH (a portable copy, say). Shows one progress line.
async function pullThroughApi(model) {
  try {
    const response = await fetch(`${OLLAMA_URL}/api/pull`, {
      method: "POST",
      body: JSON.stringify({ model, stream: true }),
    })
    if (!response.ok || !response.body) throw new Error(`${response.status}`)
    const decoder = new TextDecoder()
    let buffer = ""
    for await (const chunk of response.body) {
      buffer += decoder.decode(chunk, { stream: true })
      const lines = buffer.split("\n")
      buffer = lines.pop() ?? ""
      for (const line of lines.filter((l) => l.trim())) {
        const event = JSON.parse(line)
        if (event.error) throw new Error(event.error)
        const gb = (bytes) => (bytes / 1024 ** 3).toFixed(1)
        const progress = event.total
          ? ` ${Math.floor(((event.completed ?? 0) / event.total) * 100)}% of ${gb(event.total)} GB`
          : ""
        if (process.stdout.isTTY) {
          process.stdout.write(`\r\x1b[2K  ${dim(`${event.status}${progress}`)}`)
        }
      }
    }
    if (process.stdout.isTTY) process.stdout.write("\r\x1b[2K")
    return true
  } catch (error) {
    if (process.stdout.isTTY) process.stdout.write("\n")
    console.log(bad(`Download failed: ${error instanceof Error ? error.message : error}`))
    return false
  }
}

// Ollama runs models with a small context unless told otherwise (4K on many
// machines), which cuts off an agent's instructions; save a larger one on it
async function giveContext(model) {
  const want = os.totalmem() / 1024 ** 3 < 12 ? 16_384 : 32_768
  try {
    const show = await fetch(`${OLLAMA_URL}/api/show`, {
      method: "POST",
      body: JSON.stringify({ model }),
    })
    const current = Number(
      (await show.json()).parameters?.match(/^num_ctx\s+(\d+)/m)?.[1] ?? 0
    )
    if (current >= want) return true
    const create = await fetch(`${OLLAMA_URL}/api/create`, {
      method: "POST",
      body: JSON.stringify({
        model,
        from: model,
        parameters: { num_ctx: want },
        stream: false,
      }),
    })
    return create.ok
  } catch {
    return false
  }
}

// Sets KEY=value in .env, over a commented-out example of it if there is one
function setEnv(key, value) {
  const text = readFileSync(envPath, "utf8")
  const line = `${key}=${value}`
  // Checkouts on Windows may use CRLF line endings; keep whichever the file has
  const eol = text.includes("\r\n") ? "\r\n" : "\n"
  const pattern = new RegExp(`^#?[ \\t]*${key}=[^\\r\\n]*`, "m")
  writeFileSync(
    envPath,
    pattern.test(text)
      ? text.replace(pattern, line)
      : `${text.trimEnd()}${eol}${line}${eol}`
  )
}

let localModel = null
if (args.has("--local") || process.env.XIRYN_LOCAL === "1") {
  console.log()
  const chosen =
    process.argv.find((arg) => arg.startsWith("--model="))?.slice("--model=".length) ||
    process.env.XIRYN_LOCAL_MODEL ||
    null
  let binary = ollamaBinary()
  let version = await ollamaUp()
  if (!binary && !version) binary = await installOllama()
  if (!version && binary) version = await startOllama(binary)
  if (!version) {
    console.log(
      warn(
        "Ollama isn't running. Open it (or run `ollama serve`), then `npm run setup -- --local`."
      )
    )
  } else {
    console.log(ok(`ollama ${version}`))
    const pick = chosen ? { model: chosen, size: null } : recommendedModel()
    const have = await installedModels()
    const present = have.some(
      (name) => name === pick.model || name === `${pick.model}:latest`
    )
    if (!present) {
      const memory = Math.round(os.totalmem() / 1024 ** 3)
      console.log(
        `\n  Downloading ${bold(pick.model)}${pick.size ? dim(` (${pick.size})`) : ""}${chosen ? "" : ` — picked for this computer's ${memory} GB of memory`}.\n`
      )
    }
    let pulled = present
    if (!pulled) {
      pulled = binary
        ? await run(binary, ["pull", pick.model])
        : await pullThroughApi(pick.model)
    }
    if (pulled && !(await giveContext(pick.model))) {
      console.log(
        warn(`Couldn't give ${pick.model} a larger context; Xiryn retries on first use.`)
      )
    }
    if (pulled) {
      setEnv("OLLAMA_BASE_URL", `${OLLAMA_URL}/v1`)
      setEnv("XIRYN_DEFAULT_MODEL", `ollama/${pick.model}`)
      localModel = pick.model
      console.log(
        ok(
          `local model ${bold(`ollama/${pick.model}`)} ${dim("— the default for every agent")}`
        )
      )
    } else {
      console.log(
        bad(`${pick.model} didn't download. Try \`ollama pull ${pick.model}\`.`)
      )
    }
  }
}

/* ──────────────────────────── keys ─────────────────────────────── */

const env = Object.fromEntries(
  readFileSync(envPath, "utf8")
    .split(/\r?\n/)
    .filter((line) => /^[A-Z0-9_]+=/.test(line))
    .map((line) => {
      const i = line.indexOf("=")
      return [
        line.slice(0, i),
        line
          .slice(i + 1)
          .trim()
          .replace(/^["']|["']$/g, ""),
      ]
    })
)
const set = (key) => !!env[key]

const configuredProviders = [
  "OPENAI_API_KEY",
  "ANTHROPIC_API_KEY",
  "GOOGLE_GENERATIVE_AI_API_KEY",
  "XAI_API_KEY",
  "GROQ_API_KEY",
  "MISTRAL_API_KEY",
  "DEEPSEEK_API_KEY",
  "OPENROUTER_API_KEY",
  "OPENCODE_API_KEY",
  "OLLAMA_BASE_URL",
  "LMSTUDIO_BASE_URL",
  "CUSTOM_BASE_URL",
].filter(set)

console.log()
console.log(
  configuredProviders.length
    ? ok(
        `model provider${configuredProviders.length > 1 ? "s" : ""}: ${configuredProviders.map((k) => k.replace(/_(API_KEY|BASE_URL)$/, "").toLowerCase()).join(", ")}${localModel ? dim(" · local models are free") : ""}`
      )
    : warn(
        `no model provider yet — add a key to .env (or later in Settings), or run ${bold("npm run setup -- --local")} for free local models`
      )
)
console.log(
  workstations === "ready"
    ? ok("workstations: docker")
    : warn(
        `workstations: ${workstations} ${dim("— agents can't run code or use a desktop")}`
      )
)
console.log(
  set("FIRECRAWL_API_KEY")
    ? ok("web: firecrawl")
    : dim("  web search off — optional, FIRECRAWL_API_KEY")
)
console.log(
  set("TELEGRAM_BOT_TOKEN")
    ? ok("remote: telegram")
    : dim("  remote access off — optional, see docs/telegram.md")
)

console.log(`\n  next: ${bold("npm run dev")}  →  http://127.0.0.1:6796\n`)
