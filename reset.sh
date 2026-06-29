#!/usr/bin/env bash
set -euo pipefail
IFS=$'\n\t'

# IPS project reset script
#
# Usage:
#   ./reset.sh                 # asks for confirmation, then cleans and restarts
#   ./reset.sh --yes           # non-interactive
#   ./reset.sh --keep-id       # preserve device_id.txt
#   ./reset.sh --keep-mqtt     # preserve mosquitto/data contents
#   ./reset.sh --no-install    # skip pip install in venv
#
# Default behavior:
#   1) Stops docker compose services and removes volumes
#   2) Removes device_id.txt for a fresh simulated phone identity
#   3) Clears Mosquitto persisted data
#   4) Ensures the venv exists and installs Python deps
#   5) Starts the stack fresh with docker compose up -d --build
#   6) Waits for the backend health endpoint to be ready

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"

YES=0
KEEP_ID=0
KEEP_MQTT=0
NO_INSTALL=0

die() {
  echo "Error: $*" >&2
  exit 1
}

need_cmd() {
  command -v "$1" >/dev/null 2>&1 || die "$1 is not installed or not in PATH"
}

usage() {
  cat <<'EOF'
Usage: ./reset.sh [--yes] [--keep-id] [--keep-mqtt] [--no-install]

Default behavior:
  - docker compose down --remove-orphans --volumes
  - rm -f device_id.txt
  - rm -rf mosquitto/data/*
  - pip install -r server/requirements.txt inside ./venv
  - docker compose up -d --build
  - wait for http://localhost:8000/health
EOF
}

for arg in "$@"; do
  case "$arg" in
    --yes|-y) YES=1 ;;
    --keep-id) KEEP_ID=1 ;;
    --keep-mqtt) KEEP_MQTT=1 ;;
    --no-install) NO_INSTALL=1 ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      die "Unknown argument: $arg"
      ;;
  esac
done

ensure_required_files() {
  local missing=0
  local required_files=(
    "docker-compose.yml"
    "server/requirements.txt"
    "maps/floor_3_grid.npy"
    "maps/floor_4_grid.npy"
  )

  for f in "${required_files[@]}"; do
    if [[ ! -f "$f" ]]; then
      echo "Missing required file: $f" >&2
      missing=1
    fi
  done

  if [[ "$missing" -ne 0 ]]; then
    exit 1
  fi
}

cleanup_mosquitto_data() {
  local data_dir="mosquitto/data"

  if [[ "$KEEP_MQTT" -eq 1 ]]; then
    echo "[3/6] Keeping Mosquitto persisted data"
    return 0
  fi

  echo "[3/6] Clearing Mosquitto persisted data..."
  mkdir -p "$data_dir"

  # Try as the current user first.
  if ! rm -rf "${data_dir:?}/"* 2>/dev/null; then
    # Fallback if the broker created root-owned files.
    if command -v sudo >/dev/null 2>&1; then
      sudo rm -rf "${data_dir:?}/"*
    else
      die "Could not clean $data_dir. Some files may be owned by another user."
    fi
  fi
}

wait_for_health() {
  local url="http://localhost:8000/health"
  local tmp_file="/tmp/ips_health.json"
  local max_attempts=60

  rm -f "$tmp_file"

  echo "Waiting for backend health..."
  for ((i = 1; i <= max_attempts; i++)); do
    if curl -fsS "$url" >"$tmp_file" 2>/dev/null; then
      echo "[OK] Backend is healthy"
      cat "$tmp_file"
      echo
      return 0
    fi
    sleep 1
  done

  echo
  echo "Backend did not become healthy in time."
  echo "Recent server logs:"
  docker compose logs --no-color --tail=80 server || true
  exit 1
}

print_next_steps() {
  cat <<'EOF'

Next steps:

  1) Start the dashboard:
     cd dashboard
     python3 -m http.server 8080

  2) Start the simulator:
     FLOORS=3 ./venv/bin/python phone.py

  3) For multiple simulated users:
     NUM_DEVICES=50 FLOORS=3,4 ./venv/bin/python phone.py

  4) Open:
     http://localhost:8080
EOF
}

echo "=== IPS reset ==="
echo "Project root: $ROOT_DIR"
echo

if [[ "$YES" -ne 1 ]]; then
  cat <<'EOF'
This will:
  - stop and remove Docker Compose containers
  - remove Docker volumes (including Postgres data)
  - clear Mosquitto persisted data
  - remove device_id.txt unless --keep-id is used
  - rebuild and restart the stack
EOF
  echo
  read -r -p "Continue? [y/N] " reply
  case "${reply,,}" in
    y|yes) ;;
    *)
      echo "Aborted."
      exit 0
      ;;
  esac
fi

ensure_required_files

need_cmd docker
need_cmd curl
docker info >/dev/null 2>&1 || die "Docker daemon is not running"
docker compose version >/dev/null 2>&1 || die "docker compose is not available"

echo "[1/6] Stopping stack and removing volumes..."
docker compose down --remove-orphans --volumes

if [[ "$KEEP_ID" -eq 1 ]]; then
  echo "[2/6] Keeping device_id.txt"
else
  echo "[2/6] Removing device_id.txt for a fresh device identity..."
  rm -f device_id.txt
fi

cleanup_mosquitto_data

if [[ "$NO_INSTALL" -eq 1 ]]; then
  echo "[4/6] Skipping Python dependency install"
else
  echo "[4/6] Ensuring Python environment is ready..."
  [[ -x ./venv/bin/python ]] || die "Missing ./venv/bin/python. Create the venv first, then rerun."
  ./venv/bin/python -m pip install --upgrade pip
  ./venv/bin/python -m pip install -r server/requirements.txt
fi

echo "[5/6] Rebuilding and starting services..."
docker compose up -d --build

echo
docker compose ps
echo

wait_for_health

echo "[6/6] Stack started successfully."
print_next_steps