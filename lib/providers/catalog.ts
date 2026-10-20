// Every model provider Xiryn can talk to. Client-safe: no keys, no SDKs.

export type ProviderId =
  | "openai"
  | "anthropic"
  | "google"
  | "xai"
  | "groq"
  | "mistral"
  | "deepseek"
  | "openrouter"
  | "opencode"
  | "ollama"
  | "lmstudio"
  | "custom"

export type ProviderMeta = {
  id: ProviderId
  name: string
  // Where keys come from in .env; null when the provider takes none
  keyEnv: string | null
  // Overrides the default endpoint, e.g. for a proxy or a local server
  baseUrlEnv: string
  defaultBaseUrl: string
  // Whether calls fail without a key
  requiresKey: boolean
  // Whether the provider must be given an endpoint to be usable
  requiresBaseUrl?: boolean
  // Runs on this machine; nothing leaves it
  local?: boolean
  keysUrl?: string
  // Shown under the endpoint field in Settings, for providers worth a sentence
  note?: string
  // A few known-good ids, shown before the live list is fetched
  suggested: string[]
}

export const providers: ProviderMeta[] = [
  {
    id: "openai",
    name: "OpenAI",
    keyEnv: "OPENAI_API_KEY",
    baseUrlEnv: "OPENAI_BASE_URL",
    defaultBaseUrl: "https://api.openai.com/v1",
    requiresKey: true,
    keysUrl: "https://platform.openai.com/api-keys",
    suggested: ["gpt-6-luna", "gpt-6-sol", "gpt-6.1-sol", "gpt-5.5", "gpt-5.4-mini"],
  },
  {
    id: "anthropic",
    name: "Anthropic",
    keyEnv: "ANTHROPIC_API_KEY",
    baseUrlEnv: "ANTHROPIC_BASE_URL",
    defaultBaseUrl: "https://api.anthropic.com/v1",
    requiresKey: true,
    keysUrl: "https://console.anthropic.com/settings/keys",
    suggested: ["claude-opus-5-5", "claude-sonnet-5-5", "claude-haiku-5-5"],
  },
  {
    id: "google",
    name: "Google Gemini",
    keyEnv: "GOOGLE_GENERATIVE_AI_API_KEY",
    baseUrlEnv: "GOOGLE_BASE_URL",
    defaultBaseUrl: "https://generativelanguage.googleapis.com/v1beta",
    requiresKey: true,
    keysUrl: "https://aistudio.google.com/apikey",
    suggested: [],
  },
  {
    id: "xai",
    name: "xAI",
    keyEnv: "XAI_API_KEY",
    baseUrlEnv: "XAI_BASE_URL",
    defaultBaseUrl: "https://api.x.ai/v1",
    requiresKey: true,
    keysUrl: "https://console.x.ai",
    suggested: [],
  },
  {
    id: "groq",
    name: "Groq",
    keyEnv: "GROQ_API_KEY",
    baseUrlEnv: "GROQ_BASE_URL",
    defaultBaseUrl: "https://api.groq.com/openai/v1",
    requiresKey: true,
    keysUrl: "https://console.groq.com/keys",
    suggested: [],
  },
  {
    id: "mistral",
    name: "Mistral",
    keyEnv: "MISTRAL_API_KEY",
    baseUrlEnv: "MISTRAL_BASE_URL",
    defaultBaseUrl: "https://api.mistral.ai/v1",
    requiresKey: true,
    keysUrl: "https://console.mistral.ai/api-keys",
    suggested: [],
  },
  {
    id: "deepseek",
    name: "DeepSeek",
    keyEnv: "DEEPSEEK_API_KEY",
    baseUrlEnv: "DEEPSEEK_BASE_URL",
    defaultBaseUrl: "https://api.deepseek.com/v1",
    requiresKey: true,
    keysUrl: "https://platform.deepseek.com/api_keys",
    suggested: [],
  },
  {
    id: "openrouter",
    name: "OpenRouter",
    keyEnv: "OPENROUTER_API_KEY",
    baseUrlEnv: "OPENROUTER_BASE_URL",
    defaultBaseUrl: "https://openrouter.ai/api/v1",
    requiresKey: true,
    keysUrl: "https://openrouter.ai/keys",
    suggested: [],
  },
  {
    id: "opencode",
    name: "OpenCode",
    keyEnv: "OPENCODE_API_KEY",
    baseUrlEnv: "OPENCODE_BASE_URL",
    // OpenCode Go (subscription). Console (pay-as-you-go) keys use the same
    // provider with OPENCODE_BASE_URL=https://opencode.ai/inference/openai/v1
    defaultBaseUrl: "https://opencode.ai/inference/go/openai/v1",
    requiresKey: true,
    keysUrl: "https://opencode.ai/console",
    note: "OpenCode Go by default; a Console key works with the endpoint changed to https://opencode.ai/inference/openai/v1. Your key's own endpoint (it ends in /v1) also works.",
    suggested: [
      "mimo-v2.5",
      "glm-5.3-flash",
      "kimi-k3",
      "deepseek-v4.1-flash",
      "claude-haiku-5-5",
    ],
  },
  {
    id: "ollama",
    name: "Ollama",
    keyEnv: null,
    baseUrlEnv: "OLLAMA_BASE_URL",
    defaultBaseUrl: "http://127.0.0.1:11434/v1",
    requiresKey: false,
    local: true,
    suggested: [],
  },
  {
    id: "lmstudio",
    name: "LM Studio",
    keyEnv: null,
    baseUrlEnv: "LMSTUDIO_BASE_URL",
    defaultBaseUrl: "http://127.0.0.1:1234/v1",
    requiresKey: false,
    local: true,
    suggested: [],
  },
  {
    id: "custom",
    name: "OpenAI-compatible",
    keyEnv: "CUSTOM_API_KEY",
    baseUrlEnv: "CUSTOM_BASE_URL",
    defaultBaseUrl: "",
    requiresKey: false,
    requiresBaseUrl: true,
    suggested: [],
  },
]

export const providerIds = providers.map((p) => p.id)

export function getProviderMeta(id: string) {
  return providers.find((p) => p.id === id)
}

// "openai/gpt-6-luna" → { provider: "openai", model: "gpt-6-luna" }. Only the
// first slash separates them, so OpenRouter ids like "openrouter/x-ai/grok"
// keep their own slashes.
export function parseModelSpec(spec: string) {
  const slash = spec.indexOf("/")
  if (slash <= 0 || slash === spec.length - 1) return null
  const provider = spec.slice(0, slash)
  const model = spec.slice(slash + 1)
  const meta = getProviderMeta(provider)
  return meta ? { provider: meta.id, model, meta } : null
}

export function formatModelSpec(provider: ProviderId, model: string) {
  return `${provider}/${model}`
}
