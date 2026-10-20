"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import {
  CheckIcon,
  ChevronRightIcon,
  ContainerIcon,
  ExternalLinkIcon,
  HammerIcon,
  KeyRoundIcon,
  PlayIcon,
  PlugIcon,
  RotateCcwIcon,
  XIcon,
} from "lucide-react"

import { fetchProviderModels, saveSettings, testIntegration } from "@/actions/settings"
import { buildWorkstationImage, dockerStatus, startDocker } from "@/actions/workstation"
import { ModelPicker } from "@/components/model-picker"
import { Button } from "@/components/ui/button"
import { LocalModelsCard } from "@/components/settings/local-models"
import { VaultPanel } from "@/components/settings/vault-panel"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import { Spinner } from "@/components/ui/spinner"
import { toast } from "@/components/ui/toast"
import { useWorkspace } from "@/components/workspace/context"
import type { SettingView } from "@/lib/config"
import { cn } from "@/lib/utils"
import type { SettingsData } from "@/queries/workspace"

/* ───────────────────────────── bits ────────────────────────────── */

function SourceBadge({
  setting,
  unset = "unset",
}: {
  setting: SettingView
  unset?: string
}) {
  if (!setting.source)
    return <span className="font-mono text-[10px] text-faint">{unset}</span>
  const tone =
    setting.source === "local"
      ? "border-rigel/30 text-rigel"
      : setting.source === "env"
        ? "border-ok/30 text-ok"
        : "text-faint"
  const label =
    setting.source === "local"
      ? "saved here"
      : setting.source === "env"
        ? ".env"
        : "default"
  return (
    <span
      title={setting.env ? `Environment variable: ${setting.env}` : undefined}
      className={cn("rounded-sm border px-1.5 py-px font-mono text-[10px]", tone)}
    >
      {label}
    </span>
  )
}

function Section({
  id,
  kicker,
  title,
  description,
  children,
}: {
  id: string
  kicker: string
  title: string
  description: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <section id={id} className="flex scroll-mt-6 flex-col gap-4">
      <div className="flex flex-col gap-1">
        <span className="label-mono">{kicker}</span>
        <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
        <p className="max-w-2xl text-[13px] leading-relaxed text-muted-foreground">
          {description}
        </p>
      </div>
      {children}
    </section>
  )
}

function SecretInput({
  setting,
  value,
  onChange,
  placeholder,
}: {
  setting: SettingView
  value: string
  onChange: (value: string) => void
  placeholder?: string
}) {
  return (
    <div className="relative">
      <KeyRoundIcon className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-faint" />
      <input
        type="password"
        autoComplete="off"
        spellCheck={false}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={
          setting.value
            ? `${setting.value}  (leave empty to keep)`
            : (placeholder ?? "Paste key")
        }
        className="h-8 w-full rounded-lg border border-input bg-transparent pr-2.5 pl-8 font-mono text-[12px] outline-none placeholder:text-faint focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/40 dark:bg-input/30"
      />
    </div>
  )
}

function TextInput({
  value,
  onChange,
  placeholder,
  mono = true,
}: {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  mono?: boolean
}) {
  return (
    <input
      value={value}
      onChange={(event) => onChange(event.target.value)}
      placeholder={placeholder}
      spellCheck={false}
      className={cn(
        "h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-[12px] outline-none placeholder:text-faint focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/40 dark:bg-input/30",
        mono && "font-mono"
      )}
    />
  )
}

function useSave() {
  const router = useRouter()
  const [pending, setPending] = React.useState(false)
  const save = async (values: Record<string, string | null>, message = "Saved") => {
    setPending(true)
    try {
      await saveSettings(values)
      toast.add({ type: "success", title: message })
      router.refresh()
      return true
    } catch (error) {
      toast.add({
        type: "error",
        title: "Couldn't save",
        description: error instanceof Error ? error.message : String(error),
      })
      return false
    } finally {
      setPending(false)
    }
  }
  return { save, pending }
}

type TestResult = { ok: true; detail: string } | { ok: false; error: string } | null

function TestLine({ result }: { result: TestResult }) {
  if (!result) return null
  return (
    <p
      className={cn(
        "flex items-start gap-1.5 font-mono text-[11px]",
        result.ok ? "text-ok" : "text-destructive"
      )}
    >
      {result.ok ? (
        <CheckIcon className="mt-px size-3.5 shrink-0" />
      ) : (
        <XIcon className="mt-px size-3.5 shrink-0" />
      )}
      <span className="break-all">{result.ok ? result.detail : result.error}</span>
    </p>
  )
}

/* ─────────────────────────── providers ─────────────────────────── */

function ProviderRow({ provider }: { provider: SettingsData["providers"][number] }) {
  const { save, pending } = useSave()
  const [key, setKey] = React.useState("")
  const [baseUrl, setBaseUrl] = React.useState(
    provider.baseUrl.source === "local" ? (provider.baseUrl.value ?? "") : ""
  )
  const [testing, setTesting] = React.useState(false)
  const [result, setResult] = React.useState<TestResult>(null)
  const configured = provider.local
    ? provider.baseUrl.source === "local" || provider.baseUrl.source === "env"
    : provider.requiresBaseUrl
      ? provider.baseUrl.set
      : provider.apiKey.set
  const showsKey = provider.keyEnv !== null

  const test = async () => {
    setTesting(true)
    const response = await fetchProviderModels(provider.id)
    setResult(
      response.ok
        ? { ok: true, detail: `${response.models.length} models available` }
        : { ok: false, error: response.error }
    )
    setTesting(false)
  }

  return (
    <Collapsible className="group/provider">
      <CollapsibleTrigger className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-accent/30">
        <span
          className={cn("size-1.5 rounded-full", configured ? "bg-ok" : "bg-faint/50")}
        />
        <span className="text-[13.5px] font-medium">{provider.name}</span>
        {provider.local && (
          <span className="rounded-sm border px-1.5 py-px font-mono text-[10px] text-muted-foreground">
            local
          </span>
        )}
        <span className="ml-auto flex items-center gap-2">
          {showsKey && provider.apiKey.set && (
            <span className="hidden font-mono text-[11px] text-muted-foreground sm:inline">
              {provider.apiKey.value}
            </span>
          )}
          {showsKey ? (
            <SourceBadge setting={provider.apiKey} />
          ) : (
            <SourceBadge setting={provider.baseUrl} />
          )}
          <ChevronRightIcon className="size-4 text-muted-foreground transition-transform group-data-open/provider:rotate-90" />
        </span>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="flex flex-col gap-3 border-t bg-background/40 px-4 py-4">
          {showsKey && (
            <label className="flex flex-col gap-1.5">
              <span className="flex items-center justify-between">
                <span className="label-mono">API key</span>
                <span className="font-mono text-[10px] text-faint">
                  {provider.keyEnv}
                </span>
              </span>
              <SecretInput setting={provider.apiKey} value={key} onChange={setKey} />
            </label>
          )}
          <label className="flex flex-col gap-1.5">
            <span className="flex items-center justify-between">
              <span className="label-mono">
                Endpoint{provider.requiresBaseUrl || provider.local ? "" : " (optional)"}
              </span>
              <span className="font-mono text-[10px] text-faint">
                {provider.baseUrlEnv}
              </span>
            </span>
            <TextInput
              value={baseUrl}
              onChange={setBaseUrl}
              placeholder={
                provider.baseUrl.source === "env"
                  ? `${provider.baseUrl.value} (from .env)`
                  : provider.defaultBaseUrl || "https://your-endpoint/v1"
              }
            />
            {provider.note && (
              <span className="text-[11.5px] leading-relaxed text-muted-foreground">
                {provider.note}
              </span>
            )}
          </label>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              disabled={
                pending ||
                (!key.trim() &&
                  baseUrl ===
                    (provider.baseUrl.source === "local" ? provider.baseUrl.value : ""))
              }
              onClick={async () => {
                const values: Record<string, string | null> = {
                  [`provider.${provider.id}.baseUrl`]: baseUrl.trim() || null,
                }
                if (key.trim()) values[`provider.${provider.id}.apiKey`] = key.trim()
                if (await save(values, `${provider.name} saved`)) setKey("")
              }}
            >
              {pending && <Spinner data-icon="inline-start" />}
              Save
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={testing || !configured}
              onClick={test}
            >
              {testing ? (
                <Spinner data-icon="inline-start" />
              ) : (
                <PlugIcon data-icon="inline-start" />
              )}
              Test connection
            </Button>
            {provider.apiKey.source === "local" && (
              <Button
                size="sm"
                variant="ghost"
                className="text-muted-foreground"
                onClick={() =>
                  save({ [`provider.${provider.id}.apiKey`]: null }, "Saved key removed")
                }
              >
                <RotateCcwIcon data-icon="inline-start" />
                Forget saved key
              </Button>
            )}
            {provider.keysUrl && (
              <a
                href={provider.keysUrl}
                target="_blank"
                rel="noreferrer"
                className="ml-auto inline-flex items-center gap-1 font-mono text-[11px] text-muted-foreground hover:text-foreground"
              >
                get a key <ExternalLinkIcon className="size-3" />
              </a>
            )}
          </div>
          <TestLine result={result} />
        </div>
      </CollapsibleContent>
    </Collapsible>
  )
}

/* ────────────────────────── integrations ───────────────────────── */

function IntegrationCard({
  name,
  kind,
  description,
  href,
  fields,
}: {
  name: string
  kind: "firecrawl"
  description: string
  href: string
  fields: {
    key: string
    label: string
    setting: SettingView
    secret?: boolean
    placeholder?: string
  }[]
}) {
  const { save, pending } = useSave()
  const [values, setValues] = React.useState<Record<string, string>>(() =>
    Object.fromEntries(
      fields.map((field) => [
        field.key,
        !field.secret && field.setting.source === "local"
          ? (field.setting.value ?? "")
          : "",
      ])
    )
  )
  const [testing, setTesting] = React.useState(false)
  const [result, setResult] = React.useState<TestResult>(null)
  const keyField = fields.find((field) => field.secret)!
  const connected = keyField.setting.set

  return (
    <div className="flex flex-col gap-4 rounded-xl border bg-surface/50 p-4">
      <div className="flex items-start gap-3">
        <span
          className={cn(
            "mt-1.5 size-1.5 shrink-0 rounded-full",
            connected ? "bg-ok" : "bg-faint/50"
          )}
        />
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <div className="flex items-center gap-2">
            <span className="text-[14px] font-semibold">{name}</span>
            <SourceBadge setting={keyField.setting} />
          </div>
          <p className="text-[12.5px] leading-relaxed text-muted-foreground">
            {description}
          </p>
        </div>
        <a
          href={href}
          target="_blank"
          rel="noreferrer"
          className="inline-flex shrink-0 items-center gap-1 font-mono text-[11px] text-muted-foreground hover:text-foreground"
        >
          get a key <ExternalLinkIcon className="size-3" />
        </a>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {fields.map((field) => (
          <label
            key={field.key}
            className={cn("flex flex-col gap-1.5", field.secret && "sm:col-span-2")}
          >
            <span className="flex items-center justify-between">
              <span className="label-mono">{field.label}</span>
              <span className="font-mono text-[10px] text-faint">
                {field.setting.env}
              </span>
            </span>
            {field.secret ? (
              <SecretInput
                setting={field.setting}
                value={values[field.key]}
                onChange={(value) =>
                  setValues((current) => ({ ...current, [field.key]: value }))
                }
              />
            ) : (
              <TextInput
                value={values[field.key]}
                onChange={(value) =>
                  setValues((current) => ({ ...current, [field.key]: value }))
                }
                placeholder={
                  field.setting.value ? `${field.setting.value}` : field.placeholder
                }
              />
            )}
          </label>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          disabled={pending}
          onClick={async () => {
            const payload: Record<string, string | null> = {}
            for (const field of fields) {
              const value = values[field.key].trim()
              if (field.secret) {
                if (value) payload[field.key] = value
              } else {
                payload[field.key] = value || null
              }
            }
            if (await save(payload, `${name} saved`)) {
              setValues((current) => ({ ...current, [keyField.key]: "" }))
            }
          }}
        >
          {pending && <Spinner data-icon="inline-start" />}
          Save
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={testing || !connected}
          onClick={async () => {
            setTesting(true)
            setResult(await testIntegration(kind))
            setTesting(false)
          }}
        >
          {testing ? (
            <Spinner data-icon="inline-start" />
          ) : (
            <PlugIcon data-icon="inline-start" />
          )}
          Test connection
        </Button>
        {keyField.setting.source === "local" && (
          <Button
            size="sm"
            variant="ghost"
            className="text-muted-foreground"
            onClick={() => save({ [keyField.key]: null }, "Saved key removed")}
          >
            <RotateCcwIcon data-icon="inline-start" />
            Forget saved key
          </Button>
        )}
      </div>
      <TestLine result={result} />
    </div>
  )
}

/* ────────────────────────── workstations ───────────────────────── */

type DockerView = Awaited<ReturnType<typeof dockerStatus>>

const INSTALL: Record<string, { command: string; href: string }> = {
  win32: {
    command: "winget install -e --id Docker.DockerDesktop",
    href: "https://docs.docker.com/desktop/setup/install/windows-install/",
  },
  darwin: {
    command: "brew install --cask docker-desktop",
    href: "https://docs.docker.com/desktop/setup/install/mac-install/",
  },
  linux: {
    command: "curl -fsSL https://get.docker.com | sudo sh",
    href: "https://docs.docker.com/engine/install/",
  },
}

function gib(bytes: number) {
  return `${(bytes / 1024 ** 3).toFixed(bytes >= 10 * 1024 ** 3 ? 0 : 1)} GiB`
}

function elapsed(since: number) {
  const seconds = Math.max(0, Math.round((Date.now() - since) / 1000))
  return seconds < 60 ? `${seconds}s` : `${Math.floor(seconds / 60)}m ${seconds % 60}s`
}

function WorkstationCard({ data }: { data: SettingsData }) {
  const router = useRouter()
  const { save, pending } = useSave()
  const [docker, setDocker] = React.useState<DockerView | null>(null)
  const [busy, setBusy] = React.useState<"start" | "build" | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const settings = data.workstation
  const local = (setting: SettingView) =>
    setting.source === "local" ? (setting.value ?? "") : ""
  const [values, setValues] = React.useState(() => ({
    cpus: local(settings.cpus),
    memory: local(settings.memory),
    autoStop: local(settings.autoStop),
    autoDelete: local(settings.autoDelete),
  }))
  const [phoneLinks, setPhoneLinks] = React.useState(settings.phoneLinks.value !== "off")

  const refresh = React.useCallback(async () => {
    try {
      setDocker(await dockerStatus())
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    }
  }, [])

  React.useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refresh()
  }, [refresh])

  // Follow a build while it runs
  const building = docker?.image?.state === "building"
  React.useEffect(() => {
    if (!building) return
    const timer = setInterval(refresh, 2000)
    return () => clearInterval(timer)
  }, [building, refresh])

  const engine = docker?.engine
  const image = docker?.image
  const ready = engine?.state === "ready" && image?.state === "ready"
  const install = INSTALL[docker?.platform ?? "linux"] ?? INSTALL.linux
  const log = image && "log" in image ? image.log.slice(-8) : []

  const field = (
    key: keyof typeof values,
    label: string,
    setting: SettingView,
    placeholder?: string
  ) => (
    <label className="flex flex-col gap-1.5">
      <span className="flex items-center justify-between">
        <span className="label-mono">{label}</span>
        <span className="font-mono text-[10px] text-faint">{setting.env}</span>
      </span>
      <TextInput
        value={values[key]}
        onChange={(value) => setValues((current) => ({ ...current, [key]: value }))}
        placeholder={setting.value ?? placeholder}
      />
    </label>
  )

  return (
    <div className="flex flex-col gap-4 rounded-xl border bg-surface/50 p-4">
      <div className="flex items-start gap-3">
        <span
          className={cn(
            "mt-1.5 size-1.5 shrink-0 rounded-full",
            ready
              ? "bg-ok"
              : building || busy
                ? "animate-pulse-dot bg-rigel text-rigel"
                : engine
                  ? "bg-warn"
                  : "bg-faint/50"
          )}
        />
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="text-[14px] font-semibold">Workstations</span>
          <p className="text-[12.5px] leading-relaxed text-muted-foreground">
            One Docker container per agent, on this computer: a Linux desktop with a
            browser, a shell and a home folder that persists. It browses from your own
            connection and never touches your files.
          </p>
        </div>
        <a
          href="https://docs.docker.com/get-started/get-docker/"
          target="_blank"
          rel="noreferrer"
          className="inline-flex shrink-0 items-center gap-1 font-mono text-[11px] text-muted-foreground hover:text-foreground"
        >
          docker <ExternalLinkIcon className="size-3" />
        </a>
      </div>

      <div className="flex flex-col divide-y rounded-lg border">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2.5">
          <ContainerIcon className="size-3.5 text-muted-foreground" />
          <span className="font-mono text-[12px]">
            {!engine
              ? "checking docker…"
              : engine.state === "ready"
                ? `docker ${engine.version} · ${engine.cpus} cpu · ${gib(engine.memoryBytes)}`
                : engine.state === "stopped"
                  ? "docker isn't running"
                  : "docker isn't installed"}
          </span>
          {engine?.state === "stopped" && engine.canStart && (
            <Button
              size="xs"
              variant="secondary"
              className="ml-auto"
              disabled={!!busy}
              onClick={async () => {
                setBusy("start")
                const result = await startDocker()
                setBusy(null)
                if (!result.ok) setError(result.error)
                await refresh()
                router.refresh()
              }}
            >
              {busy === "start" ? (
                <Spinner data-icon="inline-start" />
              ) : (
                <PlayIcon data-icon="inline-start" />
              )}
              Start Docker
            </Button>
          )}
        </div>

        {engine?.state === "missing" && (
          <div className="flex flex-col gap-2 px-3 py-3 text-[12.5px] leading-relaxed text-muted-foreground">
            <p>
              Install Docker, then restart Xiryn. In a terminal in the Xiryn folder,{" "}
              <code className="rounded-sm bg-muted px-1 font-mono text-[11.5px]">
                npm run setup
              </code>{" "}
              does it for you — or run:
            </p>
            <code className="rounded-md border bg-background/60 px-2.5 py-1.5 font-mono text-[11.5px] text-foreground">
              {install.command}
            </code>
            <a
              href={install.href}
              target="_blank"
              rel="noreferrer"
              className="inline-flex w-fit items-center gap-1 font-mono text-[11px] hover:text-foreground"
            >
              installation guide <ExternalLinkIcon className="size-3" />
            </a>
          </div>
        )}

        {engine?.state === "stopped" && !engine.canStart && (
          <p className="px-3 py-2.5 font-mono text-[11.5px] text-muted-foreground">
            sudo systemctl start docker
          </p>
        )}

        {engine?.state === "ready" && image && (
          <div className="flex flex-col gap-2 px-3 py-2.5">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
              <HammerIcon className="size-3.5 text-muted-foreground" />
              <span className="min-w-0 truncate font-mono text-[12px]">
                {image.state === "ready"
                  ? `image ready · ${image.tag.split(":")[1]} · ${gib(image.sizeBytes)}`
                  : image.state === "building"
                    ? `building image · ${elapsed(image.startedAt)}`
                    : image.state === "failed"
                      ? "image build failed"
                      : "image not built yet"}
              </span>
              {(image.state === "absent" || image.state === "failed") && (
                <Button
                  size="xs"
                  variant="secondary"
                  className="ml-auto"
                  disabled={!!busy}
                  onClick={async () => {
                    setBusy("build")
                    setDocker(await buildWorkstationImage())
                    setBusy(null)
                  }}
                >
                  <HammerIcon data-icon="inline-start" />
                  {image.state === "failed" ? "Try again" : "Build now"}
                </Button>
              )}
              {image.state === "building" && <Spinner className="ml-auto size-3.5" />}
            </div>
            {image.state === "absent" && (
              <p className="text-[12px] text-muted-foreground">
                Built once on this computer (a few minutes), or automatically the first
                time an agent needs its machine.
              </p>
            )}
            {image.state === "building" && image.step && (
              <p className="truncate font-mono text-[11px] text-rigel">
                step {image.step}
              </p>
            )}
            {image.state === "failed" && (
              <p className="font-mono text-[11px] break-all text-destructive">
                {image.error}
              </p>
            )}
            {log.length > 0 && (
              <pre className="max-h-40 overflow-auto rounded-md bg-background/60 p-2 font-mono text-[10.5px] leading-relaxed whitespace-pre-wrap text-muted-foreground">
                {log.join("\n")}
              </pre>
            )}
          </div>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {field("cpus", "CPUs per agent", settings.cpus, "2")}
        {field("memory", "Memory per agent (GB)", settings.memory, "4")}
        {field("autoStop", "Auto-stop when idle (minutes)", settings.autoStop, "15")}
        {field(
          "autoDelete",
          "Auto-delete after stop (minutes)",
          settings.autoDelete,
          "never — keep files"
        )}
      </div>
      <label className="flex items-start gap-2.5">
        <Checkbox
          checked={phoneLinks}
          onCheckedChange={(checked) => setPhoneLinks(checked)}
          className="mt-0.5"
        />
        <span className="flex flex-col gap-0.5">
          <span className="text-[13px] font-medium">Phone take-over links</span>
          <span className="text-[12px] leading-relaxed text-muted-foreground">
            Telegram hand-offs include a link to the agent&apos;s live desktop that works
            from your phone, through a temporary Cloudflare quick tunnel that closes after
            30 minutes. The link carries the desktop&apos;s password.
          </span>
        </span>
      </label>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          disabled={pending}
          onClick={() =>
            save(
              {
                "workstation.cpus": values.cpus.trim() || null,
                "workstation.memory": values.memory.trim() || null,
                "workstation.autoStop": values.autoStop.trim() || null,
                "workstation.autoDelete": values.autoDelete.trim() || null,
                "workstation.phoneLinks": phoneLinks ? null : "off",
              },
              "Workstation settings saved"
            )
          }
        >
          {pending && <Spinner data-icon="inline-start" />}
          Save
        </Button>
        <span className="text-[11.5px] text-faint">
          CPU and memory apply to machines created after saving.
        </span>
      </div>
      <TestLine result={error ? { ok: false, error } : null} />
    </div>
  )
}

/* ──────────────────────────── model ────────────────────────────── */

function ModelSection({ data }: { data: SettingsData }) {
  const { status } = useWorkspace()
  const { save, pending } = useSave()
  const [model, setModel] = React.useState(
    data.defaultModel.source === "local" ? (data.defaultModel.value ?? "") : ""
  )
  const [steps, setSteps] = React.useState(
    data.maxSteps.source === "local" ? (data.maxSteps.value ?? "") : ""
  )

  return (
    <div className="flex flex-col gap-4 rounded-xl border bg-surface/50 p-4">
      <div className="grid gap-4 sm:grid-cols-[1fr_160px]">
        <label className="flex flex-col gap-1.5">
          <span className="flex items-center justify-between">
            <span className="label-mono">Default model</span>
            <SourceBadge setting={data.defaultModel} unset="auto" />
          </span>
          <ModelPicker
            value={model}
            onChange={setModel}
            providers={status.providerOptions}
            allowDefault={data.defaultModel.source === "env" || !data.defaultModel.set}
            defaultSpec={
              data.defaultModel.source === "env"
                ? data.defaultModel.value
                : data.resolvedDefaultModel
            }
          />
          <span className="text-[11.5px] text-muted-foreground">
            Used by every agent that doesn&apos;t pick its own.
            {data.defaultModel.source === "env" &&
              " Currently set by XIRYN_DEFAULT_MODEL in .env."}
          </span>
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="flex items-center justify-between">
            <span className="label-mono">Max steps</span>
            <SourceBadge setting={data.maxSteps} />
          </span>
          <TextInput
            value={steps}
            onChange={setSteps}
            placeholder={data.maxSteps.value ?? "40"}
          />
          <span className="text-[11.5px] text-muted-foreground">
            Per turn, before it stops.
          </span>
        </label>
      </div>
      <div>
        <Button
          size="sm"
          disabled={pending}
          onClick={() =>
            save({ "model.default": model || null, "agent.maxSteps": steps || null })
          }
        >
          {pending && <Spinner data-icon="inline-start" />}
          Save
        </Button>
      </div>
    </div>
  )
}

/* ─────────────────────────── updates ───────────────────────────── */

function UpdateCheck({ enabled }: { enabled: boolean }) {
  const { save, pending } = useSave()
  return (
    <label className="flex items-start gap-2.5 rounded-xl border bg-surface/50 p-4">
      <Checkbox
        checked={enabled}
        disabled={pending}
        onCheckedChange={(checked) =>
          save(
            { "updates.check": checked ? null : "off" },
            checked ? "Update check on" : "Update check off"
          )
        }
        className="mt-0.5"
      />
      <span className="flex flex-col gap-0.5">
        <span className="text-[13px] font-medium">Check GitHub for updates</span>
        <span className="text-[12px] leading-relaxed text-muted-foreground">
          When you open it, Xiryn asks GitHub&apos;s public API whether a newer version is
          out and how many stars the project has, to show an Update button. It&apos;s the
          only request Xiryn makes on its own, and it sends nothing about you.
        </span>
      </span>
    </label>
  )
}

function DesktopNotify({ enabled }: { enabled: boolean }) {
  const { save, pending } = useSave()
  return (
    <label className="flex items-start gap-2.5 rounded-xl border bg-surface/50 p-4">
      <Checkbox
        checked={enabled}
        disabled={pending}
        onCheckedChange={(checked) =>
          save(
            { "notify.desktop": checked ? null : "off" },
            checked ? "Desktop notifications on" : "Desktop notifications off"
          )
        }
        className="mt-0.5"
      />
      <span className="flex flex-col gap-0.5">
        <span className="text-[13px] font-medium">
          Desktop notifications in the background
        </span>
        <span className="text-[12px] leading-relaxed text-muted-foreground">
          When no Xiryn tab is open — a routine finishing overnight, an agent that needs
          you while Xiryn runs in the background — your computer shows the notification
          itself.
        </span>
      </span>
    </label>
  )
}

/* ──────────────────────────── page ─────────────────────────────── */

export function SettingsForm({
  data,
  telegram,
}: {
  data: SettingsData
  telegram: React.ReactNode
}) {
  const nav = [
    ["model", "Model"],
    ["local", "Local models"],
    ["providers", "Providers"],
    ["integrations", "Integrations"],
    ["vault", "Vault"],
    ["remote", "Remote access"],
    ["system", "System"],
  ]

  return (
    <div className="mx-auto grid w-full max-w-5xl gap-10 px-6 py-12 lg:grid-cols-[180px_1fr]">
      <nav className="hidden flex-col gap-0.5 lg:sticky lg:top-12 lg:flex lg:self-start">
        <span className="label-mono mb-2 px-2">{"// settings"}</span>
        {nav.map(([id, label]) => (
          <a
            key={id}
            href={`#${id}`}
            className="rounded-md px-2 py-1 text-[13px] text-muted-foreground transition-colors hover:bg-accent/50 hover:text-foreground"
          >
            {label}
          </a>
        ))}
      </nav>

      <div className="flex min-w-0 flex-col gap-12">
        <header className="flex flex-col gap-2">
          <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
          <p className="max-w-2xl text-[13.5px] leading-relaxed text-muted-foreground">
            Keys can live in{" "}
            <code className="rounded-sm bg-muted px-1 font-mono text-[12px]">.env</code>{" "}
            or be saved here. Values saved here take precedence and are stored only in
            your local database — the browser only ever sees masked versions.
          </p>
        </header>

        <Section
          id="model"
          kicker="01 · model"
          title="Default model"
          description="Agents think with this model unless they're configured with their own. Any provider/model pair works, including local models."
        >
          <ModelSection data={data} />
        </Section>

        <Section
          id="local"
          kicker="02 · local models"
          title="Local models"
          description="Run agents for free on this computer. Download a model with one click and make it the default."
        >
          <LocalModelsCard />
        </Section>

        <Section
          id="providers"
          kicker="03 · providers"
          title="Model providers"
          description="Bring your own keys. Configure as many providers as you like and mix them across agents. Local runtimes (Ollama, LM Studio) need only an endpoint."
        >
          <div className="divide-y overflow-hidden rounded-xl border bg-surface/50">
            {data.providers.map((provider) => (
              <ProviderRow key={provider.id} provider={provider} />
            ))}
          </div>
        </Section>

        <Section
          id="integrations"
          kicker="04 · integrations"
          title="Workstations & web"
          description="Agents' machines run in Docker on this computer. Firecrawl is optional: without it agents search and read the web only by browsing."
        >
          <WorkstationCard data={data} />
          <IntegrationCard
            name="Firecrawl"
            kind="firecrawl"
            href="https://www.firecrawl.dev/app/api-keys"
            description="Web search and clean page extraction for every agent."
            fields={[
              {
                key: "firecrawl.apiKey",
                label: "API key",
                setting: data.firecrawl.apiKey,
                secret: true,
              },
              {
                key: "firecrawl.apiUrl",
                label: "API URL",
                setting: data.firecrawl.apiUrl,
              },
            ]}
          />
        </Section>

        <Section
          id="vault"
          kicker="05 · vault"
          title="Vault"
          description="What agents may use on your behalf — encrypted here, never shown to them."
        >
          <VaultPanel />
        </Section>

        <Section
          id="remote"
          kicker="06 · remote access"
          title="Telegram"
          description="Talk to your agents from anywhere. Xiryn polls Telegram from this machine — no public URL, no port forwarding, no tunnel."
        >
          {telegram}
        </Section>

        <Section
          id="system"
          kicker="07 · system"
          title="System"
          description="Where your data lives and what Xiryn is running on."
        >
          <div className="divide-y rounded-xl border bg-surface/50 font-mono text-[12px]">
            {[
              ["database", data.dbPath],
              ["agents", data.counts.agents],
              ["squads", data.counts.squads],
              ["threads", data.counts.threads],
              ["messages", data.counts.messages],
              ["memories", data.counts.memories],
              ["allowed hosts", data.allowedHosts ?? "localhost only"],
            ].map(([label, value]) => (
              <div
                key={String(label)}
                className="flex items-baseline justify-between gap-4 px-4 py-2"
              >
                <span className="text-muted-foreground">{label}</span>
                <span className="min-w-0 truncate text-right">{String(value)}</span>
              </div>
            ))}
          </div>
          <DesktopNotify enabled={data.desktopNotify} />
          <UpdateCheck enabled={data.updateChecks} />
        </Section>
      </div>
    </div>
  )
}
