"use client"

import * as React from "react"
import type RFB from "@novnc/novnc"
import {
  ExpandIcon,
  HandIcon,
  Maximize2Icon,
  MonitorIcon,
  PlugZapIcon,
  RefreshCwIcon,
  Undo2Icon,
} from "lucide-react"

import { desktopAccess } from "@/actions/workstation"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog"
import { Spinner } from "@/components/ui/spinner"
import { cn } from "@/lib/utils"

type State = "idle" | "connecting" | "connected" | "disconnected" | "error"

// The desktop is reached under the loopback name this page isn't using.
// Browsers keep cookies per name, not per port, so Xiryn's own cookie
// (lib/browser-key.ts) never reaches the agent's machine.
function otherLoopbackName(url: string) {
  const desktop = new URL(url)
  desktop.hostname = window.location.hostname === "localhost" ? "127.0.0.1" : "localhost"
  return desktop.toString()
}

export function Screen({
  agentId,
  agentName,
  enabled,
  takeover,
  onTakeover,
  onHandBack,
  onLeaveTakeover,
}: {
  agentId: string
  agentName: string
  enabled: boolean
  // The person has the desktop and the agent is paused
  takeover: boolean
  onTakeover: () => void
  onHandBack: (note: string) => void
  onLeaveTakeover: () => void
}) {
  // One VNC connection draws into one element that is moved between the
  // side panel and the take-over view, so switching never reconnects
  const screenRef = React.useRef<HTMLDivElement | null>(null)
  const clientRef = React.useRef<RFB | null>(null)
  const attemptRef = React.useRef(0)
  const [state, setState] = React.useState<State>("idle")
  const [error, setError] = React.useState<string | null>(null)
  const [panelSlot, setPanelSlot] = React.useState<HTMLDivElement | null>(null)
  const [overlaySlot, setOverlaySlot] = React.useState<HTMLDivElement | null>(null)
  const [note, setNote] = React.useState("")
  // Watching in the large view, without taking control
  const [expanded, setExpanded] = React.useState(false)
  const big = takeover || expanded
  const overlayFrame = React.useRef<HTMLDivElement | null>(null)

  const screen = React.useCallback(() => {
    if (!screenRef.current) {
      screenRef.current = document.createElement("div")
      screenRef.current.className = "absolute inset-0 [&_canvas]:!cursor-default"
    }
    return screenRef.current
  }, [])

  const connect = React.useCallback(async () => {
    const attempt = ++attemptRef.current
    clientRef.current?.disconnect()
    clientRef.current = null
    setState("connecting")
    setError(null)
    try {
      const [{ url, password }, { default: Client }] = await Promise.all([
        desktopAccess(agentId),
        import("@novnc/novnc"),
      ])
      if (attempt !== attemptRef.current) return
      const target = screen()
      target.replaceChildren()
      const rfb = new Client(target, otherLoopbackName(url), {
        credentials: { username: "", password, target: "" },
      })
      rfb.scaleViewport = true
      rfb.background = "transparent"
      rfb.viewOnly = true
      rfb.addEventListener("connect", () => {
        if (attempt === attemptRef.current) setState("connected")
      })
      rfb.addEventListener("disconnect", () => {
        if (attempt !== attemptRef.current) return
        clientRef.current = null
        setState("disconnected")
      })
      clientRef.current = rfb
    } catch (cause) {
      if (attempt !== attemptRef.current) return
      setState("error")
      setError(cause instanceof Error ? cause.message : String(cause))
    }
  }, [agentId, screen])

  // Put the live screen wherever it is being shown
  React.useLayoutEffect(() => {
    const slot = big && overlaySlot ? overlaySlot : panelSlot
    if (slot && screen().parentElement !== slot) slot.appendChild(screen())
  }, [big, overlaySlot, panelSlot, screen])

  // The large view connects too, if the stream isn't up yet
  React.useEffect(() => {
    if (expanded && (state === "idle" || state === "disconnected")) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      void connect()
    }
  }, [expanded, state, connect])

  // Taking over from the large view keeps it open, now with control
  React.useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (takeover) setExpanded(false)
  }, [takeover])

  // Taking over connects if needed and hands the mouse and keyboard over
  React.useEffect(() => {
    if (takeover && (state === "idle" || state === "disconnected")) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      void connect()
    }
    const rfb = clientRef.current
    if (!rfb) return
    rfb.viewOnly = !takeover
    if (takeover) rfb.focus()
  }, [takeover, state, connect])

  React.useEffect(
    () => () => {
      attemptRef.current++
      clientRef.current?.disconnect()
      clientRef.current = null
    },
    []
  )

  const live = state === "connected"

  return (
    <div className="flex h-full flex-col gap-3 p-3">
      <div className="flex items-center gap-2 font-mono text-[10.5px] text-muted-foreground">
        <span
          className={cn(
            "size-1.5 rounded-full",
            takeover
              ? "bg-betelgeuse"
              : live
                ? "bg-ok"
                : state === "connecting"
                  ? "animate-pulse-dot bg-rigel text-rigel"
                  : "bg-faint/60"
          )}
        />
        <span>display :1</span>
        <span className="text-faint">·</span>
        <span>{takeover ? "you have control" : live ? "watching" : state}</span>
        <div className="ml-auto flex items-center gap-1">
          {(live || state === "disconnected" || state === "error") && (
            <Button
              size="icon-xs"
              variant="ghost"
              aria-label="Reconnect"
              onClick={connect}
            >
              <RefreshCwIcon />
            </Button>
          )}
          {enabled && !takeover && (
            <Button
              size="icon-xs"
              variant="ghost"
              aria-label="Expand the desktop"
              title="Expand"
              onClick={() => setExpanded(true)}
            >
              <ExpandIcon />
            </Button>
          )}
        </div>
      </div>

      <div
        className={cn(
          "relative aspect-[16/10] w-full overflow-hidden rounded-lg border bg-[oklch(0.12_0.01_265)]",
          takeover && "border-betelgeuse/40"
        )}
      >
        <div className="bg-grid absolute inset-0 opacity-60" />
        <div ref={setPanelSlot} className="absolute inset-0" />
        {big ? (
          <div className="absolute inset-0 grid place-items-center bg-black/60 p-6 text-center">
            <p className="font-mono text-[11px] text-white/70">
              {takeover ? "in use in the take-over view" : "showing in the large view"}
            </p>
          </div>
        ) : (
          !live && (
            <div className="absolute inset-0 grid place-items-center p-6 text-center">
              {state === "connecting" ? (
                <div className="flex flex-col items-center gap-3">
                  <Spinner className="size-5 text-rigel" />
                  <span className="font-mono text-[11px] text-white/60">
                    starting workstation · desktop
                  </span>
                </div>
              ) : !enabled ? (
                <div className="flex max-w-60 flex-col items-center gap-2">
                  <MonitorIcon className="size-6 text-white/40" />
                  <p className="text-[12.5px] text-white/60">
                    Workstations run in Docker on this computer. Install Docker (Settings
                    → Workstations) to give this agent a desktop.
                  </p>
                </div>
              ) : (
                <div className="flex max-w-64 flex-col items-center gap-3">
                  <MonitorIcon className="size-6 text-white/40" />
                  <p className="text-[12.5px] text-white/60">
                    {state === "error"
                      ? error
                      : state === "disconnected"
                        ? "The desktop stream closed."
                        : "Watch the agent's desktop live, or take it over yourself."}
                  </p>
                  <Button size="sm" variant="secondary" onClick={connect}>
                    <PlugZapIcon data-icon="inline-start" />
                    {state === "idle" ? "Connect" : "Reconnect"}
                  </Button>
                </div>
              )}
            </div>
          )
        )}
      </div>

      {enabled && !takeover && (
        <Button onClick={onTakeover} className="w-full" variant="secondary">
          <HandIcon data-icon="inline-start" />
          Take over
        </Button>
      )}
      <p className="text-[11.5px] leading-relaxed text-faint">
        Take over pauses {agentName} and gives you its mouse and keyboard — sign in, pay
        or fix something, then hand it back with a note and it carries on.
      </p>

      <Dialog
        open={big}
        onOpenChange={(open, details) => {
          if (open) return
          // Watching: Escape or a click outside closes. With control, Escape
          // belongs to the remote desktop and only the buttons leave.
          if (!takeover) setExpanded(false)
          else if (details.reason === "close-press") onLeaveTakeover()
        }}
        disablePointerDismissal={takeover}
      >
        <DialogContent
          initialFocus={false}
          showCloseButton={false}
          className="flex h-[min(94svh,900px)] max-w-[min(96vw,1280px)] flex-col gap-0 overflow-hidden p-0 sm:max-w-[min(96vw,1280px)]"
        >
          <div className="flex items-center gap-3 border-b px-4 py-2.5">
            <span
              className={cn(
                "size-2 rounded-full",
                takeover
                  ? "animate-pulse-dot bg-betelgeuse text-betelgeuse"
                  : live
                    ? "bg-ok"
                    : "animate-pulse-dot bg-rigel text-rigel"
              )}
            />
            <div className="flex min-w-0 flex-1 flex-col leading-tight">
              <DialogTitle className="text-[13.5px] font-semibold">
                {takeover
                  ? `You have control of ${agentName}'s desktop`
                  : `${agentName}'s desktop`}
              </DialogTitle>
              <DialogDescription className="font-mono text-[10.5px]">
                {takeover
                  ? `${agentName} is paused · your mouse and keyboard go to the workstation`
                  : `watching live · view only · ${agentName} keeps working`}
              </DialogDescription>
            </div>
            {!takeover && (
              <div className="flex items-center gap-1.5">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() =>
                    overlayFrame.current?.requestFullscreen?.().catch(() => {})
                  }
                >
                  <Maximize2Icon data-icon="inline-start" />
                  Fullscreen
                </Button>
                {enabled && (
                  <Button size="sm" variant="secondary" onClick={onTakeover}>
                    <HandIcon data-icon="inline-start" />
                    Take over
                  </Button>
                )}
                <Button size="sm" variant="ghost" onClick={() => setExpanded(false)}>
                  Close
                </Button>
              </div>
            )}
          </div>
          <div
            ref={overlayFrame}
            className="relative min-h-0 flex-1 bg-[oklch(0.1_0.01_265)]"
          >
            <div ref={setOverlaySlot} className="absolute inset-3" />
            {!live && (
              <div className="absolute inset-0 grid place-items-center">
                <Spinner className="size-5 text-rigel" />
              </div>
            )}
          </div>
          {takeover && (
            <form
              onSubmit={(event) => {
                event.preventDefault()
                onHandBack(note.trim())
                setNote("")
              }}
              className="flex flex-col gap-2 border-t bg-surface px-4 py-3 sm:flex-row sm:items-end"
            >
              <textarea
                value={note}
                onChange={(event) => setNote(event.target.value)}
                rows={1}
                placeholder={`Anything ${agentName} should know? e.g. "Logged in — pick the 6:15 flight" (optional)`}
                className="[field-sizing:content] min-h-9 flex-1 resize-none rounded-lg border border-input bg-transparent px-3 py-2 text-[13px] outline-none placeholder:text-faint focus-visible:border-ring dark:bg-input/30"
              />
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => {
                    setNote("")
                    onLeaveTakeover()
                  }}
                >
                  Stay paused
                </Button>
                <Button type="submit">
                  <Undo2Icon data-icon="inline-start" />
                  Hand back to {agentName}
                </Button>
              </div>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
