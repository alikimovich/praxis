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

echo "==> Praxis installed to $PRAXIS_HOME"
echo "Run:  praxis"
echo "(Run this installer again, or 'praxis --update', to update later.)"
