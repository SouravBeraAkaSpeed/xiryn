"use client"

import * as React from "react"
import {
  CheckIcon,
  ChevronsUpDownIcon,
  CornerDownLeftIcon,
  EyeOffIcon,
  RefreshCwIcon,
} from "lucide-react"

import { checkModelSight, fetchProviderModels } from "@/actions/settings"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Spinner } from "@/components/ui/spinner"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import { parseModelSpec, type ProviderId } from "@/lib/providers/catalog"
import { cn } from "@/lib/utils"
import type { SystemStatus } from "@/queries/workspace"

type ProviderOption = SystemStatus["providerOptions"][number]
type Listing = {
  state: "idle" | "loading" | "ready" | "error"
  models: string[]
  error?: string
}

// Model lists are asked for once per page load and shared by every picker
const cache = new Map<ProviderId, Promise<Listing>>()

function loadModels(provider: ProviderId, refresh = false) {
  if (refresh) cache.delete(provider)
  let pending = cache.get(provider)
  if (!pending) {
    pending = fetchProviderModels(provider).then((result) =>
      result.ok
        ? { state: "ready" as const, models: result.models.map((m) => m.id) }
        : { state: "error" as const, models: [], error: result.error }
    )
    cache.set(provider, pending)
  }
  return pending
}

export function ModelSpecLabel({
  spec,
  className,
}: {
  spec: string
  className?: string
}) {
  const parsed = parseModelSpec(spec)
  return (
    <span
      className={cn(
        "inline-flex min-w-0 items-baseline gap-1 font-mono text-[12px]",
        className
      )}
    >
      {parsed ? (
        <>
          <span className="text-muted-foreground">{parsed.provider}/</span>
          <span className="truncate">{parsed.model}</span>
        </>
      ) : (
        <span className="truncate">{spec}</span>
      )}
    </span>
  )
}

// Said when the model is picked, not after an agent has spent a turn on it:
// a model that can't see images can't use the desktop
export function ModelSightNote({ spec }: { spec: string | null | undefined }) {
  const [checked, setChecked] = React.useState<{ spec: string; sees: boolean | null }>()
  React.useEffect(() => {
    if (!spec) return
    let current = true
    checkModelSight(spec)
      .then((sees) => {
        if (current) setChecked({ spec, sees })
      })
      .catch(() => {})
    return () => {
      current = false
    }
  }, [spec])
  if (!spec || checked?.spec !== spec || checked.sees !== false) return null
  return (
    <p className="flex items-start gap-1.5 text-[12px] leading-relaxed text-warn">
      <EyeOffIcon className="mt-0.5 size-3.5 shrink-0" />
      <span>
        <span className="font-mono">{parseModelSpec(spec)?.model ?? spec}</span>{" "}
        can&apos;t see images, so an agent on it can&apos;t use its desktop: it works
        through the shell and files only. For desktop tasks, pick a model with vision.
      </span>
    </p>
  )
}

export function ModelPicker({
  value,
  onChange,
  providers,
  defaultSpec,
  allowDefault = false,
  invalid,
  id,
  className,
}: {
  value: string
  onChange: (value: string) => void
  providers: ProviderOption[]
  defaultSpec?: string | null
  allowDefault?: boolean
  invalid?: boolean
  id?: string
  className?: string
}) {
  const [open, setOpen] = React.useState(false)
  const [query, setQuery] = React.useState("")
  const [listings, setListings] = React.useState<Partial<Record<ProviderId, Listing>>>({})
  const configured = providers.filter((p) => p.configured)

  // Asked for when the picker opens (and on Refresh), not on every render
  const fetchAll = (refresh = false) => {
    for (const provider of configured) {
      setListings((current) => ({
        ...current,
        [provider.id]: { state: "loading", models: current[provider.id]?.models ?? [] },
      }))
      loadModels(provider.id, refresh).then((listing) =>
        setListings((current) => ({ ...current, [provider.id]: listing }))
      )
    }
  }

  const pick = (spec: string) => {
    onChange(spec)
    setOpen(false)
    setQuery("")
  }

  const typed = query.trim()
  const typedIsSpec = !!parseModelSpec(typed)

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (next) fetchAll()
      }}
    >
      <PopoverTrigger
        id={id}
        aria-invalid={invalid}
        className={cn(
          "flex h-8 w-full items-center gap-2 rounded-lg border border-input bg-transparent px-2.5 text-left text-sm transition-colors outline-none hover:bg-accent/40 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 aria-invalid:border-destructive dark:bg-input/30",
          className
        )}
      >
        {value ? (
          <ModelSpecLabel spec={value} className="flex-1" />
        ) : (
          <span className="flex min-w-0 flex-1 items-baseline gap-2">
            <span className="text-[13px]">Workspace default</span>
            {defaultSpec && (
              <ModelSpecLabel
                spec={defaultSpec}
                className="text-muted-foreground opacity-80"
              />
            )}
          </span>
        )}
        <ChevronsUpDownIcon className="size-3.5 text-muted-foreground" />
      </PopoverTrigger>
      <PopoverContent align="start" className="w-(--anchor-width) min-w-80 gap-0 p-0">
        <Command loop>
          <CommandInput
            placeholder="Search, or type provider/model-id"
            value={query}
            onValueChange={setQuery}
          />
          <CommandList className="max-h-80">
            <CommandEmpty className="px-3 py-4 text-left text-[12.5px] text-muted-foreground">
              {typed && !typedIsSpec
                ? "Type the full id as provider/model, e.g. ollama/qwen3:8b"
                : "No models found."}
            </CommandEmpty>
            {typedIsSpec && (
              <CommandGroup heading="Custom">
                <CommandItem value={`custom ${typed}`} onSelect={() => pick(typed)}>
                  <CornerDownLeftIcon className="text-muted-foreground" />
                  Use <ModelSpecLabel spec={typed} />
                </CommandItem>
              </CommandGroup>
            )}
            {allowDefault && (
              <CommandGroup heading="Default">
                <CommandItem value="workspace default" onSelect={() => pick("")}>
                  Workspace default
                  {defaultSpec && (
                    <ModelSpecLabel
                      spec={defaultSpec}
                      className="text-muted-foreground"
                    />
                  )}
                  {!value && <CheckIcon className="ml-auto size-3.5" />}
                </CommandItem>
              </CommandGroup>
            )}
            {configured.map((provider) => {
              const listing = listings[provider.id]
              const models = [
                ...new Set([...provider.suggested, ...(listing?.models ?? [])]),
              ]
              return (
                <CommandGroup
                  key={provider.id}
                  heading={
                    <span className="flex items-center gap-2">
                      {provider.name}
                      {listing?.state === "loading" && <Spinner className="size-3" />}
                      {listing?.state === "error" && (
                        <span
                          className="truncate font-normal text-destructive"
                          title={listing.error}
                        >
                          couldn&apos;t list models
                        </span>
                      )}
                    </span>
                  }
                >
                  {models.map((model) => {
                    const spec = `${provider.id}/${model}`
                    return (
                      <CommandItem key={spec} value={spec} onSelect={() => pick(spec)}>
                        <span className="truncate font-mono text-[12px]">{model}</span>
                        {value === spec && <CheckIcon className="ml-auto size-3.5" />}
                      </CommandItem>
                    )
                  })}
                </CommandGroup>
              )
            })}
          </CommandList>
          <div className="flex items-center gap-2 border-t px-3 py-2 text-[11.5px] text-muted-foreground">
            {configured.length === 0 ? (
              <span>No provider has a key yet — add one in Settings.</span>
            ) : (
              <>
                <span className="truncate">
                  {providers.length - configured.length} more providers available in
                  Settings
                </span>
                <button
                  type="button"
                  onClick={() => fetchAll(true)}
                  className="ml-auto inline-flex items-center gap-1 rounded-sm px-1.5 py-0.5 hover:bg-accent hover:text-foreground"
                >
                  <RefreshCwIcon className="size-3" />
                  Refresh
                </button>
              </>
            )}
          </div>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
