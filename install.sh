#!/usr/bin/env bash
set -euo pipefail

echo "==> Checking prerequisites"

if ! command -v git >/dev/null 2>&1; then
  echo "Error: git is required but was not found on PATH." >&2
  exit 1
fi

if [ "$(uname -s)" != "Darwin" ]; then
  echo "Error: Trezi requires macOS 13.3 or later." >&2
  exit 1
fi
if ! xcrun --find swiftc >/dev/null 2>&1; then
  echo "Error: install Xcode command-line tools and the macOS 26 SDK first." >&2
  exit 1
fi
if ! command -v bun >/dev/null 2>&1; then
  echo "Error: Bun is required. Install it from https://bun.sh." >&2
  exit 1
fi
PM="bun"

TREZI_HOME="${TREZI_HOME:-${PRAXIS_HOME:-$HOME/.trezi}}"
# Keep an existing source installation in place for old launchers.
if [ "$TREZI_HOME" = "$HOME/.trezi" ] && [ ! -e "$TREZI_HOME" ] && [ -d "$HOME/.praxis/.git" ]; then
  TREZI_HOME="$HOME/.praxis"
fi

if [ -d "$TREZI_HOME/.git" ]; then
  echo "==> Updating existing install at $TREZI_HOME"
  git -C "$TREZI_HOME" pull --ff-only
else
  echo "==> Cloning Trezi into $TREZI_HOME"
  git clone https://github.com/alikimovich/praxis.git "$TREZI_HOME"
fi

cd "$TREZI_HOME"
echo "==> Checking macOS, SDK and Bun versions"
bun scripts/requirements.mjs --build

echo "==> Installing dependencies"
"$PM" install

echo "==> Building Trezi"
"$PM" run build

echo "==> Linking the trezi command"
mkdir -p "$HOME/.local/bin"
chmod +x "$TREZI_HOME/bin/trezi"
ln -sf "$TREZI_HOME/bin/trezi" "$HOME/.local/bin/trezi"
ln -sf "$TREZI_HOME/bin/trezi" "$HOME/.local/bin/praxis"

# Trezi.app stays in the checkout (it runs the backend beside it); Applications gets a
# link, so Finder, Spotlight and `open -a Trezi` find it. An existing app that is not
# a link is never replaced.
echo "==> Adding Trezi to Applications"
app="$TREZI_HOME/out/native/Trezi.app"
apps="${TREZI_APPLICATIONS:-/Applications}"
if [ ! -w "$apps" ]; then
  apps="$HOME/Applications"
  mkdir -p "$apps"
fi
if [ -L "$apps/Trezi.app" ] || [ ! -e "$apps/Trezi.app" ]; then
  ln -sfn "$app" "$apps/Trezi.app"
  echo "Linked $apps/Trezi.app"
else
  echo "$apps/Trezi.app already exists and is not a link; left alone. Start Trezi with: trezi"
fi
lsregister="${TREZI_LSREGISTER:-/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister}"
if [ -x "$lsregister" ]; then
  "$lsregister" -f "$app" >/dev/null 2>&1 || true
fi

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
  echo "Recommended: agent-browser lets Trezi check pages at phone, tablet, and desktop sizes."
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
            echo "Add $browser_dir to your PATH so Trezi can find agent-browser."
          fi
        fi
        if [ -n "$browser_bin" ] && "$browser_bin" install; then
          echo "agent-browser and its browser are ready."
        else
          echo "Browser setup did not finish. Once agent-browser is on PATH, run: agent-browser install"
        fi
      else
        echo "Optional agent-browser installation failed; Trezi is still installed."
        echo "You can retry later: $PM install --global agent-browser && agent-browser install"
      fi
      ;;
    *)
      echo "Skipped. Install later with: $PM install --global agent-browser && agent-browser install"
      ;;
  esac
fi

echo "==> Trezi installed to $TREZI_HOME"
echo "Run:  trezi   (or open Trezi from Applications; trezi <folder> opens a project)"
echo "(Run this installer again, or 'trezi --update', to update later.)"
