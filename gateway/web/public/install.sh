#!/usr/bin/env bash
# abdalgani one-line installer (macOS / Linux / WSL / Git Bash)
#   curl -fsSL https://api.abdalgani.com/install.sh | bash -s -- --tool OpenCode --api-key sk-abd-...
set -euo pipefail
REPO="https://github.com/abdalganih1/Oh-My-abdalgani-code.git"
DIR="${ABDALGANI_HOME:-$HOME/.abdalgani}/Oh-My-abdalgani-code"

need() { command -v "$1" >/dev/null 2>&1; }
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
