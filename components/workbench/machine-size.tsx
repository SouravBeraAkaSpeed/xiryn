"use client"

import * as React from "react"
import { SlidersHorizontalIcon } from "lucide-react"

import { machineView, raiseEngineLimits, saveMachine } from "@/actions/machines"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { toast } from "@/components/ui/toast"

type View = Awaited<ReturnType<typeof machineView>>

const round = (n: number) => Math.floor(n * 10) / 10

// Choose how big an agent's computer is: processors, memory and screen
export function MachineSize({
  agentId,
  onSaved,
}: {
  agentId: string
  onSaved: () => void
}) {
  const [open, setOpen] = React.useState(false)
  const [view, setView] = React.useState<View | null>(null)
  const [cpus, setCpus] = React.useState(2)
  const [memory, setMemory] = React.useState(4)
  const [screen, setScreen] = React.useState("1280x800")
  const [error, setError] = React.useState<string | null>(null)
  const [needs, setNeeds] = React.useState<{ cpus: number; memoryGb: number } | null>(
    null
  )
  const [pending, start] = React.useTransition()

  const load = () =>
    start(async () => {
      const next = await machineView(agentId)
      setView(next)
      setCpus(next.spec.cpus)
      setMemory(next.spec.memoryGb)
      setScreen(`${next.spec.width}x${next.spec.height}`)
      setOpen(true)
    })

  const save = () =>
    start(async () => {
      const [width, height] = screen.split("x").map(Number)
      const result = await saveMachine(agentId, { cpus, memoryGb: memory, width, height })
      if (result.ok) {
        setError(null)
        setNeeds(null)
        setOpen(false)
        toast.add({
          type: "success",
          title: "Saved. The new size applies the next time it starts.",
        })
        onSaved()
        return
      }
      setError(result.error)
      setNeeds("engineNeeds" in result ? result.engineNeeds : null)
    })

  const raise = () =>
    start(async () => {
      if (!needs) return
      const result = await raiseEngineLimits(needs)
      if (!result.ok) {
        setError(result.error)
        return
      }
      setNeeds(null)
      setError(null)
      setView(await machineView(agentId))
      toast.add({ type: "success", title: "The container engine has more room now." })
    })

  if (!open) {
    return (
      <Button size="sm" variant="outline" disabled={pending} onClick={load}>
        {pending ? (
          <Spinner data-icon="inline-start" />
        ) : (
          <SlidersHorizontalIcon data-icon="inline-start" />
        )}
        Size
      </Button>
    )
  }
  if (!view) return null

  const maxCpus = view.host.cpus
  const maxMemory = Math.max(1, Math.floor(view.host.memoryGb - 1))
  const field = "flex flex-col gap-1.5"

  return (
    <div className="flex w-full flex-col gap-3 rounded-lg border p-3">
      <label className={field}>
        <span className="flex justify-between">
          <span className="label-mono">processors</span>
          <span className="font-mono text-[12px]">{cpus}</span>
        </span>
        <input
          type="range"
          min={0.5}
          max={maxCpus}
          step={0.5}
          value={cpus}
          onChange={(event) => setCpus(Number(event.target.value))}
        />
      </label>
      <label className={field}>
        <span className="flex justify-between">
          <span className="label-mono">memory</span>
          <span className="font-mono text-[12px]">{memory} GB</span>
        </span>
        <input
          type="range"
          min={1}
          max={maxMemory}
          step={1}
          value={memory}
          onChange={(event) => setMemory(Number(event.target.value))}
        />
      </label>
      <label className={field}>
        <span className="label-mono">screen</span>
        <select
          value={screen}
          onChange={(event) => setScreen(event.target.value)}
          className="h-8 rounded-md border bg-background px-2 font-mono text-[12px]"
        >
          {view.sizes.map((s) => (
            <option key={`${s.width}x${s.height}`} value={`${s.width}x${s.height}`}>
              {s.width} × {s.height}
            </option>
          ))}
        </select>
      </label>
      <p className="text-[11.5px] leading-relaxed text-faint">
        This computer: {view.host.cpus} processors, {round(view.host.memoryGb)} GB.
        {view.engine &&
          ` Container engine: ${view.engine.cpus} processors, ${round(view.engine.memoryGb)} GB.`}{" "}
        Bigger screens make screenshots larger, which costs more per step on paid models.
      </p>
      {error && <p className="text-[12px] text-destructive">{error}</p>}
      {needs && view.canRaiseEngine && (
        <div className="flex flex-col gap-2 rounded-md border border-warn/30 bg-warn/5 p-2.5">
          <p className="text-[12px] leading-relaxed text-muted-foreground">
            Xiryn can raise the engine&apos;s limit to {Math.ceil(needs.cpus)} processors
            and {Math.ceil(needs.memoryGb)} GB. It changes your WSL settings (a backup is
            kept) and restarts the engine, which stops running agents&apos; machines for a
            minute.
          </p>
          <Button
            size="sm"
            variant="secondary"
            className="w-fit"
            disabled={pending}
            onClick={raise}
          >
            {pending && <Spinner data-icon="inline-start" />}
            Raise the limit and restart the engine
          </Button>
        </div>
      )}
      {needs && !view.canRaiseEngine && (
        <p className="text-[12px] text-muted-foreground">
          Give the engine more in its own settings (Docker Desktop: Settings → Resources),
          then save again.
        </p>
      )}
      <div className="flex gap-2">
        <Button size="sm" disabled={pending} onClick={save}>
          {pending && <Spinner data-icon="inline-start" />}
          Save
        </Button>
        <Button
          size="sm"
          variant="ghost"
          disabled={pending}
          onClick={() => setOpen(false)}
        >
          Cancel
        </Button>
      </div>
    </div>
  )
}
