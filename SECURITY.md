# Security Policy

Xiryn runs AI agents with real capabilities — shell access in sandboxed containers, web access, a remote-control bridge — on people's own machines. Security reports are taken seriously.

## Supported versions

| Version | Supported |
| --- | --- |
| `main` | ✅ |
| Latest release | ✅ |
| Older releases | ❌ — please upgrade |

## Reporting a vulnerability

**Please do not open a public issue.**

Use GitHub's private reporting: **Security → Report a vulnerability** on [the repository](https://github.com/SouravBeraAkaSpeed/xiryn/security/advisories/new). If that isn't possible, contact the maintainer through <https://souravbera.vercel.app>.

Include what you can:

- A description of the issue and its impact
- Steps to reproduce, or a proof of concept
- Affected version or commit
- Any suggested fix

You'll get an acknowledgement within **72 hours** and a first assessment within **7 days**. Fixes are released as soon as they're ready, and reporters are credited unless they prefer otherwise.

## Security model

Understanding what Xiryn protects — and what it doesn't — helps you judge a finding.

**What Xiryn defends**

- **Network exposure.** The server binds to `127.0.0.1`. Requests whose `Host` or `Origin` isn't loopback (or listed in `XIRYN_ALLOWED_HOSTS`) are refused, which also blocks DNS-rebinding attacks from websites you visit.
- **Only your browser.** Loopback isn't only you: a container reaches the host's loopback through Docker (`host.docker.internal`), with any `Host` header it likes. So Xiryn answers only a browser that was opened with its link.
  - The link carries a random key kept in `data/browser.key`, which is never mounted into a container. The browser trades it once for an `HttpOnly`, `SameSite=Strict` cookie derived from the key.
  - Every other request gets a 401 and a page explaining `npm run open`.
  - The live-desktop viewer connects under the other loopback name (`localhost` when Xiryn is open on `127.0.0.1`, and the other way round), so the cookie is never sent to an agent's machine.
- **Secret handling.** API keys and the Telegram token are read only on the server. The browser receives masked values; server-action argument logging is disabled.
- **Remote access.** The Telegram bridge answers exactly one paired account. Pairing codes are single-use and rotate after repeated wrong guesses.
- **Host isolation.** Agent tools execute inside each agent's own Docker container, with no access to your files, desktop or other containers' data. Nothing from your machine is mounted into it. The agent's user has `sudo` inside its own container, and only there.
- **Agents kept apart.** Workstations share the `xiryn-workstations` network, on which containers can't reach each other (`enable_icc=false`), only the internet. They run with `--cap-drop NET_RAW`, so they can't craft raw packets. Machines made before this are rebuilt at their next start, keeping their home folders.
- **The vault.** Logins, cards, UPI IDs and personal details are encrypted with AES-256-GCM, each entry bound to its id. The key is kept by the operating system (macOS Keychain, Windows DPAPI, the Linux Secret Service), or, where none is available, in a file readable only by you outside the data folder. The browser receives masked hints only. Values reach a page by being typed into the agent's browser from stdin — never through a model, a log or a tool result — and the field is then shown as dots. Values are only typed when the agent's browser is the focused window, never into a terminal or another app. A login only fills on its own site; a card or UPI ID only after the person approved that payment in that thread, on the site it was approved on, for 20 minutes.
- **Live desktops.** Each container's noVNC port is published on `127.0.0.1` only and protected by a random per-container password that only the Xiryn server hands to your browser. Phone take-over links (Telegram hand-offs) open a temporary Cloudflare quick tunnel to that one desktop; it closes after 30 minutes or as soon as you hand the desktop back, and the link carries the password — treat it as a secret, or turn the feature off with `XIRYN_PHONE_TAKEOVER=off`.

**What is out of scope or your responsibility**

- **No accounts by design.** The browser key keeps other programs on your computer out. It isn't a login: if you expose Xiryn beyond localhost, put it behind your own authenticating proxy. Doing so without one is a misconfiguration, not a vulnerability.
- **Model behavior.** Agents act on instructions, and content they read (web pages, files) can contain prompt injections. Xiryn hands web results to the model inside `<untrusted>` markers that a page can't close early, and tells it that only the person gives orders. That makes injections harder, not impossible. Workstations limit the blast radius to the agent's container — which can still reach the internet, from your connection — but treat agent output — and anything it does with credentials you give it — with care.
- **Third-party services.** Prompts go to the model provider you configure; Telegram messages pass through Telegram; phone take-over links pass through Cloudflare. Their security is governed by those providers.
- **What the vault can't do.** A value typed into a page is in that page, and the agent controls the browser it's in. The vault keeps secrets out of the model's context and out of Xiryn's records, and makes their use deliberate and approved; it doesn't make a compromised agent harmless. Approve payments you recognise.
- **Container isolation itself.** Workstations rely on Docker's isolation. A container escape is a Docker issue — report it to Docker — unless Xiryn's configuration (mounts, capabilities, published ports) made it possible.
- **Local data at rest.** `data/xiryn.db`, `.env` and the agents' home-folder volumes are protected by your operating system's account security.

## Hardening tips

- Keep Xiryn updated.
- Use a dedicated, scoped API key per provider and set spending limits in their dashboards.
- Set `XIRYN_WORKSTATION_AUTO_DELETE_MINUTES` if you want workstations to be disposable.
- Don't give agents credentials they don't need.
