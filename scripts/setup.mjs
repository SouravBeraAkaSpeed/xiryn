#!/usr/bin/env node
// First-run helper. Checks Node, creates .env from the template, gets Docker
// installed and running (asking first), builds the agent workstation image,
// and tells you which keys are still missing. Never prints a key's value.
//
//   npm run setup                     everything
//   npm run setup -- --yes            don't ask before installing or starting Docker
//   npm run setup -- --skip-docker    leave Docker alone
//   npm run workstation:build         only (re)build the workstation image

import { spawn, spawnSync } from "node:child_process"
import { createHash } from "node:crypto"
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync } from "node:fs"
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

const providers = [
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
  providers.length
    ? ok(
        `model provider${providers.length > 1 ? "s" : ""}: ${providers.map((k) => k.replace(/_(API_KEY|BASE_URL)$/, "").toLowerCase()).join(", ")}`
      )
    : warn("no model provider yet — add one key to .env (or later in Settings)")
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
