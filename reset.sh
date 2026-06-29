#!/usr/bin/env bash
set -euo pipefail

# IPS project reset script
# Usage:
#   ./reset.sh                # asks for confirmation, then cleans and restarts
#   ./reset.sh --yes          # non-interactive
#   ./reset.sh --keep-id      # preserve device_id.txt
#   ./reset.sh --keep-mqtt    # preserve mosquitto/data contents
#   ./reset.sh --no-install   # skip pip install in venv
#
# Default behavior:
#   1) Stops docker compose services and removes volumes
#   2) Removes device_id.txt for a fresh simulated phone identity
#   3) Clears Mosquitto persisted data
#   4) Ensures the venv exists and installs Python deps
#   5) Starts the stack fresh with docker compose up -d --build

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"

YES=0
KEEP_ID=0
KEEP_MQTT=0
NO_INSTALL=0

for arg in "$@"; do
  case "$arg" in
    --yes|-y) YES=1 ;;
    --keep-id) KEEP_ID=1 ;;
    --keep-mqtt) KEEP_MQTT=1 ;;
    --no-install) NO_INSTALL=1 ;;
    -h|--help)
      cat <<'EOF'
Usage: ./reset.sh [--yes] [--keep-id] [--keep-mqtt] [--no-install]

Default behavior:
  - docker compose down --remove-orphans --volumes
  - rm -f device_id.txt
  - rm -rf mosquitto/data/*
  - pip install -r server/requirements.txt inside ./venv
  - docker compose up -d --build
EOF
      exit 0
      ;;
    *)
      echo "Unknown argument: $arg" >&2
      exit 1
      ;;
  esac
done

echo "=== IPS reset ==="
echo "Project root: $ROOT_DIR"
echo

if [[ $YES -ne 1 ]]; then
  cat <<'EOF'
This will:
  - stop and remove Docker Compose containers
  - remove Docker volumes (including Postgres data)
  - clear Mosquitto persisted data
  - remove device_id.txt unless --keep-id is used
  - rebuild and restart the stack

EOF
  read -r -p "Continue? [y/N] " reply
  case "${reply,,}" in
    y|yes) ;;
    *)
      echo "Aborted."
      exit 0
      ;;
  esac
fi

command -v docker >/dev/null 2>&1 || { echo "docker is not installed or not in PATH" >&2; exit 1; }
docker compose version >/dev/null 2>&1 || { echo "docker compose is not available" >&2; exit 1; }

echo "[1/5] Stopping stack and removing volumes..."
docker compose down --remove-orphans --volumes

if [[ $KEEP_ID -eq 1 ]]; then
  echo "[2/5] Keeping device_id.txt"
else
  echo "[2/5] Removing device_id.txt for a fresh device identity..."
  rm -f device_id.txt
fi

if [[ $KEEP_MQTT -eq 1 ]]; then
  echo "[3/5] Keeping Mosquitto persisted data"
else
  echo "[3/5] Clearing Mosquitto persisted data..."
  mkdir -p mosquitto/data
  find mosquitto/data -mindepth 1 -maxdepth 1 -exec rm -rf {} +
fi

if [[ $NO_INSTALL -eq 1 ]]; then
  echo "[4/5] Skipping Python dependency install"
else
  echo "[4/5] Ensuring Python environment is ready..."
  if [[ ! -x ./venv/bin/python ]]; then
    echo "Missing ./venv/bin/python. Create the venv first, then rerun." >&2
    exit 1
  fi
  ./venv/bin/python -m pip install --upgrade pip
  ./venv/bin/python -m pip install -r server/requirements.txt
fi

echo "[5/5] Rebuilding and starting services..."
docker compose up -d --build

echo
echo "Stack started."
echo "Health check:"
sleep 2
if curl -fsS http://localhost:8000/health >/tmp/ips_health.json 2>/dev/null; then
  cat /tmp/ips_health.json
  echo
else
  echo "Backend is starting; run 'docker compose logs -f server' to watch progress."
fi

echo
echo "Next:"
echo "  - Run the simulator: ./venv/bin/python phone.py"
echo "  - Or fleet mode: NUM_DEVICES=50 ./venv/bin/python phone.py"
echo "  - Open the dashboard: dashboard/index.html"