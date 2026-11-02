# AGENTS.md

Guidance for AI coding agents (and humans) working in this repository.

## Product invariants — never break these

1. **Local-first.** No accounts, no telemetry, no hosted backend. Apart from an update check against GitHub's public API (`lib/updates.ts`, switchable off), the only network calls go to services the user configured: model providers, Firecrawl, Telegram (and a Cloudflare quick tunnel for phone take-over links). Agents' machines run in Docker on the user's computer.
2. **Agents never act on the host.** Every agent tool that executes something does so in the agent's Docker workstation (`lib/workstation.ts`). Never mount host paths into it.
3. **Secrets stay on the server.** Never return a raw key from a server action or render one in a component; use `describeSetting()` which masks them.
4. **Loopback only, and only the person's browser.** Don't weaken `proxy.ts` or the browser key (`lib/browser-key.ts`): agents' machines can reach loopback through Docker.

## Installing Xiryn for someone

If you were asked to set Xiryn up rather than change it:

1. Run `XIRYN_YES=1 XIRYN_NO_START=1 ./setup.sh` (macOS, Linux) or `$env:XIRYN_YES="1"; $env:XIRYN_NO_START="1"; .\setup.ps1` (Windows). It installs Git, Node.js and Docker when missing, the packages, and the workstation image.
2. Exit code 2 means a step needs the person: show them the printed command (it needs their password) or ask them to finish the installer that opened, then run the setup again. If Docker Desktop isn't running, ask them to open it and accept its terms.
3. Ask for at least one model provider key (and optionally `FIRECRAWL_API_KEY`, `TELEGRAM_BOT_TOKEN`) and write them into `.env`. Never echo or commit them.
4. Start it with `npm run dev` and wait for http://127.0.0.1:6796 to answer. The first start opens Xiryn in their browser; otherwise run `npm run open`. The bare address only shows a "locked" page: Xiryn answers only a browser opened with its link.

## Stack

- Next.js 16 (App Router, Turbopack). Read the bundled docs in `node_modules/next/dist/docs/` before using a Next API — it differs from older versions (e.g. `proxy.ts` replaces middleware).
- AI SDK 7: `instructions` (not `system`), `isStepCount`, `onEnd`/`onStepEnd`, tool results as `{ type: "file" }`. Docs in `node_modules/ai/docs/`.
- SQLite via `better-sqlite3` + Drizzle. Queries are synchronous: use `.get()`, `.all()`, `.run()`, and `.sync()` on relational queries.
- UI primitives in `components/ui` (Base UI). Buttons rendering links need `nativeButton={false}`.

## Commands

```bash
npm run dev          # :6796; the first start opens it, `npm run open` any time
npm run check        # typecheck + lint + format check — run before finishing
npm run build
npm run db:generate  # after editing db/schema.ts; commit the migration
```

## Conventions

- Mutations go through `actions/*.ts` (`"use server"`), validated with the zod schemas exported from `db/schema.ts`.
- Reads for server components go in `queries/`.
- Settings: add new keys to the registry in `lib/config.ts`; never read `process.env` for user-configurable values elsewhere.
- Tools: add to `lib/agent/tools.ts`, render in `components/thread/tool-call.tsx`, label in `lib/telegram/bridge.ts`.
- Styling: design tokens in `app/globals.css` (`rigel` accent, `betelgeuse` secondary, `label-mono` for small caps metadata).
- Conventional Commits.

## Testing changes that call models

Model calls cost the user money. Prefer short prompts, and test integrations (Telegram, providers) against local mocks where possible.
