#!/usr/bin/env bash
set -euo pipefail
IFS=$'\n\t'

# IPS project reset script
#
# Usage:
#   ./reset.sh
#   ./reset.sh --yes
#   ./reset.sh --keep-id
#   ./reset.sh --keep-mqtt
#   ./reset.sh --no-install
#
# Default behavior:
#   1) Stop and remove Docker containers + volumes
#   2) Remove simulated device identity
#   3) Clear Mosquitto persistence
#   4) Install Python dependencies
#   5) Regenerate generated assets
#   6) Validate Python sources
#   7) Validate docker-compose.yml
#   8) Build and restart Docker
#   9) Wait for backend health

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
cat <<EOF
Usage: ./reset.sh [OPTIONS]

Options:
  --yes           Run without confirmation
  --keep-id       Preserve device_id.txt
  --keep-mqtt     Preserve Mosquitto persistence
  --no-install    Skip Python dependency installation
  -h, --help      Show this help

Default actions:

  • Stop Docker Compose
  • Remove Docker volumes
  • Delete device_id.txt
  • Clear mosquitto/data
  • Install Python dependencies
  • Regenerate floor assets
  • Validate Python syntax
  • Build & restart Docker
  • Wait for backend health
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
        docker-compose.yml
        requirements.txt
        server/requirements.txt
        phone.py
        server/main.py
        tools/render_floor_maps.py
        tools/floor_geometry.py
        maps/floor_3_grid.npy
        maps/floor_4_grid.npy
    )

    for f in "${required_files[@]}"; do
        if [[ ! -f "$f" ]]; then
            echo "Missing required file: $f"
            missing=1
        fi
    done

    [[ "$missing" -eq 0 ]] || exit 1
}

cleanup_mosquitto_data() {

    local data_dir="mosquitto/data"

    if [[ "$KEEP_MQTT" -eq 1 ]]; then
        echo "[3/9] Keeping Mosquitto persisted data"
        return
    fi

    echo "[3/9] Clearing Mosquitto persisted data..."

    mkdir -p "$data_dir"

    if ! find "$data_dir" -mindepth 1 -maxdepth 1 -exec rm -rf {} + 2>/dev/null; then
        if command -v sudo >/dev/null; then
            sudo find "$data_dir" -mindepth 1 -maxdepth 1 -exec rm -rf {} +
        else
            die "Unable to clear $data_dir"
        fi
    fi
}

wait_for_health() {

    local url="http://localhost:8000/health"
    local attempts=60

    echo
    echo "Waiting for backend..."

    for ((i=1;i<=attempts;i++)); do
        if curl -fsS "$url" >/dev/null 2>&1; then
            echo "✓ Backend is healthy"
            curl -fsS "$url"
            echo
            return
        fi
        sleep 1
    done

    echo
    echo "Backend failed to start."
    docker compose logs --tail=100 server || true
    exit 1
}

print_next_steps() {

cat <<EOF

=========================================
System ready
=========================================

Start dashboard:

    cd dashboard
    python3 -m http.server 8080

Start one simulator:

    FLOORS=3 ./venv/bin/python phone.py

Start many simulators:

    NUM_DEVICES=50 FLOORS=3,4 ./venv/bin/python phone.py

Dashboard:

    http://localhost:8080

Backend:

    http://localhost:8000/docs

=========================================

EOF
}

#########################################################

echo "========== IPS RESET =========="
echo "Project: $ROOT_DIR"
echo

if [[ "$YES" -eq 0 ]]; then

cat <<EOF
This will:

 • Stop Docker containers
 • Remove Docker volumes
 • Remove device_id.txt
 • Clear Mosquitto persistence
 • Regenerate floor assets
 • Rebuild Docker
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
docker compose version >/dev/null 2>&1 || die "docker compose is unavailable"

echo "[1/9] Stopping Docker..."
docker compose down --remove-orphans --volumes

if [[ "$KEEP_ID" -eq 1 ]]; then
    echo "[2/9] Keeping device_id.txt"
else
    echo "[2/9] Removing device_id.txt..."
    rm -f device_id.txt
fi

cleanup_mosquitto_data

if [[ "$NO_INSTALL" -eq 1 ]]; then

    echo "[4/9] Skipping dependency installation"

else

    echo "[4/9] Installing Python dependencies..."

    [[ -x ./venv/bin/python ]] || die "Virtual environment not found."

    ./venv/bin/python -m pip install --upgrade pip

    ./venv/bin/python -m pip install -r requirements.txt

    ./venv/bin/python -m pip install -r server/requirements.txt

fi

echo "[5/9] Regenerating floor assets..."

./venv/bin/python tools/render_floor_maps.py

generated=(
    dashboard/assets/floor_3.svg
    dashboard/assets/floor_4.svg
    db/02-rooms.sql
    server/floors.json
)

for f in "${generated[@]}"; do
    [[ -f "$f" ]] || die "Missing generated file: $f"
done

echo "[6/9] Checking Python syntax..."

./venv/bin/python -m py_compile \
    phone.py \
    server/main.py \
    tools/render_floor_maps.py \
    tools/floor_geometry.py

echo "[7/9] Validating Docker Compose..."

docker compose config >/dev/null

echo "[8/9] Building Docker stack..."

docker compose up -d --build

echo
docker compose ps
echo

echo "[9/9] Waiting for backend..."

wait_for_health

print_next_steps