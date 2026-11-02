# Changelog

All notable changes to Xiryn are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses [Semantic Versioning](https://semver.org/).

## [0.7.0] — 2026-11-02

Agent computers your size, agents that only answer to you, and fixes for local models that can't see images.

### Added

- **Size each agent's computer.** Under **Machine → Size** in an agent's workbench, give it as many processors and as much memory as your computer has, and a screen from 1280×800 to 2560×1440. The machine moves to its new size the next time it starts, keeping its files. When Docker itself is allowed less, Xiryn says so; on Windows it offers to raise Docker's limit for you (it changes your WSL settings, keeps a backup and restarts Docker).
- **`npm run open`** opens Xiryn in your browser.

### Changed

- **Xiryn only answers your own browser.** It always refused other computers, but an agent's machine could reach it through Docker and pretend to be you.
  - Now Xiryn answers only a browser that was opened with its link. The link carries a key from your data folder, which no agent's machine can read, and your browser remembers it.
  - The first start opens the link for you, and every start prints it. `npm run open` opens it any time.
  - Another browser sees a page explaining this.
- **Models that can't see images get a shell, not a broken desktop.**
  - The model picker now says when a local model (Ollama, LM Studio) can't see images, before you create an agent on it.
  - An agent on such a model works through its shell and files instead of failing at its first screenshot.
  - When a provider refuses images mid-task, the error says what to do, and the agent works without the desktop from then on. ([#22](https://github.com/SouravBeraAkaSpeed/xiryn/issues/22))
- Agents no longer assume their screen is 1280×800; each screenshot says its real size.

### Fixed

- **Self-hosted Firecrawl.** "Test connection" reported a working self-hosted Firecrawl as not connected, because it asked for credits only the hosted service has. It now reads a small page instead and says "your own server". A server of your own also works without a key. ([#19](https://github.com/SouravBeraAkaSpeed/xiryn/issues/19))
- **Deleting a busy agent.** Its tasks, including any its squads were running, now stop and finish saving before anything is deleted. The records go in one step, then its machine. If Docker isn't running, you're told the machine is removed once it is. ([#7](https://github.com/SouravBeraAkaSpeed/xiryn/issues/7))

### Security

- **Web pages can't pass as your instructions.** Search results and fetched pages now reach the model marked as untrusted, in a way a page can't undo, and agents are told that only you give them orders. ([#18](https://github.com/SouravBeraAkaSpeed/xiryn/issues/18))
- **Agents' machines are kept apart.** They now share a network on which they can't reach each other, only the internet, and can't craft raw network packets. Existing machines are rebuilt at their next start, keeping their files.
- **Vault values go into web pages only.** A login, card or personal detail is typed only when the agent's browser is the focused window, never into a terminal or another app.
- **Phone take-over links close sooner.** A link now closes as soon as you hand the desktop back, instead of after 30 minutes.

**Upgrade:** `git pull && npm install`, then restart Xiryn (`npm run background -- restart` in background mode). The database migrates itself. The first start after upgrading opens Xiryn in your browser with its new link; after that, use `npm run open` or the link Xiryn prints.

## [0.6.0] — 2026-10-24

Routine history, local models on Ollama's own API, and fixes for agents that went quiet or couldn't see their screen.

### Added

- **Routine history:** each routine on the Routines page has a **History** list showing every time it came due or you ran it by hand. Each entry shows how it went (done, failed, stopped, or skipped and why: Xiryn wasn't running, or you were talking to the agent at the time), when it happened, how long it took and what it cost, plus totals. Costs come from the same ledger as the Usage page.

### Changed

- **Ollama through its own API.** Xiryn now talks to Ollama's native chat API instead of its OpenAI-style one. Every request asks for a 32K context (16K under 12 GB of memory) and keeps the model loaded for 30 minutes. Xiryn no longer changes your models, so Settings → Local models drops the context column and its fix button. `ollama/...` model names and `OLLAMA_BASE_URL` (with or without `/v1`) work as before.

### Fixed

- **No more empty replies.** When a model ends its turn with only its thinking and no answer (small local models do this), Xiryn asks it once more, tools off, for the answer.
- **Screenshots reach every model.** On OpenAI-style APIs (OpenRouter, LM Studio, Groq, Mistral, custom endpoints) an agent's screenshots used to reach the model as unreadable text. They're now sent as images in a message of their own.
- On a local model, the step that has to answer can no longer start another action: Ollama has no way to say "no tools", so that step is given none.
- A one-off routine that came due while you were talking to its agent now runs five minutes later, instead of switching itself off.
- A routine that was mid-run when Xiryn stopped is shown as failed, with the reason, instead of as never run.

### Security

- Next.js 16.4.3, which fixes critical advisories in 16.4.0 (GHSA-2464-fhr4-w9xw, GHSA-673q-mjm6-r5xr) and a denial-of-service issue. `npm audit` is clean.

## [0.5.1] — 2026-10-20

Fixes from running 0.5.0 end to end with a real Ollama on Windows.

### Fixed

- **Local models no longer lose their instructions.** Ollama runs models with a small context unless told otherwise (4K on an 8 GB graphics card) and quietly cut Xiryn's agent prompt in half, so agents forgot the question. Xiryn now saves a 32K context on the models it downloads or makes the default (16K under 12 GB of memory), checks any other Ollama model once before its first turn, and Settings → Local models shows each model's context with a one-click fix.
- `npm run background -- stop` on Windows no longer stops Ollama or Docker Desktop when Xiryn had started them; it ends only Xiryn's own processes.
- A routine's run now delivers the result instead of replying that it's scheduled, even on small local models: the agent reads each run as due now, and routines created from a chat describe one run rather than the schedule.
- `npm run setup:local` downloads the model through Ollama's API when Ollama is running but its command isn't on the PATH (a portable copy, say), instead of stopping.
- Download progress in Settings → Local models counts the whole model rather than one layer at a time.

## [0.5.0] — 2026-10-20

Routines, free local models in one command, and what every reply costs.

### Added

- **Routines:** tasks agents do on their own on a schedule — every day, on weekdays, one day a week, every few hours, or just once — in your computer's local time. Set them up on the new **Routines** page (with ideas to start from: a morning brief, job alerts, a price watch, a weekly research digest, a plan for the week), or just ask an agent in a chat: *"every weekday at 9, check…"*. Each routine posts into its own thread; you're told when a run finishes in the app, on Telegram (every run, however short) and by your desktop.
- **Agents can schedule:** new `routine_create`, `routine_list` and `routine_delete` tools. Agents now also know the local date, time and time zone.
- **Background mode:** `npm run background` runs Xiryn with no terminal or browser open (`stop`, `restart`, `status`), and `npm run background -- login` starts it whenever you log in (Windows, macOS and Linux). It serves a production build, rebuilt automatically after updates, and logs to `data/xiryn.log`.
- **Desktop notifications without a tab:** with no Xiryn tab open, the operating system shows a notification when an agent finishes or needs you. Off in **Settings → System** or with `XIRYN_DESKTOP_NOTIFY=off`.
- **Free local models in one command:** `npm run setup:local` (or `--local` on the one-line installers) installs Ollama if it's missing, downloads a model with tool calling and vision that fits your computer's memory, and makes it every agent's default.
- **Settings → Local models:** Ollama's status, your downloaded models, one-click downloads with progress (any model from ollama.com/library), and **Use as default**.
- **What it costs:** every reply shows its price — *free · local* on local models — from up-to-date prices for OpenAI, Anthropic and Gemini models, including long-context and cached-input rates. The Usage page adds spend by day, model and agent, estimates older turns, and lets you set a price for models Xiryn doesn't know.
- **Monthly budget:** set one on the Usage page or with `XIRYN_MONTHLY_BUDGET`. Once it's spent, paid models wait until the 1st; local models keep working.
- **16 ready-made agents and 4 squads:** a new **Templates** page — Atlas, Altair (shopping), Polaris (travel), Mira (errands), Capella (jobs), Sirius (writing), Antares (social), Castor (leads), Vega (research), Deneb (news), Spica (tutor), Rigel (engineering), Arcturus (code review), Electra (websites), Lyra (data) and Pollux (budgets) — plus Crew, Launch crew, Trip team and Dev team, each created in one click. A new workspace offers the starter team straight away.
- **Feedback:** after a few finished tasks, a small card asks how Xiryn is doing; answering opens a draft in your own email app to the author (nothing is sent by Xiryn). It's also in the sidebar and the command palette, next to *Report a bug on GitHub*.
- **Export a thread:** *Copy as Markdown* and *Export as Markdown* in the thread menu, with who said what, the steps agents took, and the model and cost of each reply.

## [0.4.1] — 2026-10-12

### Changed

- **The project is now called Xiryn** — [xiryn.com](https://xiryn.com), [github.com/SouravBeraAkaSpeed/xiryn](https://github.com/SouravBeraAkaSpeed/xiryn). Everything carries the new name: the app, the `XIRYN_*` settings, the database (`data/xiryn.db`), the vault, the agents' Docker machines and volumes, and the setup scripts.

### Fixed

- The update button shows on the next page load after a push. Xiryn now asks GitHub once each time the page loads, instead of when the server starts and then every few hours.
- Settings → System showed `[object Promise]` instead of the number of agents, squads, threads, messages and memories.
- Next's error badge no longer appears in the corner, and attributes that browser extensions add to the page no longer cause hydration warnings.
- An agent clearing `/tmp` on its desktop no longer shuts that desktop down or locks you out of watching it.
- A thread open in the app now follows turns started from Telegram (or by answering a payment or detail request) as they happen, instead of staying blank until you reload.
- Tables in Telegram messages arrive as readable lines (a header, then one bullet per row) instead of raw `|` pipes — including the notice when a task started at the computer finishes, which used to run the whole reply into one line.

## [0.4.0] — 2026-10-11

### Added

- **Voice typing:** a mic button in the composer. Speech is recognised by the browser — on the device where the browser supports it — and lands in the box to review before sending.
- **A phone take-over page:** Telegram hand-off links open a page made for phones, with a keyboard button that types on the agent's desktop, a key bar (Enter, Backspace, Tab, Esc, arrows, Ctrl), Paste text, a countdown and Done. On an upright phone the desktop sits above the keys, clear of the keyboard.

- **Update button:** when GitHub has commits (or a release) newer than your copy, an update button next to the logo links to the README's new Updating section. The project's star count shows there too once it's past 20. Off with `XIRYN_UPDATE_CHECK=off` or in Settings → System.

### Changed

- The desktop's password in a phone link travels after the `#`, so it never reaches the tunnel's logs, and links are sent only once their address answers.

## [0.3.0] — 2026-10-11

Agents can now sign in and pay for you — with your approval every time, and without ever seeing your details.

### Added

- **Vault:** logins, cards, UPI IDs and personal details, encrypted with AES-256-GCM. The key is held by the operating system (macOS Keychain, Windows DPAPI, the Linux Secret Service). Manage it in **Settings → Vault**.
- **Agents fill without seeing:** `vault_fill` types a saved value into the page and shows the field as dots; agents only ever get masked hints. Logins fill only on their own site.
- **Payment approvals:** before paying, an agent asks with the merchant, the amount and the site. Approve with a saved card or UPI ID, pay yourself by taking over, or decline — in the chat or with one tap on Telegram. A card only fills on the site you approved, for 20 minutes.
- **Secure requests:** when an agent needs a login, a card or a one-time code, a form appears in the chat; what you enter goes into the vault, saved or for one task. Codes can be replied to the Telegram bot; the message is deleted and the code used once.
- **Set up with a coding agent:** a prompt in the README for Claude Code, Codex or Cursor that installs everything and asks for your keys.
- **Expand the live desktop** inside Xiryn, watching only, with Fullscreen and Take over.

### Fixed

- Workstations that had stopped wouldn't start again: stale X server locks are now cleared at boot.
- macOS setup: Homebrew renamed the Docker Desktop cask; setup now installs Docker Desktop, Node.js and Git without Homebrew or a password.
- Linux setup as root, and when Docker can't be started without a password.
- Chromium no longer asks to "restore pages" after a workstation restarts.

## [0.2.0] — 2026-10-11

Agents' machines now run on your own computer, in Docker. Nothing to sign up for, nothing in the cloud, and sites see your own connection.

### Changed — breaking

- **Workstations run locally in Docker.** Each agent gets its own container — a Debian desktop with Chromium, a shell, `sudo`, Node.js and Python — built on your computer from `workstation/` and fully separate from your own files and screen. Daytona is no longer used and `DAYTONA_*` settings are ignored; new `XIRYN_WORKSTATION_*` settings set CPU, memory, auto-stop and auto-delete.

### Added

- **One-command setup** for every OS: `setup.sh` (macOS, Linux) and `setup.ps1` / `setup.cmd` (Windows) install Git, Node.js and Docker if they're missing, build the agents' desktop image and start Xiryn. `npm run setup` installs and starts Docker when asked to, and `npm run workstation:build` rebuilds the image.
- **Settings → Workstations:** Docker status with a Start button, the image build with live progress, per-agent CPU and memory limits, auto-stop, auto-delete and phone links.
- **Notifications:** a chime and a desktop notification when an agent finishes, fails or needs you, even with Xiryn in the background. Toggle them from the status bar.
- **Telegram finish notices** for tasks started at the computer that take a minute or more (`XIRYN_TELEGRAM_NOTIFY=long|all|off`). Reply to carry on.
- **Phone take-over links** through a temporary Cloudflare quick tunnel to that one desktop, closed after 30 minutes.
- Workstations stop themselves when idle even while Xiryn is closed, and machines of deleted agents are cleaned up automatically.
- **Take over:** pause the agent at any moment and use its desktop yourself, then hand it back with an optional note. The agent re-reads the screen and continues from where you left it.
- **Hand-offs:** a `request_takeover` tool lets the agent stop at logins, payments, one-time codes and CAPTCHAs and explain what's left. The take-over view opens automatically.
- **Telegram hand-off notices** with a short-lived live-desktop link that works from a phone, plus a link that opens the thread in the app. Reply to continue.
- **Delete threads** from the sidebar (hover → trash) and from the thread menu, with proper rename and delete dialogs.
- `XIRYN_URL` setting for links back into the app.

### Changed

- Agents always write their findings into the reply — every option with its details — instead of pointing at the screen, which you may not be watching.
- Every desktop action returns a screenshot of its result, so browser tasks take about half the steps.
- The last step a turn is allowed answers instead of acting, so a long task always ends with what was found and what's left.
- The desktop is 1280×800, and its browser never saves passwords or cards.
- Agents browse like a person: they open a site's home page and use its own forms instead of guessing deep links.
- Context compaction inside a turn (two screenshots and six full tool outputs kept), cutting the cost of long desktop sessions by an order of magnitude.
- `web_fetch` returns up to 12,000 characters per page.

### Fixed

- Opening the thread menu on a new thread crashed with "MenuGroupContext is missing".

### Removed

- Daytona and its SDK. Sandboxes already in a Daytona account are no longer touched; delete them from its dashboard if you like.

## [0.1.0] — 2026-10-11

The first public release.

### Added

- **Agents** with a name, role, standing orders and an optional per-agent model.
- **Workstations:** one Daytona sandbox per agent with shell, filesystem and a 1024×768 desktop; provisioned on first use, auto-stop when idle, optional auto-delete.
- **Live desktop** in the workbench via noVNC, view-only by default with a take-control toggle.
- **Long-term memory** stored locally, injected into every turn, editable from the workbench.
- **Web tools** through Firecrawl: search and page-to-markdown fetch.
- **Squads:** multi-agent threads with delegation that swaps instructions, model and workstation mid-turn.
- **Multi-provider models:** OpenAI, Anthropic, Google, xAI, Groq, Mistral, DeepSeek, OpenRouter, Ollama, LM Studio and any OpenAI-compatible API, with live model discovery.
- **Durable turns** that keep running when the tab closes and re-attach on reload; stop at any time.
- **Telegram remote access** over long-polling with QR/deep-link pairing to a single owner account.
- **Usage ledger** of tokens, steps and duration per turn, by day, model and agent.
- **Settings** for every key and option, overriding `.env`, with connection tests.
- **Security:** loopback-only server, Host/Origin guard, masked secrets.
- Constellation glyphs for agents and squads, dark and light themes, command palette (⌘K), responsive layout.

[0.7.0]: https://github.com/SouravBeraAkaSpeed/xiryn/compare/v0.6.0...v0.7.0
[0.6.0]: https://github.com/SouravBeraAkaSpeed/xiryn/compare/v0.5.1...v0.6.0
[0.5.1]: https://github.com/SouravBeraAkaSpeed/xiryn/compare/v0.5.0...v0.5.1
[0.5.0]: https://github.com/SouravBeraAkaSpeed/xiryn/compare/v0.4.1...v0.5.0
[0.4.1]: https://github.com/SouravBeraAkaSpeed/xiryn/compare/v0.4.0...v0.4.1
[0.4.0]: https://github.com/SouravBeraAkaSpeed/xiryn/compare/v0.3.0...v0.4.0
[0.3.0]: https://github.com/SouravBeraAkaSpeed/xiryn/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/SouravBeraAkaSpeed/xiryn/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/SouravBeraAkaSpeed/xiryn/releases/tag/v0.1.0
