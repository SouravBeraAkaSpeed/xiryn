import { version } from "@/package.json"

/* ──────────────────────────── OpenCode ─────────────────────────────
 * OpenCode (https://opencode.ai) serves every model through one of four
 * API dialects, and its gateway requires a stable session id per
 * conversation in `x-opencode-session` for routing and prompt caching:
 * https://opencode.ai/docs/go/#where-can-i-use-it
 *
 * The configured endpoint is the OpenAI-compatible root ending in /v1
 * (chat completions live at {base}/chat/completions). Two layouts exist;
 * both are handled by looking at whether the path contains /openai/v1:
 *
 *   documented   …/inference/go/openai/v1  → root …/inference/go
 *   compact      …/zen/go/v1               → root …/zen/go
 *
 * then: models {root}/v1/models · anthropic {root}/anthropic/v1/messages
 *       google {root}/google/v1beta/models/{id}:streamGenerateContent
 *       responses {base}/responses
 */

export type OpenCodeFamily = "chat" | "responses" | "anthropic" | "google"

export function opencodeUrls(chatBase: string) {
  const base = chatBase.replace(/\/+$/, "")
  // Documented layout ends in /openai/v1; compact aliases end in /v1. A base
  // without either is used as-is for everything — the upstream error says so.
  const root = /\/openai\/v1$/.test(base)
    ? base.slice(0, -"/openai/v1".length)
    : /\/v1$/.test(base)
      ? base.slice(0, -"/v1".length)
      : base
  return {
    chat: base,
    responses: base,
    anthropic: `${root}/anthropic/v1`,
    google: `${root}/google/v1beta`,
    models: `${root}/v1`,
  }
}

// Which dialect serves a model id. From the endpoint tables at
// https://opencode.ai/v2/docs/console/models and
// https://opencode.ai/v2/docs/console/go (verified against the live
// /v1/models lists): GPT/Grok/Muse run on the OpenAI Responses API, Claude
// and Qwen on the Anthropic Messages API, Gemini on its own API, and
// everything else on chat completions. A few ids changed family between the
// Console and Go catalogs, so the plan matters there.
export function opencodeFamily(modelId: string, base: string): OpenCodeFamily {
  const go = base.includes("/go/")
  if (/^(gpt-|grok-|muse-spark-)/.test(modelId)) return "responses"
  if (/^claude-/.test(modelId)) return "anthropic"
  if (/^gemini-/.test(modelId)) return "google"
  if (/^qwen/.test(modelId)) {
    // Console serves Qwen3.8 Max on chat completions; Go serves it on Anthropic
    if (!go && modelId === "qwen3.8-max") return "chat"
    return "anthropic"
  }
  // Go serves MiniMax M3 on Anthropic; Console serves it on chat completions
  if (modelId === "minimax-m3") return go ? "anthropic" : "chat"
  return "chat"
}

// Every OpenCode request carries who we are and, inside a thread, which
// conversation it belongs to. The gateway rejects requests without the
// session header, and prefers a real client User-Agent over an SDK's.
export function opencodeHeaders(sessionId?: string) {
  return {
    "user-agent": `xiryn/${version}`,
    ...(sessionId && { "x-opencode-session": sessionId }),
  }
}
