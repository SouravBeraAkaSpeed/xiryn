import { getSetting } from "@/lib/config"

// Web access goes through Firecrawl: search returns ranked results, fetch
// returns any page as clean markdown. Both are off until Firecrawl is set
// up: a key for the hosted service, or the address of your own server.

const CLOUD = "https://api.firecrawl.dev"

function firecrawlBase() {
  return (getSetting("firecrawl.apiUrl") ?? CLOUD).replace(/\/+$/, "")
}

// A server of your own may run without keys
function isSelfHosted() {
  return firecrawlBase() !== CLOUD
}

export function isWebConfigured() {
  return !!getSetting("firecrawl.apiKey") || isSelfHosted()
}

async function firecrawl<T>(
  path: string,
  init: { method?: string; body?: unknown } = {}
) {
  const apiKey = getSetting("firecrawl.apiKey")
  if (!apiKey && !isSelfHosted()) {
    throw new Error(
      "Web access is off: add FIRECRAWL_API_KEY to .env or paste a key in Settings → Integrations."
    )
  }
  const response = await fetch(`${firecrawlBase()}${path}`, {
    method: init.method ?? "POST",
    headers: {
      ...(apiKey && { Authorization: `Bearer ${apiKey}` }),
      "Content-Type": "application/json",
    },
    body: init.body ? JSON.stringify(init.body) : undefined,
    signal: AbortSignal.timeout(60_000),
    cache: "no-store",
  })
  const json = (await response.json().catch(() => null)) as {
    success: boolean
    data?: T
    error?: string
  } | null
  if (!response.ok || !json?.success) {
    throw new Error(
      json?.error ?? `Firecrawl answered ${response.status} ${response.statusText}`
    )
  }
  return json.data as T
}

const clip = (text: string, max: number) =>
  text.length <= max
    ? text
    : `${text.slice(0, max)}\n… ${text.length - max} more characters`

export async function webSearch(query: string, limit = 5) {
  const data = await firecrawl<{
    web?: { url: string; title?: string; description?: string }[]
  }>("/v2/search", { body: { query, limit } })

  return (data.web ?? []).map((result) => ({
    title: result.title ?? result.url,
    url: result.url,
    snippet: clip((result.description ?? "").replace(/\s+/g, " ").trim(), 400),
  }))
}

export async function webFetch(url: string, maxChars = 12_000) {
  const data = await firecrawl<{
    markdown?: string
    metadata?: { title?: string; sourceURL?: string; statusCode?: number }
  }>("/v2/scrape", { body: { url, formats: ["markdown"], onlyMainContent: true } })

  return {
    url: data.metadata?.sourceURL ?? url,
    title: data.metadata?.title ?? null,
    status: data.metadata?.statusCode ?? null,
    markdown: clip(data.markdown ?? "", maxChars),
  }
}

// Used by Settings to prove Firecrawl answers. The hosted service has a free
// call that reports credits; a server of your own has no credits to report
// (and no such call), so it reads a small page instead.
export async function pingFirecrawl() {
  if (isSelfHosted()) {
    await firecrawl("/v2/scrape", {
      body: { url: "https://example.com", formats: ["markdown"] },
    })
    return { selfHosted: true, remainingCredits: null, planCredits: null }
  }
  const data = await firecrawl<{ remainingCredits?: number; planCredits?: number }>(
    "/v2/team/credit-usage",
    { method: "GET" }
  )
  return {
    selfHosted: false,
    remainingCredits: data.remainingCredits ?? null,
    planCredits: data.planCredits ?? null,
  }
}
