import { spawn } from "node:child_process"

// Opens a link in the person's default browser. Best effort: on a server
// without a desktop nothing opens, and the link is in the log instead.
export function openInBrowser(url: string) {
  if (process.env.CI || process.env.XIRYN_NO_BROWSER) return
  const [command, args] =
    process.platform === "win32"
      ? ["rundll32", ["url.dll,FileProtocolHandler", url]]
      : process.platform === "darwin"
        ? ["open", [url]]
        : ["xdg-open", [url]]
  try {
    spawn(command, args, { detached: true, stdio: "ignore", windowsHide: true })
      .on("error", () => {})
      .unref()
  } catch {}
}
