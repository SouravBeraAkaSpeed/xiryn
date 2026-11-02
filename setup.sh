#!/usr/bin/env bash
# Xiryn — one-step setup for macOS and Linux.
#
#   curl -fsSL https://raw.githubusercontent.com/SouravBeraAkaSpeed/xiryn/main/setup.sh | bash
#
# or, inside a clone:  ./setup.sh
#
# Installs whatever is missing (Git, Node.js, Docker), then Xiryn's packages
# and the agents' workstation image, and starts Xiryn. It asks once before
# installing anything. XIRYN_YES=1 skips the question.
# --no-start (or XIRYN_NO_START=1) sets everything up without starting Xiryn.
# --local (or XIRYN_LOCAL=1) also sets up free local models with Ollama, so
# no API key is needed:
#
#   curl -fsSL https://raw.githubusercontent.com/SouravBeraAkaSpeed/xiryn/main/setup.sh | bash -s -- --local
#
# --model=qwen3.5:9b picks the local model yourself.

set -euo pipefail

REPO="https://github.com/SouravBeraAkaSpeed/xiryn.git"
NODE_MAJOR=22

bold=$'\033[1m'; dim=$'\033[2m'; green=$'\033[32m'; yellow=$'\033[33m'; red=$'\033[31m'; reset=$'\033[0m'
ok() { printf '%s✓%s %s\n' "$green" "$reset" "$1"; }
note() { printf '%s!%s %s\n' "$yellow" "$reset" "$1"; }
fail() { printf '%s✗%s %s\n' "$red" "$reset" "$1"; exit 1; }
has() { command -v "$1" >/dev/null 2>&1; }

# A terminal someone can type into (a coding agent running this has none)
has_tty() { ( : </dev/tty ) 2>/dev/null; }

ask() {
  [ "${XIRYN_YES:-}" = 1 ] && return 0
  has_tty || return 1
  local answer
  read -r -p "  $1 ${dim}[Y/n]${reset} " answer </dev/tty || return 1
  [[ -z "$answer" || "$answer" =~ ^[Yy] ]]
}

# Steps that need your password can't run without a terminal: say exactly
# what to run, and stop so it can be run again afterwards
needs_you() {
  printf '\n%s!%s %s\n\n' "$yellow" "$reset" "$1"
  [ -n "${2:-}" ] && printf '    %s%s%s\n\n' "$bold" "$2" "$reset"
  printf '  Then run this setup again; it picks up where it left off.\n\n'
  exit 2
}

printf '\n  %sxiryn%s · setup\n\n' "$bold" "$reset"

os="$(uname -s)"
case "$os" in
  Darwin) platform=mac ;;
  Linux) platform=linux ;;
  *) fail "This script is for macOS and Linux. On Windows, run setup.cmd." ;;
esac

sudo_cmd=""
if [ "$platform" = linux ] && [ "$(id -u)" -ne 0 ]; then
  sudo_cmd="sudo"
  # Without a terminal, sudo can only work if it doesn't need a password
  can_sudo() { has_tty || sudo -n true 2>/dev/null; }
else
  can_sudo() { true; }
fi

# The package manager that installs Git and Node.js on Linux
if has apt-get; then manager=apt
elif has dnf; then manager=dnf
elif has pacman; then manager=pacman
elif has zypper; then manager=zypper
else manager=none
fi

node_ok() {
  has node || return 1
  node -e 'const [a,b]=process.versions.node.split(".").map(Number);process.exit(a>20||(a===20&&b>=9)?0:1)'
}

# On a Mac, /usr/bin/git is only a stub until Apple's command line tools
# are installed
git_ok() {
  if [ "$platform" = mac ] && ! xcode-select -p >/dev/null 2>&1; then
    [ -x /opt/homebrew/bin/git ] || [ -x /usr/local/bin/git ]
    return
  fi
  has git
}

docker_ok() {
  has docker || [ -d /Applications/Docker.app ]
}

missing=()
git_ok || missing+=("Git")
node_ok || missing+=("Node.js")
docker_ok || missing+=("Docker")

if [ ${#missing[@]} -gt 0 ]; then
  printf '  To run Xiryn this computer needs: %s%s%s\n' "$bold" "$(IFS=,; echo "${missing[*]}" | sed 's/,/, /g')" "$reset"
  ask "Install them now?" || fail "Nothing installed. Install them yourself, or run this again with XIRYN_YES=1."
fi

linux_install() {
  can_sudo || needs_you "Installing $1 needs your password. In your own terminal, run:" "$2"
  bash -c "$2"
}

install_git() {
  if [ "$platform" = mac ]; then
    if has brew; then brew install git; return; fi
    # Opens Apple's installer for the command line tools, which include Git
    xcode-select --install >/dev/null 2>&1 || true
    needs_you "Apple's installer for the command line tools (they include Git) is opening. Finish it."
  fi
  case "$manager" in
    apt) linux_install Git "$sudo_cmd apt-get update -y && $sudo_cmd apt-get install -y git" ;;
    dnf) linux_install Git "$sudo_cmd dnf install -y git" ;;
    pacman) linux_install Git "$sudo_cmd pacman -Sy --noconfirm git" ;;
    zypper) linux_install Git "$sudo_cmd zypper --non-interactive install git" ;;
    *) fail "Install Git (https://git-scm.com/downloads), then run this again." ;;
  esac
}

# The official Node.js build in your home folder: no administrator needed
install_node_home() {
  local arch file dir
  case "$(uname -m)" in
    arm64 | aarch64) arch=arm64 ;;
    x86_64) arch=x64 ;;
    *) fail "Install Node.js $NODE_MAJOR from https://nodejs.org, then run this again." ;;
  esac
  local kind=linux
  [ "$platform" = mac ] && kind=darwin
  file=$(curl -fsSL "https://nodejs.org/dist/latest-v$NODE_MAJOR.x/SHASUMS256.txt" |
    awk '{print $2}' | grep -E "^node-v[0-9.]+-$kind-$arch\.tar\.gz$" | head -1)
  [ -n "$file" ] || fail "Couldn't find a Node.js download. Install it from https://nodejs.org."
  dir="$HOME/.xiryn/node"
  rm -rf "$dir" && mkdir -p "$dir"
  curl -fsSL "https://nodejs.org/dist/latest-v$NODE_MAJOR.x/$file" | tar -xzf - -C "$dir" --strip-components=1
  export PATH="$dir/bin:$PATH"
  # So new terminals find it too
  local line='export PATH="$HOME/.xiryn/node/bin:$PATH"'
  for profile in "$HOME/.zprofile" "$HOME/.bash_profile" "$HOME/.profile"; do
    if [ -f "$profile" ] || [ "$profile" = "$HOME/.zprofile" -a "$platform" = mac ] || [ "$profile" = "$HOME/.profile" -a "$platform" = linux ]; then
      grep -qF "$line" "$profile" 2>/dev/null || printf '\n# Node.js for Xiryn\n%s\n' "$line" >>"$profile"
    fi
  done
}

install_node() {
  if [ "$platform" = mac ]; then
    if has brew; then
      brew install "node@$NODE_MAJOR"
      brew link --overwrite --force "node@$NODE_MAJOR" >/dev/null 2>&1 || true
      export PATH="$(brew --prefix "node@$NODE_MAJOR")/bin:$PATH"
    else
      install_node_home
    fi
    return
  fi
  if ! can_sudo; then
    install_node_home
    return
  fi
  case "$manager" in
    apt)
      $sudo_cmd apt-get update -y && $sudo_cmd apt-get install -y ca-certificates curl
      curl -fsSL "https://deb.nodesource.com/setup_$NODE_MAJOR.x" | ${sudo_cmd:+$sudo_cmd -E} bash -
      $sudo_cmd apt-get install -y nodejs
      ;;
    dnf)
      curl -fsSL "https://rpm.nodesource.com/setup_$NODE_MAJOR.x" | $sudo_cmd bash -
      $sudo_cmd dnf install -y nodejs
      ;;
    pacman) $sudo_cmd pacman -Sy --noconfirm nodejs npm ;;
    *) install_node_home ;;
  esac
}

# Docker Desktop on a Mac, straight from Docker into /Applications
install_docker_mac() {
  local arch tmp
  case "$(uname -m)" in
    arm64) arch=arm64 ;;
    *) arch=amd64 ;;
  esac
  if [ ! -w /Applications ]; then
    needs_you "Installing Docker Desktop needs an administrator. Install it from:" "https://www.docker.com/products/docker-desktop/"
  fi
  tmp="$(mktemp -d)"
  note "Downloading Docker Desktop (about 600 MB)…"
  curl -fL --progress-bar -o "$tmp/Docker.dmg" "https://desktop.docker.com/mac/main/$arch/Docker.dmg"
  hdiutil attach -nobrowse -quiet -mountpoint "$tmp/mount" "$tmp/Docker.dmg"
  cp -R "$tmp/mount/Docker.app" /Applications/
  hdiutil detach -quiet "$tmp/mount" || true
  rm -rf "$tmp"
  note "Docker Desktop is opening. Accept its terms (it may ask for your password once); Xiryn waits for it."
  open -a /Applications/Docker.app || true
}

install_docker() {
  if [ "$platform" = mac ]; then
    install_docker_mac
    return
  fi
  can_sudo || needs_you "Installing Docker needs your password. In your own terminal, run:" \
    "curl -fsSL https://get.docker.com | sudo sh && sudo usermod -aG docker \$USER"
  curl -fsSL https://get.docker.com | $sudo_cmd sh
  $sudo_cmd systemctl enable --now docker 2>/dev/null || true
  if [ -n "$sudo_cmd" ]; then
    $sudo_cmd usermod -aG docker "${USER:-$(id -un)}"
    note "Added you to the docker group. New terminals pick it up after you log out and back in."
  fi
}

git_ok || { install_git; ok "git installed"; }
node_ok || { install_node; hash -r; node_ok || fail "Node.js didn't install correctly."; ok "node $(node -v) installed"; }
docker_ok || { install_docker; hash -r; ok "docker installed"; }

ok "git $(git --version | awk '{print $3}')"
ok "node $(node -v)"

# Run from inside a clone, or clone one here
here="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" 2>/dev/null && pwd || pwd)"
if [ -f "$here/package.json" ] && grep -q '"name": "xiryn"' "$here/package.json"; then
  cd "$here"
elif [ -f package.json ] && grep -q '"name": "xiryn"' package.json; then
  :
else
  if [ -d xiryn/.git ]; then
    note "Using the existing ./xiryn folder"
  else
    git clone --depth 1 "$REPO" xiryn
  fi
  cd xiryn
fi
ok "xiryn in $(pwd)"

# On Linux the docker group only applies to new logins; run Docker steps
# through it now so nothing needs sudo
run_with_docker() {
  if [ "$platform" = linux ] && ! docker info >/dev/null 2>&1 && id -nG "${USER:-$(id -un)}" | grep -qw docker; then
    sg docker -c "$*"
  else
    bash -c "$*"
  fi
}

printf '\n'
npm install --no-fund --no-audit --loglevel=error
# Local models: --local and --model=… go on to the Node setup
setup_args="--yes"
for arg in "$@"; do
  case "$arg" in
    --local | --model=*) setup_args="$setup_args $arg" ;;
  esac
done
run_with_docker "node scripts/setup.mjs $setup_args"

printf '\n'
no_start="${XIRYN_NO_START:-0}"
for arg in "$@"; do [ "$arg" = --no-start ] && no_start=1; done
if [ "$no_start" = 0 ] && ask "Start Xiryn now?"; then
  url="http://127.0.0.1:6796"
  # Once it answers, open its link: Xiryn only answers a browser opened with it
  ( for _ in $(seq 120); do
      if curl -s -o /dev/null "$url"; then
        node scripts/open.mjs >/dev/null 2>&1
        exit 0
      fi
      sleep 1
    done ) &
  printf '  Xiryn is starting and opens in your browser — press Ctrl+C to stop it.\n'
  printf '  Next time, start it with: %scd %s && npm run dev%s, then %snpm run open%s\n\n' "$bold" "$(pwd)" "$reset" "$bold" "$reset"
  run_with_docker "XIRYN_NO_BROWSER=1 npm run dev"
else
  printf '  Start Xiryn any time with: %scd %s && npm run dev%s\n\n' "$bold" "$(pwd)" "$reset"
fi
