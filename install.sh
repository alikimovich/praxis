#!/usr/bin/env bash
set -euo pipefail

echo "==> Checking prerequisites"

if ! command -v git >/dev/null 2>&1; then
  echo "Error: git is required but was not found on PATH." >&2
  exit 1
fi

if command -v bun >/dev/null 2>&1; then
  PM="bun"
elif command -v npm >/dev/null 2>&1; then
  echo "bun not found on PATH; falling back to npm."
  echo "(For faster installs, consider:  curl -fsSL https://bun.sh/install | bash)"
  PM="npm"
else
  echo "Error: neither bun nor npm was found on PATH." >&2
  echo "Install bun with:  curl -fsSL https://bun.sh/install | bash" >&2
  exit 1
fi

PRAXIS_HOME="${PRAXIS_HOME:-$HOME/.praxis}"

if [ -d "$PRAXIS_HOME/.git" ]; then
  echo "==> Updating existing install at $PRAXIS_HOME"
  git -C "$PRAXIS_HOME" pull --ff-only
else
  echo "==> Cloning Praxis into $PRAXIS_HOME"
  git clone https://github.com/alikimovich/praxis.git "$PRAXIS_HOME"
fi

echo "==> Installing dependencies"
cd "$PRAXIS_HOME"
"$PM" install

echo "==> Building Praxis"
"$PM" run build

echo "==> Linking the praxis command"
mkdir -p "$HOME/.local/bin"

if [ -f "$PRAXIS_HOME/bin/praxis.mjs" ]; then
  chmod +x "$PRAXIS_HOME/bin/praxis.mjs"
fi

ln -sf "$PRAXIS_HOME/bin/praxis.mjs" "$HOME/.local/bin/praxis"

case ":${PATH}:" in
  *":$HOME/.local/bin:"*)
    ;;
  *)
    rc_file="$HOME/.bashrc"
    case "${SHELL:-}" in
      */zsh)
        rc_file="$HOME/.zshrc"
        ;;
    esac
    echo "==> $HOME/.local/bin is not on your PATH"
    echo "    Add this line to $rc_file, then restart your shell:"
    echo "    export PATH=\"\$HOME/.local/bin:\$PATH\""
    ;;
esac

echo "==> Optional browser testing"
if command -v agent-browser >/dev/null 2>&1; then
  echo "agent-browser is already installed."
else
  echo "Recommended: agent-browser lets Praxis check pages at phone, tablet, and desktop sizes."
  echo "This installs the agent-browser CLI globally and downloads its browser."
  browser_answer=""
  # Read the terminal directly: stdin contains this script for curl ... | bash.
  # No controlling terminal (CI/unattended install) means skip, never hang.
  if { exec 3<>/dev/tty; } 2>/dev/null; then
    printf "Install agent-browser now? [y/N] " >&3
    read -r browser_answer <&3 || browser_answer=""
    exec 3>&-
  fi
  case "$browser_answer" in
    y|Y|yes|Yes|YES)
      browser_bin=""
      if "$PM" install --global agent-browser; then
        if command -v agent-browser >/dev/null 2>&1; then
          browser_bin="$(command -v agent-browser)"
        elif [ "$PM" = "bun" ]; then
          # A fresh Bun global bin directory may not be on PATH yet.
          browser_dir="$(bun pm bin -g 2>/dev/null)" || browser_dir=""
          if [ -n "$browser_dir" ] && [ -x "$browser_dir/agent-browser" ]; then
            browser_bin="$browser_dir/agent-browser"
            echo "Add $browser_dir to your PATH so Praxis can find agent-browser."
          fi
        fi
        if [ -n "$browser_bin" ] && "$browser_bin" install; then
          echo "agent-browser and its browser are ready."
        else
          echo "Browser setup did not finish. Once agent-browser is on PATH, run: agent-browser install"
        fi
      else
        echo "Optional agent-browser installation failed; Praxis is still installed."
        echo "You can retry later: $PM install --global agent-browser && agent-browser install"
      fi
      ;;
    *)
      echo "Skipped. Install later with: $PM install --global agent-browser && agent-browser install"
      ;;
  esac
fi

echo "==> Praxis installed to $PRAXIS_HOME"
echo "Run:  praxis"
echo "(Run this installer again, or 'praxis --update', to update later.)"
