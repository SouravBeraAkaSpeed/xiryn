# Xiryn - one-step setup for Windows.
#
#   irm https://raw.githubusercontent.com/SouravBeraAkaSpeed/xiryn/main/setup.ps1 | iex
#
# or, inside a clone: double-click setup.cmd (or run .\setup.cmd)
#
# Installs whatever is missing (Git, Node.js, Docker Desktop) with winget,
# then Xiryn's packages and the agents' workstation image, and starts Xiryn.
# It asks once before installing anything. $env:XIRYN_YES = "1" skips it.
# -NoStart (or $env:XIRYN_NO_START = "1") sets everything up without starting Xiryn.
# -Local (or $env:XIRYN_LOCAL = "1") also sets up free local models with
# Ollama, so no API key is needed; -Model qwen3.5:9b picks the model yourself:
#
#   $env:XIRYN_LOCAL = "1"; irm https://raw.githubusercontent.com/SouravBeraAkaSpeed/xiryn/main/setup.ps1 | iex

param([switch]$NoStart, [switch]$Local, [string]$Model)
if ($env:XIRYN_NO_START -eq "1") { $NoStart = $true }
if ($env:XIRYN_LOCAL -eq "1") { $Local = $true }

$ErrorActionPreference = "Stop"
$Repo = "https://github.com/SouravBeraAkaSpeed/xiryn.git"

function Ok($text) { Write-Host "  [ok] $text" -ForegroundColor Green }
function Note($text) { Write-Host "  [!] $text" -ForegroundColor Yellow }
function Fail($text) { Write-Host "  [x] $text" -ForegroundColor Red; exit 1 }
function Has($command) { [bool](Get-Command $command -ErrorAction SilentlyContinue) }

function Ask($question) {
  if ($env:XIRYN_YES -eq "1") { return $true }
  $answer = Read-Host "  $question [Y/n]"
  return ($answer -eq "" -or $answer -match "^[Yy]")
}

# Picks up programs installed a moment ago without opening a new terminal
function Refresh-Path {
  $machine = [Environment]::GetEnvironmentVariable("Path", "Machine")
  $user = [Environment]::GetEnvironmentVariable("Path", "User")
  $env:Path = "$machine;$user"
}

function Node-Ok {
  if (-not (Has "node")) { return $false }
  $version = (node -v).TrimStart("v").Split(".")
  return ([int]$version[0] -gt 20) -or ([int]$version[0] -eq 20 -and [int]$version[1] -ge 9)
}

function Docker-Installed {
  (Has "docker") -or (Test-Path "$env:ProgramFiles\Docker\Docker\Docker Desktop.exe")
}

Write-Host ""
Write-Host "  xiryn - setup" -ForegroundColor White
Write-Host ""

$missing = @()
if (-not (Has "git")) { $missing += "Git" }
if (-not (Node-Ok)) { $missing += "Node.js LTS" }
if (-not (Docker-Installed)) { $missing += "Docker Desktop" }

if ($missing.Count -gt 0) {
  Write-Host "  To run Xiryn this computer needs: $($missing -join ', ')"
  if (-not (Has "winget")) {
    Fail "winget isn't available. Install 'App Installer' from the Microsoft Store, then run this again."
  }
  if (-not (Ask "Install them now? (Windows may ask for permission)")) {
    Fail "Nothing installed. Install them yourself, then run this again."
  }
}

$wingetArgs = @("--exact", "--silent", "--accept-package-agreements", "--accept-source-agreements")

if (-not (Has "git")) {
  winget install --id Git.Git @wingetArgs
  Refresh-Path
  if (-not (Has "git")) { Fail "Git didn't install. Get it from https://git-scm.com and run this again." }
}
if (-not (Node-Ok)) {
  winget install --id OpenJS.NodeJS.LTS @wingetArgs
  Refresh-Path
  if (-not (Node-Ok)) { Fail "Node.js didn't install. Get it from https://nodejs.org and run this again." }
}
$dockerFresh = $false
if (-not (Docker-Installed)) {
  winget install --id Docker.DockerDesktop @wingetArgs
  Refresh-Path
  $dockerFresh = $true
  Note "Docker Desktop installed. The first time, it may ask you to accept its terms or to restart Windows."
}

Ok "git $((git --version) -replace 'git version ', '')"
Ok "node $(node -v)"

# Run from inside a clone, or clone one here
$here = if ($PSScriptRoot) { $PSScriptRoot } else { (Get-Location).Path }
$isXiryn = { param($dir) (Test-Path "$dir\package.json") -and (Select-String -Path "$dir\package.json" -Pattern '"name": "xiryn"' -Quiet) }
if (& $isXiryn $here) {
  Set-Location $here
} elseif (& $isXiryn (Get-Location).Path) {
  # already here
} else {
  if (Test-Path "xiryn\.git") { Note "Using the existing .\xiryn folder" }
  else { git clone --depth 1 $Repo xiryn }
  Set-Location xiryn
}
Ok "xiryn in $((Get-Location).Path)"

Write-Host ""
npm install --no-fund --no-audit --loglevel=error
if ($LASTEXITCODE -ne 0) { Fail "npm install failed." }

# Docker Desktop, the workstation image and .env (and local models with -Local)
$setupArgs = @("--yes")
if ($Local) { $setupArgs += "--local" }
if ($Model) { $setupArgs += "--model=$Model" }
node scripts/setup.mjs @setupArgs
if ($LASTEXITCODE -ne 0 -and $dockerFresh) {
  Note "If Docker Desktop asked to restart Windows, restart, then run setup.cmd again."
}

Write-Host ""
if (-not $NoStart -and (Ask "Start Xiryn now?")) {
  $url = "http://127.0.0.1:6796"
  # Once it answers (a 401 counts), open its link: Xiryn only answers a
  # browser opened with it
  Start-Job -ScriptBlock {
    param($url, $dir)
    for ($i = 0; $i -lt 120; $i++) {
      try {
        Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 2 | Out-Null
      } catch {
        if (-not $_.Exception.Response) { Start-Sleep 1; continue }
      }
      Set-Location $dir
      node scripts/open.mjs | Out-Null
      return
    }
  } -ArgumentList $url, (Get-Location).Path | Out-Null
  Write-Host "  Xiryn is starting and opens in your browser - press Ctrl+C to stop it."
  Write-Host "  Next time, start it with: cd $((Get-Location).Path); npm run dev, then npm run open"
  Write-Host ""
  $env:XIRYN_NO_BROWSER = "1"
  try { npm run dev } finally { Remove-Item Env:XIRYN_NO_BROWSER -ErrorAction SilentlyContinue }
} else {
  Write-Host "  Start Xiryn any time with: cd $((Get-Location).Path); npm run dev"
  Write-Host ""
}
