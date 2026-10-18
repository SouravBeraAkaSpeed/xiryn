# Model providers

Xiryn talks to models through the [AI SDK](https://ai-sdk.dev). Configure as many providers as you like — in `.env` or **Settings → Providers** — and pick a model per agent or a workspace default.

Models are always written `provider/model-id`. Only the first slash separates the two, so ids that contain slashes (OpenRouter) work as-is.

## Choosing a model

Agents use tools constantly. Pick a model that supports **tool calling**. For desktop work (`screen_capture`, clicking, typing) it must also accept **image input**. Strong reasoning helps with long, multi-step tasks; fast, cheap models are fine for chatty agents without a workstation.

The model picker lists what your key can actually use, fetched live from the provider, and accepts any id you type.

## Hosted providers

| Provider | Variable | Example model | Get a key |
| --- | --- | --- | --- |
| OpenAI | `OPENAI_API_KEY` | `openai/gpt-6-luna` | [platform.openai.com](https://platform.openai.com/api-keys) |
| Anthropic | `ANTHROPIC_API_KEY` | `anthropic/claude-sonnet-5-5` | [console.anthropic.com](https://console.anthropic.com/settings/keys) |
| Google Gemini | `GOOGLE_GENERATIVE_AI_API_KEY` | pick from the live list | [aistudio.google.com](https://aistudio.google.com/apikey) |
| xAI | `XAI_API_KEY` | pick from the live list | [console.x.ai](https://console.x.ai) |
| Groq | `GROQ_API_KEY` | pick from the live list | [console.groq.com](https://console.groq.com/keys) |
| Mistral | `MISTRAL_API_KEY` | pick from the live list | [console.mistral.ai](https://console.mistral.ai/api-keys) |
| DeepSeek | `DEEPSEEK_API_KEY` | pick from the live list | [platform.deepseek.com](https://platform.deepseek.com/api_keys) |
| OpenRouter | `OPENROUTER_API_KEY` | `openrouter/<vendor>/<model>` | [openrouter.ai](https://openrouter.ai/keys) |
| OpenCode | `OPENCODE_API_KEY` | `opencode/kimi-k3` | [opencode.ai/console](https://opencode.ai/console) |

Each hosted provider also accepts a `<PROVIDER>_BASE_URL` (e.g. `OPENAI_BASE_URL`) for proxies or regional endpoints.

### OpenCode

OpenCode ([Go](https://opencode.ai/docs/go/) subscription or [Console](https://opencode.ai/docs/console/) pay-as-you-go) serves every model through one of four API dialects — OpenAI chat completions, OpenAI Responses, Anthropic Messages or Gemini — and its gateway asks clients for a session id per conversation. Xiryn handles both: it routes each model to the right dialect and sends the `x-opencode-session` header (the thread's id) and its own user agent on every request.

A Go key works with the default endpoint. A Console key needs:

```bash
OPENCODE_BASE_URL=https://opencode.ai/inference/openai/v1
```

Any endpoint your key's page gives you (they end in `/v1`) also works. Then use `opencode/<model-id>`, e.g. `opencode/kimi-k3`, `opencode/mimo-v2.5` or `opencode/claude-haiku-5-5`.

## Local models

Run models on your own hardware and nothing — not even the prompt — leaves your machine except workstation and web calls.

### Ollama

```bash
ollama pull qwen3:8b
```

```bash
# .env
OLLAMA_BASE_URL=http://127.0.0.1:11434/v1
```

Then use `ollama/qwen3:8b`. Choose a model with tool-calling support.

### LM Studio

Start the local server in LM Studio (Developer → Start server), then:

```bash
LMSTUDIO_BASE_URL=http://127.0.0.1:1234/v1
```

Use `lmstudio/<model-id>` as shown in the picker.

## Any OpenAI-compatible API

vLLM, LiteLLM, Together, Fireworks, a corporate gateway — anything that speaks the OpenAI chat completions API:

```bash
CUSTOM_BASE_URL=https://your-endpoint/v1
CUSTOM_API_KEY=...        # if required
```

Use `custom/<model-id>`.

## Defaults

```bash
XIRYN_DEFAULT_MODEL=openai/gpt-6-luna   # used by agents without their own model
XIRYN_MAX_STEPS=40                      # max tool calls per turn
```

Without `XIRYN_DEFAULT_MODEL`, Xiryn uses the first recommended model of the first configured provider.

## Costs

Xiryn is free; providers bill you directly. The **Usage** page shows input, output, cached and reasoning tokens per turn, model and agent. Set spending limits in your provider's dashboard.
