#!/usr/bin/env bash
# abdalgani one-line installer (macOS / Linux / WSL / Git Bash)
#   curl -fsSL https://api.abdalgani.com/install.sh | bash -s -- --tool OpenCode --api-key sk-abd-...
# With a broken resolver curl can't even fetch this file; the fallback fetches it over DNS-over-HTTPS:
#   (curl -fsSL https://api.abdalgani.com/install.sh || curl -fsSL --doh-url https://1.1.1.1/dns-query https://api.abdalgani.com/install.sh) | bash
set -euo pipefail
REPO="https://github.com/abdalganih1/Oh-My-abdalgani-code.git"
DIR="${ABDALGANI_HOME:-$HOME/.abdalgani}/Oh-My-abdalgani-code"

need() { command -v "$1" >/dev/null 2>&1; }

# ── DNS: fresh VPSes often ship a resolver that resolves nothing. Point it at public DNS (1.1.1.1 / 8.8.8.8)
# when github.com / npm / the gateway don't resolve. Opt out: ABDALGANI_NO_DNS_FIX=1. Old file kept as *.abdalgani.bak.
resolves() { getent hosts "$1" >/dev/null 2>&1; }
dns_ok() { for h in api.abdalgani.com github.com registry.npmjs.org; do resolves "$h" || return 1; done; }
fix_dns() {
  local SUDO=""
  if [ "$(id -u)" != 0 ]; then
    if need sudo && sudo -n true 2>/dev/null; then SUDO="sudo"; else
      echo "⚠️  DNS is broken and fixing it needs root — run the installer with sudo, or see https://github.com/abdalganih1/Oh-My-abdalgani-code#dns"; return 1; fi
  fi
  echo "→ DNS on this machine resolves nothing — switching it to 1.1.1.1 / 8.8.8.8"
  if need systemctl && systemctl is-active -q systemd-resolved 2>/dev/null; then
    $SUDO mkdir -p /etc/systemd/resolved.conf.d
    printf '[Resolve]\nDNS=1.1.1.1 8.8.8.8\nFallbackDNS=1.0.0.1 8.8.4.4\n' | $SUDO tee /etc/systemd/resolved.conf.d/abdalgani-dns.conf >/dev/null
    $SUDO systemctl restart systemd-resolved
  else
    [ -e /etc/resolv.conf ] && $SUDO cp -L /etc/resolv.conf /etc/resolv.conf.abdalgani.bak 2>/dev/null || true
    $SUDO rm -f /etc/resolv.conf   # may be a dangling symlink to a resolver that isn't running
    printf 'nameserver 1.1.1.1\nnameserver 8.8.8.8\n' | $SUDO tee /etc/resolv.conf >/dev/null
  fi
  sleep 1
  if dns_ok; then echo "✅ DNS fixed"; else echo "⚠️  still no DNS — outbound port 53 may be blocked by the provider's firewall"; return 1; fi
}
if need getent && [ "${ABDALGANI_NO_DNS_FIX:-}" != 1 ] && ! dns_ok; then fix_dns || true; fi
if ! need git; then
  echo "→ installing git"; (need brew && brew install git) || (need apt-get && sudo apt-get update && sudo apt-get install -y git) || (need dnf && sudo dnf install -y git) || { echo "install git first"; exit 1; }
fi
if ! need node || [ "$(node -e 'console.log(process.versions.node.split(".")[0])')" -lt 20 ]; then
  echo "→ installing Node.js 22 (via nvm)"
  export NVM_DIR="$HOME/.nvm"
  [ -s "$NVM_DIR/nvm.sh" ] || curl -fsSL https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.3/install.sh | bash
  # shellcheck disable=SC1091
  . "$NVM_DIR/nvm.sh"; nvm install 22 >/dev/null; nvm use 22 >/dev/null
fi
mkdir -p "$(dirname "$DIR")"
if [ -d "$DIR/.git" ]; then git -C "$DIR" pull --ff-only --quiet; else git clone --depth 1 --quiet "$REPO" "$DIR"; fi
cd "$DIR"
npm install --silent --no-audit --no-fund
# permanent command: abdalgani-setup (--status / --sync / add tools later)
BIN="$HOME/.local/bin"; mkdir -p "$BIN"
NODE_BIN="$(command -v node)"
printf '#!/bin/sh\nexec "%s" "%s/setup.js" "$@"\n' "$NODE_BIN" "$DIR" > "$BIN/abdalgani-setup"
chmod +x "$BIN/abdalgani-setup"
case ":$PATH:" in *":$BIN:"*) ;; *)
  for rc in "$HOME/.bashrc" "$HOME/.zshrc"; do
    [ -f "$rc" ] && ! grep -q 'abdalgani-setup PATH' "$rc" && printf '\nexport PATH="$HOME/.local/bin:$PATH"  # abdalgani-setup PATH\n' >> "$rc"
  done
  export PATH="$BIN:$PATH";;
esac
# stdin is the curl pipe → reattach the terminal so interactive prompts work
if [ $# -eq 0 ] && [ -e /dev/tty ]; then exec node setup.js </dev/tty; fi
exec node setup.js "$@"
