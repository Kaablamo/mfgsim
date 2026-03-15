#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKEND_DIR="$ROOT_DIR/backend"
FRONTEND_DIR="$ROOT_DIR/frontend"
VENV_DIR="$ROOT_DIR/.venv"

if ! command -v python3 >/dev/null 2>&1; then
  echo "ERROR: python3 was not found on PATH."
  exit 1
fi

if ! command -v npm >/dev/null 2>&1; then
  echo "ERROR: npm was not found on PATH."
  exit 1
fi

echo "Creating virtual environment at $VENV_DIR..."
python3 -m venv "$VENV_DIR"

PYTHON_BIN="$VENV_DIR/bin/python"
PIP_BIN="$VENV_DIR/bin/pip"

echo "Upgrading pip..."
"$PYTHON_BIN" -m pip install --upgrade pip

echo "Installing backend dependencies..."
"$PIP_BIN" install -r "$BACKEND_DIR/requirements.txt"

echo "Installing frontend dependencies..."
(
  cd "$FRONTEND_DIR"
  npm install
)

echo
echo "Setup complete."
echo "Virtualenv: $VENV_DIR"
echo "Start the app with:"
echo "  bash scripts/dev.sh"
