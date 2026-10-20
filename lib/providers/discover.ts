import { getProviderMeta, type ProviderId } from "@/lib/providers/catalog"
import { opencodeUrls } from "@/lib/providers/opencode"
import { getProviderCredentials } from "@/lib/providers/registry"

export type DiscoveredModel = { id: string; label?: string }

// Model ids that are clearly not chat models: embeddings, speech, images…
// (Jev is OpenCode's SystemOne model: structured decisions, not conversation)
const NON_CHAT =
  /(embed|whisper|tts|transcri|dall-e|image|audio|realtime|moderation|davinci|babbage|search|rerank|live|guard|sora|veo|imagen|lyria|speech|translate|jev)/i

async function getJson(url: string, init: RequestInit) {
  const response = await fetch(url, {
    ...init,
    signal: AbortSignal.timeout(10_000),
    cache: "no-store",
  })
  if (!response.ok) {
    const body = await response.text().catch(() => "")
    throw new Error(
      `${response.status} ${response.statusText}${body ? ` — ${body.slice(0, 200)}` : ""}`
    )
  }
  return response.json()
}

// Asks the provider which models this key can use. Most speak the OpenAI
// `/models` dialect; Anthropic and Google have their own.
export async function discoverModels(id: ProviderId): Promise<DiscoveredModel[]> {
  const meta = getProviderMeta(id)
  if (!meta) throw new Error("Unknown provider")
  const { apiKey, baseUrl } = getProviderCredentials(id)
  const base = (baseUrl || meta.defaultBaseUrl).replace(/\/+$/, "")
  if (!base) throw new Error(`${meta.name} has no endpoint configured.`)
  if (meta.requiresKey && !apiKey) throw new Error(`${meta.name} has no API key.`)

  if (id === "anthropic") {
    const json = await getJson(`${base}/models?limit=100`, {
      headers: { "x-api-key": apiKey!, "anthropic-version": "2023-06-01" },
    })
    return (json.data as { id: string; display_name?: string }[]).map((m) => ({
      id: m.id,
      label: m.display_name,
    }))
  }

  if (id === "google") {
    const json = await getJson(`${base}/models?pageSize=200`, {
      headers: { "x-goog-api-key": apiKey! },
    })
    return (
      json.models as {
        name: string
        displayName?: string
        supportedGenerationMethods?: string[]
      }[]
    )
      .filter((m) => m.supportedGenerationMethods?.includes("generateContent"))
      .map((m) => ({ id: m.name.replace(/^models\//, ""), label: m.displayName }))
      .filter((m) => !NON_CHAT.test(m.id))
  }

  // OpenCode lists models at {root}/v1/models, one level above its
  // OpenAI-compatible chat endpoint (…/openai/v1 or a compact alias)
  const modelsUrl =
    id === "opencode" ? `${opencodeUrls(base).models}/models` : `${base}/models`
  const json = await getJson(modelsUrl, {
    headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : {},
  })
  const list = (json.data ?? json.models ?? []) as { id: string; name?: string }[]
  return list
    .map((m) => ({ id: m.id, label: m.name && m.name !== m.id ? m.name : undefined }))
    .filter((m) => !NON_CHAT.test(m.id))
    .sort((a, b) => b.id.localeCompare(a.id, "en", { numeric: true }))
}
