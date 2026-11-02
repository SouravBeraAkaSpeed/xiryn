"use client"

import * as React from "react"
import Link from "next/link"
import {
  GlobeIcon,
  PlayIcon,
  PowerIcon,
  RefreshCwIcon,
  RotateCcwIcon,
} from "lucide-react"

import {
  bootWorkstation,
  haltWorkstation,
  wipeWorkstation,
  workstationNetwork,
  workstationStatus,
} from "@/actions/workstation"
import { Confirm } from "@/components/confirm"
import { MachineSize } from "@/components/workbench/machine-size"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { toast } from "@/components/ui/toast"
import type { WorkstationStatus } from "@/lib/workstation"
import { cn } from "@/lib/utils"

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-1.5">
      <span className="label-mono">{label}</span>
      <span className="min-w-0 truncate text-right font-mono text-[12px]">
        {children}
      </span>
    </div>
  )
}

const tone: Record<string, string> = {
  running: "bg-ok",
  starting: "animate-pulse-dot bg-rigel text-rigel",
  "no-docker": "bg-warn",
}

function size(bytes: number) {
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(1)} GiB`
  return `${Math.max(1, Math.round(bytes / 1024 ** 2))} MiB`
}

export function Machine({
  agentId,
  refreshKey,
}: {
  agentId: string
  refreshKey: number
}) {
  const [status, setStatus] = React.useState<WorkstationStatus | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [busy, setBusy] = React.useState<string | null>(null)
  const [internet, setInternet] = React.useState<
    "full" | "restricted" | "offline" | null
  >(null)

  const testInternet = async () => {
    setBusy("network")
    const result = await workstationNetwork(agentId)
    setBusy(null)
    if (result.ok) setInternet(result.internet)
    else
      toast.add({
        type: "error",
        title: "Couldn't test the network",
        description: result.error,
      })
  }

  const refresh = React.useCallback(async () => {
    const result = await workstationStatus(agentId)
    if (result.ok) {
      setStatus(result.status)
      setError(null)
    } else {
      setError(result.error)
    }
  }, [agentId])

  React.useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refresh()
  }, [refresh, refreshKey])

  // The machine also starts and stops elsewhere (the screen, a turn, idle
  // shutdown): keep the status current while it's on screen
  React.useEffect(() => {
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") void refresh()
    }, 10_000)
    return () => clearInterval(timer)
  }, [refresh])

  const run = async (label: string, action: () => Promise<WorkstationStatus>) => {
    setBusy(label)
    try {
      setStatus(await action())
    } catch (cause) {
      toast.add({
        type: "error",
        title: `Couldn't ${label} the workstation`,
        description: cause instanceof Error ? cause.message : String(cause),
      })
    } finally {
      setBusy(null)
    }
  }

  if (status?.state === "no-docker" && status.reason === "missing") {
    return (
      <div className="flex flex-col gap-3 p-4">
        <span className="label-mono">{"// workstation offline"}</span>
        <p className="text-[13px] leading-relaxed text-muted-foreground">
          Each agent can own a Linux machine with a shell, files and a desktop with a
          browser. It runs in Docker on this computer, separate from your own files.
          Install Docker to turn it on — Settings shows how.
        </p>
        <Button
          size="sm"
          variant="outline"
          nativeButton={false}
          render={<Link href="/settings#integrations" />}
          className="w-fit"
        >
          Open settings
        </Button>
      </div>
    )
  }

  const provisioned = status && "container" in status

  return (
    <div className="flex flex-col gap-4 p-3">
      <div className="flex items-center gap-2">
        <span
          className={cn(
            "size-2 rounded-full",
            status ? (tone[status.state] ?? "bg-faint/60") : "bg-faint/60"
          )}
        />
        <span className="font-mono text-[13px] font-medium">
          {status === null
            ? "checking…"
            : status.state === "unprovisioned"
              ? "not created yet"
              : status.state === "no-docker"
                ? "docker stopped"
                : status.state}
        </span>
        <Button
          size="icon-xs"
          variant="ghost"
          className="ml-auto"
          aria-label="Refresh"
          onClick={refresh}
        >
          <RefreshCwIcon />
        </Button>
      </div>

      {error && (
        <p className="rounded-md border border-destructive/30 bg-destructive/5 p-2 text-[12px] text-destructive">
          {error}
        </p>
      )}

      <div className="divide-y rounded-lg border px-3">
        {provisioned ? (
          <>
            <Row label="container">{status.container}</Row>
            <Row label="limits">
              {status.cpus || "all"} cpu ·{" "}
              {status.memoryGb ? `${status.memoryGb} GiB` : "no"} memory
            </Row>
            <Row label="screen">{status.screen}</Row>
            <Row label="home">
              {status.diskBytes === null ? "—" : `${size(status.diskBytes)} used`}
            </Row>
            {status.outdated && (
              <Row label="image">
                <span className="text-warn">update on next start</span>
              </Row>
            )}
            {status.resized && (
              <Row label="size">
                <span className="text-warn">new size on next start</span>
              </Row>
            )}
            <Row label="internet">
              {internet === null ? (
                <button
                  type="button"
                  onClick={testInternet}
                  disabled={!!busy}
                  className="inline-flex items-center gap-1 text-rigel hover:underline disabled:opacity-50"
                >
                  {busy === "network" ? (
                    <Spinner className="size-3" />
                  ) : (
                    <GlobeIcon className="size-3" />
                  )}
                  test
                </button>
              ) : (
                <span
                  className={cn(
                    internet === "full"
                      ? "text-ok"
                      : internet === "restricted"
                        ? "text-warn"
                        : "text-destructive"
                  )}
                  title={
                    internet === "restricted"
                      ? "Only some sites are reachable. A firewall, VPN or proxy on this computer may be filtering Docker's traffic."
                      : undefined
                  }
                >
                  {internet === "full"
                    ? "full access"
                    : internet === "restricted"
                      ? "essential services only"
                      : "offline"}
                </span>
              )}
            </Row>
          </>
        ) : (
          <p className="py-3 text-[12.5px] leading-relaxed text-muted-foreground">
            {status?.state === "no-docker"
              ? status.detail
              : "The machine is created the first time the agent needs it — or now, if you start it."}
          </p>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        {(!provisioned || status.state !== "running") && (
          <Button
            size="sm"
            variant="secondary"
            disabled={!!busy}
            onClick={() => run("start", () => bootWorkstation(agentId))}
          >
            {busy === "start" ? (
              <Spinner data-icon="inline-start" />
            ) : (
              <PlayIcon data-icon="inline-start" />
            )}
            Start
          </Button>
        )}
        {provisioned && status.state === "running" && (
          <Button
            size="sm"
            variant="outline"
            disabled={!!busy}
            onClick={() => run("stop", () => haltWorkstation(agentId))}
          >
            {busy === "stop" ? (
              <Spinner data-icon="inline-start" />
            ) : (
              <PowerIcon data-icon="inline-start" />
            )}
            Stop
          </Button>
        )}
        <MachineSize agentId={agentId} onSaved={() => void refresh()} />
        {provisioned && (
          <Confirm
            trigger={
              <Button
                size="sm"
                variant="ghost"
                className="text-destructive"
                disabled={!!busy}
              >
                <RotateCcwIcon data-icon="inline-start" />
                Reset
              </Button>
            }
            title="Reset the workstation?"
            description="The container and every file in its home folder are deleted. A fresh machine is created the next time the agent needs one. Memory is not affected."
            action="Reset workstation"
            onConfirm={() => run("reset", () => wipeWorkstation(agentId))}
          />
        )}
      </div>
      {internet && internet !== "full" && (
        <p className="rounded-md border border-warn/30 bg-warn/5 p-2.5 text-[12px] leading-relaxed text-muted-foreground">
          {internet === "offline"
            ? "This machine can't reach the internet. Check that this computer is online and that Docker's network isn't blocked by a VPN or firewall."
            : "Some sites are unreachable from this machine. A VPN, proxy or firewall on this computer may be filtering Docker's traffic."}
        </p>
      )}
      <p className="text-[11.5px] leading-relaxed text-faint">
        Runs in Docker on this computer, browsing from your own connection. It stops
        itself when idle and keeps its files unless auto-delete is on.
      </p>
    </div>
  )
}
