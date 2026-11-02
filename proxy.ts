import { NextResponse, type NextRequest } from "next/server"

import {
  BROWSER_COOKIE,
  BROWSER_COOKIE_MAX_AGE,
  browserCookie,
  browserKey,
  sameSecret,
} from "@/lib/browser-key"

// Xiryn has no accounts: anyone who can reach the server can drive your
// agents. So it only answers on loopback, and refuses requests whose Host or
// Origin point anywhere else (which also defeats DNS-rebinding attacks from
// web pages you visit). Add hostnames to XIRYN_ALLOWED_HOSTS — comma separated —
// if you deliberately expose it, e.g. behind your own authenticating proxy.
//
// Loopback isn't only you, though: an agent's machine reaches it through
// Docker and can forge Host and Origin. So Xiryn also only answers a browser
// that was opened with its link (lib/browser-key.ts).

const LOOPBACK = ["localhost", "127.0.0.1", "[::1]", "::1"]

function allowedHosts() {
  const extra = (process.env.XIRYN_ALLOWED_HOSTS ?? "")
    .split(",")
    .map((host) => host.trim().toLowerCase())
    .filter(Boolean)
  return new Set([...LOOPBACK, ...extra])
}

function hostname(value: string) {
  // Strip the port, keeping IPv6 brackets intact
  const match = value.toLowerCase().match(/^(\[[^\]]+\]|[^:]+)(?::\d+)?$/)
  return match?.[1] ?? value.toLowerCase()
}

export function proxy(request: NextRequest) {
  const allowed = allowedHosts()
  const host = request.headers.get("host")
  if (!host || !allowed.has(hostname(host))) {
    return new NextResponse("Xiryn only answers on localhost. See XIRYN_ALLOWED_HOSTS.", {
      status: 403,
    })
  }

  // The link from the terminal: trade its key for a cookie, then drop the
  // key from the address bar
  const { key } = browserKey()
  if (request.nextUrl.pathname === "/unlock") {
    if (!sameSecret(request.nextUrl.searchParams.get("key") ?? "", key)) {
      return locked(request, true)
    }
    const response = NextResponse.redirect(new URL("/", request.url), 303)
    response.cookies.set(BROWSER_COOKIE, browserCookie(key), {
      httpOnly: true,
      sameSite: "strict",
      path: "/",
      maxAge: BROWSER_COOKIE_MAX_AGE,
    })
    response.headers.set("Cache-Control", "no-store")
    return response
  }
  if (!sameSecret(request.cookies.get(BROWSER_COOKIE)?.value ?? "", browserCookie(key))) {
    return locked(request, false)
  }

  const origin = request.headers.get("origin")
  if (origin && request.method !== "GET" && request.method !== "HEAD") {
    let originHost: string | null = null
    try {
      originHost = new URL(origin).host
    } catch {}
    if (!originHost || !allowed.has(hostname(originHost))) {
      return new NextResponse("Cross-origin request refused.", { status: 403 })
    }
  }

  return NextResponse.next()
}

const LOCKED =
  "Xiryn only opens in a browser that was given its link. Open the link Xiryn printed when it started, or run `npm run open` in the Xiryn folder."

function locked(request: NextRequest, staleLink: boolean) {
  const page =
    request.method === "GET" &&
    (request.headers.get("accept") ?? "").includes("text/html")
  if (!page) return new NextResponse(LOCKED, { status: 401 })
  return new NextResponse(lockedPage(staleLink), {
    status: 401,
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
  })
}

// Plain HTML with nothing to load: it's served before the person is let in
function lockedPage(staleLink: boolean) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Open Xiryn from its link</title>
<style>
  :root { color-scheme: light dark; --bg: #f7f7f8; --fg: #16171d; --muted: #5d6070; --line: #e3e4e8; --code: #eeeff2; --accent: #c2410c; }
  @media (prefers-color-scheme: dark) { :root { --bg: #0d0e12; --fg: #ececf1; --muted: #9a9cab; --line: #24262e; --code: #17181e; --accent: #f0a35e; } }
  * { box-sizing: border-box; }
  body { margin: 0; min-height: 100vh; display: grid; place-items: center; padding: 24px 16px; background: var(--bg); color: var(--fg); font: 15px/1.6 ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif; }
  main { width: 100%; max-width: 520px; border: 1px solid var(--line); border-radius: 16px; padding: 28px; }
  .label { font: 600 11px/1 ui-monospace, "SF Mono", Menlo, Consolas, monospace; letter-spacing: .14em; text-transform: uppercase; color: var(--accent); }
  h1 { margin: 12px 0 10px; font-size: 22px; line-height: 1.25; letter-spacing: -0.02em; }
  p { margin: 0 0 14px; color: var(--muted); }
  code { display: block; margin: 0 0 14px; padding: 12px 14px; border-radius: 10px; background: var(--code); color: var(--fg); font: 14px/1.4 ui-monospace, "SF Mono", Menlo, Consolas, monospace; }
  .why { margin: 18px 0 0; padding-top: 16px; border-top: 1px solid var(--line); font-size: 13px; }
</style>
</head>
<body>
<main>
  <div class="label">xiryn</div>
  <h1>${staleLink ? "That link is out of date" : "Open Xiryn from its link"}</h1>
  <p>${staleLink ? "Xiryn made a new key since. " : ""}Open the link Xiryn printed when it started, or run this in the Xiryn folder:</p>
  <code>npm run open</code>
  <p>This browser remembers it after that.</p>
  <p class="why">Why: your agents' machines, and any other program on this computer, can reach Xiryn's address too. The link holds a key only you can see, so only your browser can use Xiryn as you.</p>
</main>
</body>
</html>`
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg).*)"],
}
