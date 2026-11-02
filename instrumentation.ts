// Runs once when the Xiryn server boots
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return

  // Open the database (and apply pending migrations) before the first request
  const { connect } = await import("./db")
  connect()

  // The link that opens Xiryn in the person's browser (lib/browser-key.ts).
  // The first start makes its key and opens the link, so nobody has to find it.
  const { browserKey, unlockUrl } = await import("./lib/browser-key")
  const { created } = browserKey()
  console.log(`[xiryn] open Xiryn with this link: ${unlockUrl()}`)
  if (created) {
    const { openInBrowser } = await import("./lib/open-browser")
    openInBrowser(unlockUrl())
  }

  // One-time vault entries (codes, a card used once) don't outlive a day
  const { sweepVault } = await import("./lib/vault")
  sweepVault()
  setInterval(sweepVault, 60 * 60_000).unref()

  // Resume the Telegram bridge if a bot token is configured
  const { syncTelegram } = await import("./lib/telegram/bridge")
  syncTelegram()

  // Routines: tasks agents run on their own, on a schedule
  const { startRoutines } = await import("./lib/routines")
  startRoutines()

  // Workstations: see whether Docker is there, tidy up after deleted agents,
  // and get the workstation image ready so the first task doesn't wait for it
  const { probeEngine } = await import("./lib/docker")
  const { startWorkstationJanitor } = await import("./lib/workstation")
  const { buildImage, getImageState } = await import("./lib/workstation-image")
  const engine = await probeEngine().catch(() => null)
  startWorkstationJanitor()
  if (engine?.state === "ready") {
    getImageState()
      .then((image) => {
        if (image.state === "absent") {
          console.log("[xiryn] building the agent workstation image (first run only)…")
          return buildImage().then((tag) =>
            console.log(`[xiryn] workstation image ready: ${tag}`)
          )
        }
      })
      .catch((error) => console.error("[xiryn] workstation image:", error))
  }
}
