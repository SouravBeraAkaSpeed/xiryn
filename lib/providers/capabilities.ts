import { getSetting } from "@/lib/config"
import { ollamaRoot } from "@/lib/ollama"
import { getProviderMeta, parseModelSpec } from "@/lib/providers/catalog"

// Whether a model can see images. Every desktop action answers with a
// screenshot, so an agent on a model that can't see them fails the first
// time it looks at its screen. Local runtimes can say what a model takes
// (Ollama's /api/show, LM Studio's /api/v0/models); hosted providers can't,
// so there the answer is null until a turn finds out the hard way.

const TTL = 5 * 60_000

type Sight = boolean | null

const globalForSight = globalThis as unknown as {
  xirynSight?: Map<string, { at: number; sees: Sight; learned?: boolean }>
}
const cache = (globalForSight.xirynSight ??= new Map())

async function getJson(url: string, init: RequestInit = {}) {
  const response = await fetch(url, {
    ...init,
    signal: AbortSignal.timeout(4000),
    cache: "no-store",
  })
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`)
  return response.json()
}

async function ollamaSight(model: string): Promise<Sight> {
  const json = (await getJson(`${ollamaRoot()}/api/show`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ model }),
  })) as { capabilities?: string[] }
  // Older Ollama versions don't say
  return Array.isArray(json.capabilities) ? json.capabilities.includes("vision") : null
}

async function lmStudioSight(model: string): Promise<Sight> {
  const base = (
    getSetting("provider.lmstudio.baseUrl") ?? getProviderMeta("lmstudio")!.defaultBaseUrl
  )
    .replace(/\/+$/, "")
    .replace(/\/v1$/, "")
  const json = (await getJson(`${base}/api/v0/models`)) as {
    data?: { id: string; type?: string }[]
  }
  const found = json.data?.find((entry) => entry.id === model)
  if (!found?.type) return null
  return found.type === "vlm"
}

// True, false, or null when nobody can tell
export async function modelSight(spec: string): Promise<Sight> {
  const cached = cache.get(spec)
  if (cached && (cached.learned || Date.now() - cached.at < TTL)) return cached.sees
  const parsed = parseModelSpec(spec)
  let sees: Sight = null
  try {
    if (parsed?.provider === "ollama") sees = await ollamaSight(parsed.model)
    else if (parsed?.provider === "lmstudio") sees = await lmStudioSight(parsed.model)
  } catch {
    // The runtime isn't answering; the turn will say so itself
  }
  cache.set(spec, { at: Date.now(), sees })
  return sees
}

// What's known without asking, for decisions made mid-turn
export function knownSight(spec: string): Sight {
  return cache.get(spec)?.sees ?? null
}

// A provider refused images from this model: remember it until restart
export function learnedBlind(spec: string) {
  cache.set(spec, { at: Date.now(), sees: false, learned: true })
}

// Providers word it differently: "does not support image inputs", "image
// input is not supported", "No endpoints found that support image input"…
const IMAGE_REFUSAL =
  /(does ?n[o']t|not|no endpoints?[\w ]*) support[\w ]* image|image[\w ]* (input|content)?[\w ]*(is|are)? not supported|vision is not supported|not a multimodal|unsupported[\w ]* image|missing data required for image/i

export function isImageRefusal(message: string) {
  return IMAGE_REFUSAL.test(message)
}
