<p align="center">
  <img src="docs/assets/banner.png" alt="Xiryn — the open-source personal agent, on your machine" width="100%">
</p>

<h1 align="center">Xiryn</h1>

<p align="center">
  <strong>The open-source personal agent. It does everything Muse, Grok Bot and Dots do — on your own computer.</strong><br>
  Each agent gets its own Linux desktop in Docker, so it works in the background and never interrupts what you're doing on your laptop.<br>
  Your data stays on your disk. Bring any model. Control it from anywhere through Telegram.
</p>

<p align="center">
  <a href="https://github.com/SouravBeraAkaSpeed/xiryn/actions/workflows/ci.yml"><img alt="CI" src="https://github.com/SouravBeraAkaSpeed/xiryn/actions/workflows/ci.yml/badge.svg?branch=main"></a>
  <a href="LICENSE"><img alt="License: MIT" src="https://img.shields.io/badge/license-MIT-7cc4ff?style=flat-square&labelColor=0b0e14"></a>
  <a href="https://github.com/SouravBeraAkaSpeed/xiryn/stargazers"><img alt="Stars" src="https://img.shields.io/github/stars/SouravBeraAkaSpeed/xiryn?style=flat-square&color=7cc4ff&labelColor=0b0e14"></a>
  <img alt="Node 20.9+" src="https://img.shields.io/badge/node-%E2%89%A520.9-7cc4ff?style=flat-square&labelColor=0b0e14">
  <a href="CONTRIBUTING.md"><img alt="PRs welcome" src="https://img.shields.io/badge/PRs-welcome-7cc4ff?style=flat-square&labelColor=0b0e14"></a>
</p>

<p align="center">
  <a href="https://xiryn.com"><strong>xiryn.com</strong></a> ·
  <a href="#quick-start">Quick start</a> ·
  <a href="#why-xiryn">Why Xiryn</a> ·
  <a href="#how-it-compares">Compare</a> ·
  <a href="docs/telegram.md">Telegram</a> ·
  <a href="docs/architecture.md">Architecture</a> ·
  <a href="CONTRIBUTING.md">Contribute</a>
</p>

<p align="center">
  <a href="https://www.producthunt.com/products/xiryn?embed=true&amp;utm_source=badge-featured&amp;utm_medium=badge&amp;utm_campaign=badge-xiryn" target="_blank" rel="noopener noreferrer"><img alt="Xiryn - The open-source personal agent that runs on your computer | Product Hunt" width="250" height="54" src="https://api.producthunt.com/widgets/embed-image/v1/featured.svg?post_id=1277481&amp;theme=light&amp;t=1791908087463"></a>
</p>

https://github.com/user-attachments/assets/e9769ff2-b9ae-426c-a47e-629910b11155

---

This year every major lab shipped a personal agent that works on a cloud machine for you — **Muse** from Meta, **Grok Bot** from xAI, **Dots** from OpenAI. They're impressive. They're also closed, gated behind subscriptions, and they run on someone else's servers with your conversations, your logins and — when they shop for you — your payment details.

**Xiryn is the same idea as an open-source personal agent you run yourself.** Clone it, add your API keys, and you have a team of agents that each own a Linux desktop in Docker — working in the background while you keep using your laptop — remember what matters, browse and research the web, write and run code, and hand work to one another. Nothing is stored anywhere but your computer, and you can message them from your phone.

**One command sets everything up** — Git, Node.js, Docker, the agents' desktop — and starts Xiryn:

```bash
# macOS / Linux
curl -fsSL https://raw.githubusercontent.com/SouravBeraAkaSpeed/xiryn/main/setup.sh | bash
```

```powershell
# Windows (PowerShell)
irm https://raw.githubusercontent.com/SouravBeraAkaSpeed/xiryn/main/setup.ps1 | iex
```

**No API key? Run it free.** Add `--local` and the same command also installs [Ollama](https://ollama.com), downloads a model that fits your computer's memory and makes it every agent's default — nothing leaves your machine, nothing is billed:

```bash
curl -fsSL https://raw.githubusercontent.com/SouravBeraAkaSpeed/xiryn/main/setup.sh | bash -s -- --local
```

```powershell
$env:XIRYN_LOCAL="1"; irm https://raw.githubusercontent.com/SouravBeraAkaSpeed/xiryn/main/setup.ps1 | iex
```

**Have a coding agent?** Paste [one prompt](#set-up-with-your-coding-agent) into Claude Code, Codex or Cursor — it installs everything, asks you for your keys and starts Xiryn.

## Why Xiryn

**🔒 Private by design.** No account, no sign-up. Conversations, memory, settings and keys live in a single SQLite file on your disk; logins and cards, if you choose to save them, live in an encrypted vault whose key your operating system holds — and agents never see them. Even the agents' machines run on your computer. The only things that leave it are the calls you configure (your model provider, plus Firecrawl or Telegram if you turn them on). Run a local model through Ollama and not even your prompts leave.

**🖥️ It never touches your computer.** Every agent works on its **own** sandboxed Linux desktop — a Docker container with a shell, files and a real Chromium — completely separate from your system. It doesn't move your mouse, take over your screen or read your files. Watch a movie, play a game or keep coding while it works. Or watch it work, live, and take the wheel whenever you want.

**📱 Control it from anywhere.** Pair Telegram in two minutes — scan a QR code and you're done. No public URL, no tunnel, no port forwarding: Xiryn polls Telegram from your machine. Your agents answer from wherever you are, with live progress and screenshots.

**🧠 Any model, your keys.** OpenAI, Anthropic, Google, xAI, Groq, Mistral, DeepSeek, OpenRouter, Ollama, LM Studio, or any OpenAI-compatible endpoint. Pick a model per agent. No subscription — you pay providers directly for what you use.

**🗑️ Disposable machines.** Reset an agent and its container is destroyed. Delete it and it's gone. Turn on auto-delete and workstations vanish after every session — while the agent's memory stays safe on your disk.

**👥 Agents that work as a team.** Put several agents in a squad. Ask any of them; they delegate to whoever fits the job — each on its own model and its own machine.

## How it compares

|  | **Xiryn** | Hosted agents<br><sub>Muse · Grok Bot · Dots</sub> | Local computer-use agents<br><sub>e.g. OpenClaw</sub> |
| --- | --- | --- | --- |
| Source | ✅ Open source (MIT) | ❌ Closed | ✅ Open source (MIT) |
| Where the agent works | Its own sandboxed desktop (Docker, on your machine) | Vendor's cloud computer | Your computer |
| Uses your mouse, screen or files | **Never** | No — vendor cloud | Yes — shell, files and apps on your machine |
| Browses from | **Your own connection** | Vendor data centers | Your own connection |
| Where your data lives | **Your disk** | Vendor's servers | Your disk |
| Account required | **No** | Yes | No |
| Card on file to shop for you | **Your choice** — encrypted on your machine, used only after you approve each payment | Stored with the vendor | Depends on setup |
| Models | **Any — 11 providers, incl. local** | The vendor's own | Many |
| Remote control | Telegram | Vendor apps & integrations | Chat apps |
| Price | **Free** + pay-as-you-go APIs | Paid plans / subscriptions | Free + APIs |

<sub>Based on public launch coverage as of October 2026. These products move fast — corrections welcome.</sub>

## Features

<table>
<tr>
<td width="50%" valign="top">

**Agents with a job**<br>
Name, role, standing orders, and a model of their own. Start from [16 ready-made agents and 4 squads](#ready-made-agents) or write your own.

**Routines — tasks on a schedule**<br>
"Every morning at 8, brief me on…" — say it in the chat or set it up on the Routines page. Daily, weekdays, weekly, every few hours, or once. It runs on its own, even with the browser closed, and tells you when it's done.

**A workstation per agent**<br>
A Docker container with a shell, a persistent home folder and a 1280×800 desktop with Chromium — created on first use, stopped when idle, never touching your own files.

**Live desktop, take over any time**<br>
Watch the agent click and type in real time. Hit **Take over** and it pauses; hand it back with a note and it picks up from what you did.

</td>
<td width="50%" valign="top">

**Long-term memory**<br>
Agents save what matters about you and your work; every thread sees it. Inspect, add or delete notes any time.

**Web research**<br>
Search and clean page reading through Firecrawl, with cited sources.

**Durable turns**<br>
Close the tab mid-task — the agent keeps going. Reopen and you're re-attached to the live stream. Stop it any time.

**It tells you when it's done**<br>
A chime and a desktop notification when an agent finishes, fails or needs you — and a Telegram message when you're away from the computer.

**Talk instead of typing**<br>
Hit the mic and speak your request. It uses your browser's speech recognition — on the device itself where the browser supports it, so your voice never leaves your computer.

**Free local models in one click**<br>
Settings → Local models shows Ollama, downloads models with a progress bar and makes one the default. Replies on local models are marked *free*.

**Know what every reply costs**<br>
Each reply shows its price; the Usage page adds it up by day, model and agent. Set a monthly budget and paid models pause when it's reached.

</td>
</tr>
</table>

<p align="center">
  <img src="docs/assets/workstation.png" alt="Atlas lists the nonstop Bengaluru to Lucknow flights it found on Google Flights, with its live desktop beside the chat" width="100%">
</p>
<p align="center">
  <img src="docs/assets/engineer.png" alt="An engineer agent writes and runs a Python script; the Machine tab shows its Docker workstation" width="49%">
  <img src="docs/assets/squad.png" alt="In a squad, the engineer delegates a writing task to the writer agent" width="49%">
</p>
<p align="center">
  <img src="docs/assets/memory.png" alt="Research with cited sources and the agent's long-term memory panel" width="49%">
  <img src="docs/assets/overview.png" alt="Overview with system check and agents" width="49%">
</p>

## What can it do?

Anything that can be done with a terminal, a browser and a desktop — while you get on with your day:

- **Build and debug** — clone a repo, install, run the tests, fix what fails, show you the diff.
- **Research** — search, read primary sources, and come back with a cited summary.
- **Write** — launch posts, docs, reports, saved as files on its workstation.
- **Work the web** — fill forms, compare options, prepare a booking or an order. When a site needs your login, a payment or a CAPTCHA, the agent **stops and hands you the screen**; your card never touches Xiryn.
- **Run as a team** — ask a squad, and the right specialist takes it.

Agents ask when they need a decision, confirm before anything irreversible, and remember what you tell them.

### You can always take the wheel

- **Take over** — one click pauses the agent and gives you its desktop. Type, click, fix what it got wrong. **Hand back** with an optional note ("I picked the 6:40 flight") and the agent looks at the screen and continues from there.
- **Hand-offs** — at a login, a payment page, a one-time code or a CAPTCHA, the agent stops by itself and tells you exactly where it is and what's left. The take-over view opens on your screen, and if Telegram is paired you get a message with a **live link to the desktop that works from your phone**. Pay on the agent's screen, reply "done", and it wraps up.
- **Browses like a person** — agents open a site's home page and use its own search forms and filters instead of guessing deep links, so you can follow along and step in at any point.

### Your vault, your approval

- **An encrypted vault** for logins, cards, UPI IDs and personal details. Add them in **Settings → Vault**, or when an agent asks, through a secure form in the chat. They're encrypted with AES-256-GCM, and the key is held by your operating system (macOS Keychain, Windows DPAPI, the Linux Secret Service) — never next to the data.
- **Agents never see the values.** An agent gets "Visa ···· 4242"; Xiryn types the card into the page itself and shows the field as dots.
- **Every payment needs your yes.** At checkout the agent asks — *"Atlas wants to pay ₹19,062 to MakeMyTrip"* — and you choose **Approve** (it pays with the card you pick), **I'll pay myself** (you take over its screen) or **Decline**, in the app or with one tap on Telegram.
- **Phishing-proof by design.** A saved login only fills on its own site; an approved card only on the site you approved.
- **Stays signed in.** Each agent's browser keeps your sessions between tasks until the site signs you out. One-time codes you reply to the Telegram bot go straight into the vault, not the chat.

> **Real browsing, from your own connection.** Agents' machines run on your computer, so sites see an ordinary home connection rather than a data center — no blocked sites, far fewer CAPTCHAs.

## Quick start

**You need:** a computer with about 4 GB of free disk, and an API key for at least one model provider. The setup installs everything else. [Firecrawl](https://www.firecrawl.dev) (fast web search) is optional.

### 1 · Set up — one command

| Your system | Run this in a terminal |
| --- | --- |
| **macOS / Linux** | `curl -fsSL https://raw.githubusercontent.com/SouravBeraAkaSpeed/xiryn/main/setup.sh \| bash` |
| **Windows** (PowerShell) | `irm https://raw.githubusercontent.com/SouravBeraAkaSpeed/xiryn/main/setup.ps1 \| iex` |

Already cloned the repo? Run `./setup.sh` on macOS/Linux, or double-click **`setup.cmd`** on Windows.

The setup asks once, then does the rest:

1. Installs what's missing — **Git**, **Node.js**, and **Docker** (Docker Desktop through `winget` on Windows or Homebrew on macOS; Docker Engine through `get.docker.com` on Linux).
2. Clones Xiryn into `./xiryn` and installs its packages.
3. Starts Docker and builds the agents' desktop image — a few minutes, once.
4. Creates `.env` and starts Xiryn at **<http://127.0.0.1:6796>**.

> The first time, Docker Desktop may ask you to accept its terms, and on Windows it can ask for a restart to turn on WSL 2. Afterwards run the setup again; it skips everything that's already done.

### Set up with your coding agent

Using Claude Code, Codex, Cursor or another coding agent? Paste this prompt into it. It installs everything, asks you for your keys and starts Xiryn:

```text
Install and start Xiryn for me — the open-source personal agent that runs on my own computer: https://github.com/SouravBeraAkaSpeed/xiryn

1. From my home folder, run Xiryn's setup without prompts. It clones Xiryn into ./xiryn (or reuses it), installs Git, Node.js and Docker if they're missing, installs the packages and builds the agents' desktop image, which takes several minutes the first time — let it finish:
   - macOS / Linux:  curl -fsSL https://raw.githubusercontent.com/SouravBeraAkaSpeed/xiryn/main/setup.sh | XIRYN_YES=1 XIRYN_NO_START=1 bash
   - Windows (PowerShell):  $env:XIRYN_YES="1"; $env:XIRYN_NO_START="1"; irm https://raw.githubusercontent.com/SouravBeraAkaSpeed/xiryn/main/setup.ps1 | iex
   (If you'd rather not pipe a script, clone the repo and run ./setup.sh or .\setup.ps1 inside it with the same two variables.)
   - If it stops and shows a command that needs my password, show me that command, wait for me to run it in my own terminal, then run the setup again.
   - If Docker Desktop was just installed or isn't running, ask me to open it and accept its terms (Windows may also ask for a restart). Wait until `docker info` works, then run the setup again.
   - Node.js may have been installed into ~/.xiryn/node/bin; add that to PATH in your shell if `node` isn't found.

2. Ask me for my keys. Explain each in one sentence with where to get it, and let me skip the optional ones:
   - Required, at least one model provider: OpenAI (OPENAI_API_KEY, platform.openai.com/api-keys), Anthropic (ANTHROPIC_API_KEY, console.anthropic.com), Google Gemini (GOOGLE_GENERATIVE_AI_API_KEY, aistudio.google.com/apikey) — or any other provider listed in .env.example, including a local Ollama or LM Studio.
   - Optional: FIRECRAWL_API_KEY (firecrawl.dev) for fast web search.
   - Optional: TELEGRAM_BOT_TOKEN to talk to my agents from my phone. Tell me how to get it: in Telegram, message @BotFather, send /newbot, choose a name and a username ending in "bot", and copy the token it replies with.
   Put what I give you into the matching lines of xiryn/.env. Never repeat the keys back to me, log them or commit .env.

3. Start Xiryn with `npm run dev` inside the xiryn folder, in the background. Wait until http://127.0.0.1:6796 responds, then open it in my browser.

4. Finish with a short summary: what got installed, which keys are set, how to start Xiryn next time (cd xiryn && npm run dev), and — if I added a Telegram token — that I should open Settings → Remote access in Xiryn and scan the QR code with my phone to pair it.
```

<details>
<summary>Prefer to do it by hand?</summary>

Install [Node.js 20.9+](https://nodejs.org) and [Docker](https://docs.docker.com/get-started/get-docker/), then:

```bash
git clone https://github.com/SouravBeraAkaSpeed/xiryn.git
cd xiryn
npm install
npm run setup     # checks Docker, builds the agents' desktop image, creates .env
npm run dev
```

</details>

### 2 · Add a key

Paste a model provider key into **Settings** in the app — or put it in `.env`:

```bash
OPENAI_API_KEY=sk-...          # or any other provider
FIRECRAWL_API_KEY=fc-...       # optional: web search & reading
```

<details>
<summary>No key? Use free local models instead</summary>

In the Xiryn folder, run:

```bash
npm run setup:local
```

It installs [Ollama](https://ollama.com) if it's missing (asking first), downloads a model with tool calling and vision that fits your memory — `qwen3.5:2b` under 12 GB, `qwen3.5:4b` under 20 GB, `qwen3.5:9b` under 40 GB, `qwen3.6:27b` above — and makes it the default. Pick one yourself with `npm run setup -- --local --model=gemma4:e4b`, or download more later in **Settings → Local models**. Local models are slower and less capable than the big hosted ones, but they cost nothing and nothing leaves your computer.

</details>

### 3 · Start it any time

```bash
cd xiryn
npm run dev                    # or: npm run build && npm start
```

Open **<http://127.0.0.1:6796>** and deploy your first agent. Prefer containers all the way down? `docker compose up -d` runs Xiryn itself in Docker too.

Click **alerts** in the status bar once to allow desktop notifications: you'll hear a chime and get a notification whenever an agent finishes, fails or needs you — even with Xiryn in the background.

### Keep it running in the background

```bash
npm run background              # starts Xiryn with no terminal or browser needed
npm run background -- login     # …and whenever you log in to this computer
npm run background -- stop      # stop it (status, restart and no-login work too)
```

It serves a production build on 127.0.0.1, built once and again after each update, and logs to `data/xiryn.log`. Agents, routines and Telegram keep working with every window closed; with no Xiryn tab open, your computer itself shows a notification when an agent finishes or needs you.

## Updating

When something new is pushed, an **update** button appears next to the Xiryn logo; it brings you here.

```bash
cd xiryn
git pull
./setup.sh        # Windows: setup.cmd
```

`setup` installs any new packages and rebuilds the agents' desktop image if it changed (each agent's machine moves to it the next time it starts, keeping its files). Then start Xiryn as usual with `npm run dev`.

<details>
<summary>Running Xiryn in Docker?</summary>

```bash
cd xiryn
git pull
docker compose up -d --build
```

</details>

Your data — `data/xiryn.db`, the vault and the agents' home folders — is untouched by updates.

## Remote control from Telegram

<img src="docs/assets/telegram.png" alt="Telegram remote access setup in Settings" width="100%">

1. In Telegram, message **@BotFather** → `/newbot` → copy the token.
2. Paste it in **Settings → Remote access**.
3. Scan the QR code with your phone and tap **Start**.

Done — only your account can use the bot.

```
/agents   pick an agent or squad      /new     start a fresh thread
/stop     interrupt the agent         /status  what's running
```

When an agent needs you — a payment, a login, a code — the bot pings you with a live link to the agent's desktop. Finish the step from your phone, reply "done", and the agent carries on. Longer tasks you started at your computer report back here too when they finish, so you can walk away.

Full walkthrough: **[docs/telegram.md](docs/telegram.md)**.

## Routines

Tasks your agents do on their own, on a schedule — while you sleep, with the browser closed.

- **Just ask.** Tell any agent *"every weekday at 9, check for new jobs that fit me"* or *"tomorrow at 7, remind me to call the bank"* — it schedules the routine itself. Ask it to list or cancel them the same way.
- **Or set it up** on the **Routines** page: who does it, what to do each time, and when — every day, weekdays, one day a week, every few hours, or just once. Start from ideas like a morning news brief, job alerts, a price watch, a weekly research digest or a plan for the week.
- **Results come to you.** Each routine has its own thread. When a run finishes you get an in-app notification, a desktop notification when no tab is open, and a Telegram message if it's paired — reply there to follow up.
- **Runs on your computer.** Times are your computer's local time, and Xiryn has to be running: `npm run background -- login` keeps it that way. A run missed while the computer slept still happens if it's back within a few hours.

## Ready-made agents

Open **Templates** in the sidebar, pick one, and change anything before it goes online. Each gets its own desktop and memory.

| | Agents |
| --- | --- |
| **Everyday** | **Atlas** — operator for anything that needs a real browser · **Altair** — shopping scout that compares prices and buys with your OK · **Polaris** — travel planner for flights, stays and day-by-day plans · **Mira** — personal assistant for forms, bookings and errands |
| **Work** | **Capella** — job hunter that finds roles and tailors applications · **Sirius** — writer for posts, emails and docs in your voice · **Antares** — social media manager · **Castor** — lead researcher that builds outreach lists |
| **Research** | **Vega** — research analyst with sources · **Deneb** — news briefer for the topics you follow · **Spica** — tutor that explains step by step |
| **Build** | **Rigel** — software engineer · **Arcturus** — code reviewer · **Electra** — website builder · **Lyra** — data analyst · **Pollux** — budget keeper for bank CSVs |

**Squads in one click:** *Crew* (Atlas, Vega, Rigel, Lyra), *Launch crew* (Vega, Sirius, Antares), *Trip team* (Polaris, Altair, Mira) and *Dev team* (Rigel, Arcturus, Electra).

## Feedback

After a few finished tasks Xiryn asks, once, how it's going. Your answer opens a draft in **your own email app** to [souravberaofficial@gmail.com](mailto:souravberaofficial@gmail.com) — nothing is sent by Xiryn itself. You can also write any time from the mail icon in the sidebar, or [open an issue](https://github.com/SouravBeraAkaSpeed/xiryn/issues/new/choose).

## Architecture

```mermaid
graph LR
    you([You · browser]) -->|localhost| app
    phone([You · Telegram]) -.->|Bot API| tg[Telegram]
    tg -.->|long-poll from your machine| app

    subgraph machine [Your computer]
        app[Xiryn · Next.js server]
        app --> runtime[Agent runtime]
        app --> db[(SQLite · data/xiryn.db)]
        runtime --> db
        runtime -->|docker| ws[Workstations · one container per agent]
    end

    runtime -->|your key| llm[Model provider]
    runtime -.->|your key, optional| firecrawl[Firecrawl]
    you -->|live desktop · noVNC on 127.0.0.1| ws
```

One process, one file. The Next.js server serves the UI, runs agent turns in-process through the [AI SDK](https://ai-sdk.dev), and owns the SQLite database — no queue, no worker, no backend of ours. Details in **[docs/architecture.md](docs/architecture.md)**.

| Path | What lives there |
| --- | --- |
| `lib/agent/` | Runtime, tool belt, instruction builder |
| `lib/providers/` | Provider catalog, model factory, live model discovery |
| `lib/telegram/` | Bot API client, formatter and the bridge |
| `lib/workstation.ts`, `lib/docker.ts`, `workstation/` | Agents' machines: containers, desktop control and the image they run |
| `lib/web.ts` | Firecrawl |
| `db/` | Drizzle schema and migrations |
| `app/`, `components/` | The interface |

## Configuration

Every setting can come from `.env` **or** from **Settings** in the app. Values saved in the app win, are stored only in `data/xiryn.db`, and are shown back to the browser masked. The annotated list is in [`.env.example`](.env.example); providers are covered in [docs/providers.md](docs/providers.md).

| Variable | Purpose |
| --- | --- |
| `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GOOGLE_GENERATIVE_AI_API_KEY`, `XAI_API_KEY`, `GROQ_API_KEY`, `MISTRAL_API_KEY`, `DEEPSEEK_API_KEY`, `OPENROUTER_API_KEY`, `OPENCODE_API_KEY` | Hosted model providers |
| `OLLAMA_BASE_URL`, `LMSTUDIO_BASE_URL`, `CUSTOM_BASE_URL` | Local runtimes and any OpenAI-compatible API |
| `XIRYN_DEFAULT_MODEL`, `XIRYN_MAX_STEPS` | Default `provider/model`, max tool calls per turn |
| `XIRYN_MONTHLY_BUDGET` | Dollars a month for paid models; once spent they wait for the 1st (local models keep working) |
| `XIRYN_WORKSTATION_CPUS`, `XIRYN_WORKSTATION_MEMORY_GB` | Limits for each agent's machine (default 2 CPUs, 4 GB) |
| `XIRYN_WORKSTATION_AUTO_STOP_MINUTES`, `XIRYN_WORKSTATION_AUTO_DELETE_MINUTES` | Idle stop; disposable machines |
| `XIRYN_PHONE_TAKEOVER` | `off` leaves the phone link out of Telegram hand-offs |
| `FIRECRAWL_API_KEY` | Web search and reading |
| `TELEGRAM_BOT_TOKEN`, `TELEGRAM_OWNER_ID` | Remote access |
| `XIRYN_TELEGRAM_NOTIFY` | Telegram notice when a task finishes: `long` (a minute or more, default), `all` or `off` |
| `XIRYN_DATA_DIR`, `XIRYN_ALLOWED_HOSTS` | Data location; extra hostnames behind your own proxy |
| `XIRYN_URL` | Where you open Xiryn, for links in Telegram hand-offs |
| `XIRYN_UPDATE_CHECK` | `off` stops the update check and star count |
| `XIRYN_DESKTOP_NOTIFY` | `off` stops operating-system notifications when no Xiryn tab is open |

## Security & privacy

Xiryn has no user accounts, so it's built never to be reachable by anyone but you:

- Binds to **127.0.0.1** only, and refuses any request whose `Host` or `Origin` isn't loopback — which also blocks DNS-rebinding attacks from web pages you visit.
- API keys never reach the browser; the UI only sees masked values, and keys are kept out of logs.
- Telegram answers exactly **one** paired account; pairing codes are single-use and rotate after wrong guesses.
- Agents execute only inside their own containers — never on your desktop or in your files. Their browsers have password saving and card autofill switched off.
- Saved logins, cards and personal details are encrypted (AES-256-GCM) with a key your operating system's keychain holds. Agents get masked hints only; Xiryn types values into pages itself, logins only on their own site, payment details only after you approve that payment.
- Each live desktop is published on 127.0.0.1 only and asks for its own random password.
- No telemetry. No analytics. The only request Xiryn makes on its own is an update check against GitHub's public API when you open Xiryn, sending nothing about you. Switch it off in **Settings → System** or with `XIRYN_UPDATE_CHECK=off`.

See [SECURITY.md](SECURITY.md) for the full model and how to report a vulnerability.

## FAQ

**Does an agent control my computer?**
No. Everything an agent does — commands, files, mouse, keyboard, browser — happens inside its own Docker container: a separate Linux system with its own desktop and files. It can't see your screen, files or apps, so you keep using your computer normally. It does share your CPU and memory while it works; the limits are in Settings.

**Can it book a flight or order something?**
It can do the legwork on real websites — search, compare, fill in the details — and it will ask before anything irreversible. Payments always need your approval: the agent shows you the merchant, the amount and the site, and you either let it pay with a card or UPI ID from your vault, or take over its screen and pay yourself — in the app or from your phone through Telegram. Logins work the same way: a saved login is filled for it, or you sign in on its screen once and the session stays.

**How do I delete a thread?**
Hover it under **Recent threads** in the sidebar and click the trash icon, or open the thread menu (⋯) in its header → **Delete thread**. The agent, its memory and its workstation stay.

**Where is my data?**
In `data/xiryn.db` on your disk. Back it up by copying the file; erase everything by deleting it.

**Does it work without Docker or Firecrawl?**
Without Docker, agents chat, remember and (with Firecrawl) research, but can't run code or use a desktop. Without Firecrawl, they search and read the web with their own browser. The app tells you what's missing.

**Can I use only local models?**
Yes — `npm run setup:local` sets up Ollama and a model in one go, or use **Settings → Local models**. LM Studio works too: point `LMSTUDIO_BASE_URL` at it and pick a model with tool calling.

**Does it keep working when I close the browser?**
Yes. Agents run in the Xiryn server, not the page: close the tab mid-task and it carries on. Run `npm run background` and you can close the terminal too; routines run on time and you're notified when they finish.

**What does it cost?**
Xiryn is free and MIT-licensed. Agents' machines run on your own computer, so they cost nothing, and so do local models. Your model provider (and Firecrawl, if you use it) bill you directly: every reply shows what it cost, the **Usage** page adds it up per day, model and agent, and an optional monthly budget pauses paid models when it's reached.

## Roadmap

Ideas we're exploring — not shipped yet. Have opinions? [Open an issue](https://github.com/SouravBeraAkaSpeed/xiryn/issues/new/choose).

- [x] Scheduled and recurring tasks — [routines](#routines)
- [ ] More remote channels: WhatsApp, Discord, Slack
- [ ] MCP connectors for email, calendar and docs
- [ ] Voice in and out
- [ ] Shareable agent templates (16 built in today)

## Contributing

Contributions are welcome — from typo fixes to new providers. Start with **[CONTRIBUTING.md](CONTRIBUTING.md)**, and please follow the [Code of Conduct](CODE_OF_CONDUCT.md).

```bash
npm run check    # typecheck + lint + format
npm run build
```

## Star history

<a href="https://star-history.com/#SouravBeraAkaSpeed/xiryn&Date">
  <img src="https://api.star-history.com/svg?repos=SouravBeraAkaSpeed/xiryn&type=Date" alt="Star history" width="100%">
</a>

## Author

Built by **[Sourav Bera](https://souravbera.vercel.app)**.
If Xiryn is useful to you, a ⭐ helps other people find it.

## License

[MIT](LICENSE) © 2026 Sourav Bera

<sub>Muse, Grok Bot, Dots and OpenClaw are trademarks of their respective owners. Xiryn is an independent project and is not affiliated with or endorsed by Meta, xAI, OpenAI or the OpenClaw project.</sub>
