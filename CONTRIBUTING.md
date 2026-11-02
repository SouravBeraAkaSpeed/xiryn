# Contributing to Xiryn

Thanks for wanting to make Xiryn better. This guide gets you from clone to merged pull request.

## Ground rules

- **Local-first is the product.** Changes must not add accounts, telemetry, hosted backends or any third-party service beyond the ones a user explicitly configures (model providers, Firecrawl, Telegram).
- **Agents never act on the user's machine.** Anything an agent executes runs in its own workstation container.
- **Secrets stay server-side.** The browser may only ever see masked values.
- Be kind. See the [Code of Conduct](CODE_OF_CONDUCT.md).

## Development setup

**Requirements:** Node.js 20.9+ (22 recommended — see `.nvmrc`), npm, and a key for at least one model provider.

```bash
git clone https://github.com/SouravBeraAkaSpeed/xiryn.git
cd xiryn
npm install
npm run setup        # creates .env from .env.example
npm run dev          # http://127.0.0.1:6796, opened for you the first time
npm run open         # opens Xiryn's link in your browser any time
```

You don't need Docker or a Firecrawl key to work on most of the UI; the app tells you which capabilities are off. To work on workstations, the image is built from `workstation/` (`npm run workstation:build` rebuilds it after you change it).

### Testing the Telegram bridge without a phone

The bridge honours `TELEGRAM_API_URL`, so you can point it at a local mock of the Bot API, inject updates, and inspect what the bot sends. This is how the bridge is exercised during development without spamming a real bot.

## Project layout

| Path | What lives there |
| --- | --- |
| `app/` | Routes (Next.js App Router) and the streaming turn API |
| `actions/` | Server actions — the only way the UI mutates data |
| `queries/` | Read models for server components |
| `components/` | Interface; `components/ui` holds the base primitives |
| `lib/agent/` | Runtime, tools and instruction builder |
| `lib/providers/` | Provider catalog, model factory, live model discovery |
| `lib/telegram/` | Bot API client, formatter and bridge |
| `db/` | Drizzle schema and generated migrations |
| `docs/` | User-facing guides |

A deeper tour is in [docs/architecture.md](docs/architecture.md).

## Making changes

1. **Open an issue first** for anything bigger than a small fix, so we can agree on the approach.
2. Create a branch from `main`: `feat/short-name`, `fix/short-name` or `docs/short-name`.
3. Keep changes focused. One pull request, one purpose.
4. Before pushing, run the same checks CI runs:

   ```bash
   npm run check     # typecheck + lint + format check
   npm run build
   ```

### Database changes

Edit `db/schema.ts`, then generate a migration and commit it:

```bash
npm run db:generate -- --name short_description
```

Migrations apply automatically on startup. Never edit a migration that has been released — add a new one.

### Adding a model provider

Add an entry to `lib/providers/catalog.ts`, a case to `createModel` in `lib/providers/registry.ts`, and — if it doesn't speak the OpenAI `/models` dialect — a branch in `lib/providers/discover.ts`. Document it in [docs/providers.md](docs/providers.md).

### Adding an agent tool

Tools live in `lib/agent/tools.ts`. Give each a precise description (the model reads it), validate input with zod, clip large outputs, and add a row renderer in `components/thread/tool-call.tsx` plus a label in `lib/telegram/bridge.ts`.

## Style

- TypeScript strict, no `any` unless at a boundary you can't type.
- Prettier formats everything (`npm run format`); ESLint must pass.
- Comments explain *why*, not *what*.
- UI: use the design tokens in `app/globals.css`; mono labels for metadata, hairline borders, no new colors without a reason.

## Commit messages

We use [Conventional Commits](https://www.conventionalcommits.org):

```
feat(telegram): send screenshots as photos
fix(runtime): meter tokens for interrupted turns
docs: explain auto-delete workstations
```

## Pull requests

- Fill in the template — what, why, and how you tested it.
- Include a screenshot or short clip for UI changes.
- CI must be green.
- A maintainer reviews within a few days. Small, well-described PRs merge fastest.

## Reporting security issues

Please **don't** open a public issue. Follow [SECURITY.md](SECURITY.md).

## License

By contributing, you agree that your contributions are licensed under the [MIT License](LICENSE).
