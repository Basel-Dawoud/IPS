# IPS — Indoor Positioning System

A graduation-project simulation of an indoor positioning system for a
two-floor retail space: a simulated phone publishes live position data over
MQTT, a FastAPI backend fans that out to a fast in-memory store and a
time-series database, and a browser dashboard shows people moving around the
building in real time plus historical traffic analytics.

Everything below reflects what's actually in this repo — file by file — not
an aspirational spec.

---

## 1. What it does

- **`phone.py`** simulates one or more phones walking real, corridor-aware
  routes across two real floor plans (floor 3 and floor 4), including
  physically walking to a stairwell and switching floors — not a random
  teleport.
- **Mosquitto** routes the MQTT traffic. It has zero application logic.
- **`server/main.py`** (FastAPI) is the *only* service that touches storage.
  It subscribes to MQTT, writes live state to **Redis**, writes full history
  to **TimescaleDB**, ACKs the device, and pushes live updates to connected
  dashboards over a WebSocket.
- **`dashboard/index.html`** is the live floor-plan view: animated dots,
  trails, per-device detail panel, live pipeline health, and a rolling
  60-minute occupancy/heatmap sidebar.
- **`dashboard/analytics.html`** is the historical/reporting view: peak
  occupancy, visitors per floor, top stores, room heatmaps, hourly traffic,
  and live throughput metrics.

---

## 2. Architecture

```
phone.py (simulator)
    │
    │  MQTT (position / status)
    ▼
Mosquitto Broker          ← routes messages only, zero logic
    │
    │  MQTT subscription
    ▼
FastAPI Backend (server/main.py)   ← the ONLY service that writes to storage
    │
    ├──▶ Redis                     ← latest position/status per device (real-time, TTL-based)
    │
    └──▶ PostgreSQL + TimescaleDB  ← full position history
              │
              └──▶ Continuous aggregates → occupancy charts, room heatmaps, "most visited"
```

The dashboard reads from **both** storages through the FastAPI API layer —
it never touches Redis or Postgres directly:

```
phone.py → MQTT → Mosquitto → FastAPI
                                   │
                 ┌─────────────────┴─────────────────┐
                 ▼                                    ▼
              Redis                              PostgreSQL
           (real-time)                         (history/analytics)
                 │                                    │
                 └──────────── dashboard/*.html ───────┘
                          (WebSocket + REST, via FastAPI)
```

| Question | Answered from | Why |
|---|---|---|
| Where is everyone right now? | Redis, via `/ws/live` | Sub-millisecond reads, pushed the instant a position arrives |
| Occupancy chart / heatmap / top stores | PostgreSQL continuous aggregates | Historical range query; a few seconds of latency is fine |
| Is a device still around? | Redis TTL | Keys expire automatically — no manual cleanup, no "ghost" devices |
| Full movement history for one device | PostgreSQL | Persistent record, never expires |

---

## 3. Repository layout

```
.
├── phone.py                 # MQTT simulator — the "phone"
├── server/
│   ├── main.py               # FastAPI backend — MQTT, Redis, Postgres, WebSocket, REST
│   ├── floors.json           # generated: per-floor dimensions, corridor rows, room directory
│   ├── Dockerfile
│   └── requirements.txt      # server-only deps (fastapi, asyncpg, redis, aiomqtt, websockets)
├── dashboard/
│   ├── index.html             # live floor-plan view
│   ├── analytics.html         # historical analytics view
│   └── assets/                # generated floor_3/floor_4 .svg + .png
├── db/
│   ├── init.sql                # device_positions hypertable + continuous aggregates
│   └── 02-rooms.sql            # generated: rooms table seed (id, name, bounding box)
├── tools/
│   ├── floor_geometry.py       # detects corridor band + room blocks from the raw grids
│   ├── render_floor_maps.py    # regenerates SVG/PNG assets, floors.json, 02-rooms.sql
│   └── inspect_floor_maps.py   # ASCII + matplotlib inspector for the raw .npy grids
├── maps/
│   ├── floor_3_grid.npy        # raw floor grid: 0=open, 1=wall, 2/3=tagged zone
│   └── floor_4_grid.npy
├── mosquitto/mosquitto.conf
├── docs/
│   ├── MQTT_CONTRACT.md          # topic/payload spec — single source of truth for the wire format
│   ├── DASHBOARD_MQTT_RULES.md
│   └── MOBILE_APP_MQTT_RULES.md
├── tests/
│   └── test_floor_geometry.py  # unit tests against the real committed .npy grids, no Docker needed
├── docker-compose.yml
├── Makefile
├── reset.sh                    # full clean rebuild + health check
├── requirements.txt             # host-side deps for phone.py + tools/ + tests (NOT used by the server container)
└── .env.example
```

---

## 4. The MQTT contract (short version)

Full spec: **`docs/MQTT_CONTRACT.md`**. Summary:

```
ips/<building_id>/device/<device_id>/position    qos=0, retain=false
ips/<building_id>/device/<device_id>/status       qos=1, retain=true
ips/<building_id>/device/<device_id>/command      qos=1, retain=false   (ACKs, server → device)
ips/<building_id>/device/<device_id>/alert        qos=1, retain=false
```

Floor lives **in the payload**, never in the topic — a device changing
floors doesn't need to resubscribe or change its topic tree.

Each `position` payload includes the raw grid cell the simulator walked to
(`grid_row`, `grid_col`, `map_value`), the published metric coordinates
(`x`, `y`), the nearest `room_id`, a `zone_id`, and a jittered `accuracy`
value — enough for the dashboard to render a realistic-looking live dot
without pretending to have real beacon hardware.

---

## 5. Backend (`server/main.py`)

FastAPI app. On startup it connects to Postgres and Redis (retrying a few
times if the containers aren't ready yet), then starts a background MQTT
subscriber loop that never blocks request handling.

**MQTT → storage flow**, per message:
1. Parse JSON. Bad payloads are logged and dropped, not crashed on.
2. **Position messages:** write to Redis first (this is the part that must
   succeed for the device to get a `"stored"` ACK) → broadcast immediately
   to every connected dashboard over WebSocket → best-effort write to
   Postgres for history (a Postgres failure is logged but does **not** turn
   the ACK into an error — live state already succeeded).
3. **Status messages:** same Redis-write-then-broadcast pattern, no
   history write (status is a heartbeat, not a position sample).

### REST endpoints

| Endpoint | Purpose |
|---|---|
| `GET /health` | MQTT/Redis/Postgres connectivity, for the dashboard's status strip |
| `GET /floors` | Full contents of `floors.json` — dimensions, image path, `meters_per_cell` calibration, corridor rows, room directory |
| `GET /rooms?floor=` | Static room directory (id, name, bounding box) |
| `GET /live/positions` | Current position of every active device (same data the WebSocket sends on connect) |
| `GET /live/status/{device_id}` | Latest heartbeat for one device |
| `GET /alerts/active` | Currently-crowded rooms (in-memory, resets on restart) — same data pushed live over `/ws/live` |
| `GET /history/device/{device_id}?limit=` | Raw position history for one device, most recent first |
| `GET /analytics/floor/{floor}?minutes=` | 5-minute-bucketed occupancy time series for one floor |
| `GET /analytics/rooms?floor=&minutes=&limit=` | Per-room visit counts, ranked — "most visited stores" |
| `GET /analytics/heatmap?floor=&minutes=` | Per-room visit intensity, normalized 0–1 against the busiest room |
| `WS /ws/live` | Push-only: one full snapshot on connect (positions *and* any already-active alerts), then incremental `position`/`status`/`alert` events the instant they arrive — no polling |

### Config (environment variables, all set in `docker-compose.yml` / `.env`)

| Variable | Default | Meaning |
|---|---|---|
| `MQTT_HOST` | `mosquitto` | Broker hostname |
| `REDIS_HOST` / `REDIS_PORT` | `redis` / `6379` | Redis connection |
| `LIVE_KEY_TTL_SECONDS` | `180` | How long a device's live Redis key survives with no update before it's considered offline |
| `CORS_ALLOWED_ORIGINS` | `http://localhost:8080,http://127.0.0.1:8080` | Browser origins allowed to call the API. **Must match the dashboard's origin exactly** (scheme + host + port) or requests are silently blocked — add your demo-day IP here before presenting from anywhere else. |
| `POSTGRES_HOST/DB/USER/PASSWORD/PORT` | see `.env.example` | Postgres connection |
| `HISTORY_SAMPLING_ENABLED` | `false` | Optional: write only 1-in-N position messages to Postgres history (Redis/WebSocket always get every message). Off until write volume is actually a problem. |
| `CROWD_ALERT_THRESHOLD` | `8` | Live occupant count in a room that triggers a crowd alert |
| `CROWD_ALERT_CHECK_INTERVAL_SECONDS` | `3` | How often room occupancy is re-checked against the threshold — decoupled from MQTT message rate on purpose, see §6a |

---

## 6. Storage (`db/init.sql`, `db/02-rooms.sql`)

- **`device_positions`** — a TimescaleDB hypertable, one row per position
  sample: `ts, device_id, building_id, floor, zone_id, room_id, x, y`.
  Indexed by `(device_id, ts)` and `(building_id, floor, ts)` for fast
  per-device and per-floor queries.
- **`crowd_analytics`** — a continuous aggregate: unique device count per
  floor, bucketed every 5 minutes. Powers `/analytics/floor/{floor}`.
- **`room_visits`** — a continuous aggregate: visit count per room,
  bucketed every 5 minutes, excluding samples with no `room_id` (e.g. a
  device in the corridor between stores). Powers `/analytics/rooms` and
  `/analytics/heatmap`.
- **`rooms`** — a plain table (id, floor, name, bounding box), regenerated
  by `tools/render_floor_maps.py` from the same `Room` objects used to
  label the SVG floor plans, so the database and the dashboard's labels can
  never drift apart.

**Important:** continuous aggregates rely on TimescaleDB's background job
scheduler (`add_continuous_aggregate_policy`), which is **not** included in
the `-oss` (pure Apache-2.0) Docker image. `docker-compose.yml` must use the
community image:

```yaml
image: timescale/timescaledb:2.27.0-pg16     # NOT the -oss variant
```

If you ever see `functionality not supported under the current "apache"
license` in the postgres container logs, that's this — the `-oss` tag was
used and the continuous aggregates silently failed to create (the container
still reports "healthy" because the healthcheck is just `pg_isready`, which
has no idea `init.sql` errored out partway through).

---

## 6a. Crowd alerting

`server/main.py` runs a background check (`crowd_alert_loop`, every
`CROWD_ALERT_CHECK_INTERVAL_SECONDS`) that groups current live positions by
room and compares each room's occupant count against
`CROWD_ALERT_THRESHOLD`. This runs on its own timer rather than per MQTT
message on purpose — checking room occupancy on every single position
update would scale with message rate for no benefit, exactly the kind of
hot-path cost this project has otherwise been careful to avoid.

On a room **crossing into** crowded:
- every device currently in that room gets an MQTT push on its own
  `ips/<building_id>/device/<device_id>/alert` topic, `{"type": "emergency",
  "message": ..., "ts": ..., ...}` — matching the payload shape
  `docs/MOBILE_APP_MQTT_RULES.md` already documented before this existed
- every connected dashboard gets a `{"type": "alert", "level": "warning",
  ...}` WebSocket push

On a room **recovering** (dropping to `CROWD_ALERT_THRESHOLD -
CROWD_ALERT_HYSTERESIS`, a small deadband so a count hovering right at the
line doesn't flap alert/clear every check), dashboards get a matching
`"level": "clear"` push. Devices don't get a second MQTT push for this —
the mobile contract's `"emergency"` type is a full-screen takeover, and
"you can stop worrying now" isn't really an emergency; the dashboard's own
channel isn't bound by that contract and benefits from seeing the
resolution.

A dashboard connecting (or reconnecting) mid-alert doesn't miss it: the
`/ws/live` snapshot includes `active_alerts` alongside the position list,
and `GET /alerts/active` exposes the same state over REST.

This state is in-memory only — it resets on server restart, same as the
rest of the live (non-history) state.

---

## 7. Simulator (`phone.py`)

Loads the real floor grids (`maps/floor_3_grid.npy`, `maps/floor_4_grid.npy`)
and `server/floors.json`, and moves one or more simulated devices along
actual corridor cells — never through a wall, never inside a room interior
(`CORRIDOR_ONLY=true` by default).

**Default route** (`FloorNavigator`, BFS-pathfound over the real grid):

```
floor 3, spawn near the start
   → walk to the right-side stairs (grid value 2, "tagged zone")
   → floor transition → floor 4, arrive at its right stairs
   → walk to the left-side stairs
   → floor transition → floor 3, arrive at its left stairs
   → repeat
```

Stair locations are configured per floor by column (`STAIRS` dict) and
resolved to the nearest actual walkable `value == 2` cell at runtime, so a
floor-plan regeneration doesn't silently break the route.

**Movement is calibrated to real walking speed, not one grid cell per publish
tick.** Each floor's `meters_per_cell` (see §7a below) turns `WALK_SPEED_MPS`
into a real distance covered per tick; on this grid (~0.195 m/cell) that's
several whole-cell hops per 0.5s tick, plus a sub-cell fractional lead-in
toward the next queued cell so the reported position moves smoothly rather
than only snapping between cell centers. A persistent per-device progress
accumulator carries fractional budget across ticks, so a slower speed or a
coarser future grid doesn't lose progress between ticks — it just takes a
few more of them to bank a whole cell. See `SimulatedDevice.step_position()`'s
docstring for the exact mechanism.

Each position payload carries the real grid cell (`grid_row`/`grid_col`, the
*last whole cell* reached — used for zone/room lookups), a small jittered
offset in real meters (`POSITION_JITTER_METERS`) so dots don't look
perfectly snapped to a path, a jittered `accuracy` in real meters, the
nearest `room_id` (looked up from the room directory by column), a `motion`
field (`walking`/`stationary`), and `x`/`y` in real meters (`"units":
"meters"`) — the same convention `GET /floors`'s `meters_per_cell`/`origin`
already used on the dashboard side.

### Config (environment variables)

| Variable | Default | Meaning |
|---|---|---|
| `NUM_DEVICES` | `1` | `1` = single stable device (`device_id.txt`), persisted across restarts. `>1` = a fleet of ephemeral devices for load testing. |
| `FLOORS` | `3,4` | Which floor maps to load |
| `MQTT_HOST` / `MQTT_PORT` | `localhost` / `1883` | Broker to connect to (from the host, not inside Docker) |
| `BUILDING_ID` | `building1` | Building segment in every topic |
| `POSITION_INTERVAL_SECONDS` | `0.5` | How often a position is published |
| `STATUS_INTERVAL_SECONDS` | `30` | How often a heartbeat/battery status is published |
| `CORRIDOR_ONLY` | `true` | Confine movement to the corridor band only; `false` allows the whole walkable floor (debugging) |
| `WALKABLE_VALUES` | `0,2,3` | Which grid values count as walkable |
| `WALK_SPEED_MPS` | `1.2` | Real walking pace in meters/second — see §7a |
| `WALK_SPEED_JITTER` | `0.15` | ± fraction of random per-tick speed variation, so pace doesn't feel metronomic |
| `POSITION_JITTER_METERS` | `0.3` | Simulated sensor/fingerprinting noise, in real meters — independent of grid resolution |
| `ACCURACY_METERS_MIN` / `ACCURACY_METERS_MAX` | `0.6` / `1.8` | Range for the self-reported `accuracy` field |

`TURN_PROBABILITY` is still defined in `phone.py` but isn't read anywhere —
a leftover from an earlier random-walk navigator, since replaced by the
deterministic BFS-pathed one. `COORD_SCALE` has been removed: it was the
"arbitrary grid jump" scale knob this section's calibration replaces: if
you had it set in your `.env`, it's now a no-op.

Run one simulated user:
```bash
FLOORS=3,4 ./venv/bin/python phone.py
```
Run a fleet for load testing:
```bash
NUM_DEVICES=50 FLOORS=3,4 ./venv/bin/python phone.py
```

---

## 7a. Real-world calibration

`tools/render_floor_maps.py` computes each floor's `meters_per_cell` from a
measured building footprint (`REAL_FLOOR_LENGTH_METERS = 93.0`), dividing by
that floor's column count. This is the single source of truth both the
simulator and the dashboard read — nothing hardcodes a scale independently
anymore.

**A real, known limitation, not swept under the rug:** the two floor grids
don't have identical pixel dimensions (floor 3 is 477×89, floor 4 is
476×99), so calibrating off length alone means the row-count-implied width
doesn't exactly match the measured `15.765m` on either floor (floor 3 comes
out ~10% wide, floor 4 ~23% wide). A single `meters_per_cell` scalar can't
make both axes exactly right on both floors at once unless the grids'
aspect ratios matched the real footprint's aspect ratio precisely, and they
don't quite. Length was chosen over width because a straight corridor run
is the dimension most reliably measured on-site with one tape-measure pull;
width of an irregular retail floor (varying room depths, doorway recesses)
is more likely to already be an approximate figure. If you re-measure and
find the opposite is true for your site, swap which axis
`real_meters_per_cell()` divides by.

Re-run `tools/render_floor_maps.py` any time the real footprint measurement
changes, or hand-edit `meters_per_cell` directly in `server/floors.json` for
a one-off override — either survives the next regeneration (see §10).

---

## 8. Dashboard

Two static HTML files served by any static file server (e.g.
`python3 -m http.server 8080` from `dashboard/`) — no build step.

### `index.html` — live view
- Canvas-rendered floor plan (SVG background + animated device overlay),
  with a floor tab per level and an animated transition when switching.
- Interpolated device dots with a fading trail, an accuracy halo, and a
  selection ring; click a dot or a list row to select it.
- **Occupancy panel** — current count on this floor + total across floors.
- **Active alerts panel** — currently-crowded rooms, populated from
  `/ws/live`'s `"alert"` events and the connect-time snapshot; a pulsing red
  outline highlights the affected room on the canvas when it's on the
  active floor.
- **Selected device panel** — ID, floor, battery, position, nearest room,
  motion, accuracy, time-in-room (`trackRoomDwell`), last update age.
- **Live analytics sidebar** — 60-minute occupancy sparkline, most-visited
  stores, and an optional per-room heatmap overlay that shows a clear "no
  traffic data yet" note instead of a misleading empty tint when a floor
  has no real visits in the window.
- **System health strip** — MQTT/Redis/DB connectivity dots, polled from
  `/health`.

### `analytics.html` — historical/reporting view
- **Peak occupancy** (24h) and **visitors per floor**, computed from
  `/analytics/floor/{floor}`.
- **Top stores**, from `/analytics/rooms`.
- **Per-floor heatmap tiles**, from `/analytics/heatmap`.
- **Hourly traffic chart** — a true chronological last-24-hours timeline
  (bucketed by elapsed hours-ago from now, not by hour-of-day, so a window
  crossing midnight doesn't merge two different days into one bar).
- **Devices online now** — polled from `/live/positions`, which self-prunes
  via Redis TTL (not accumulated from websocket traffic, which would only
  ever grow).
- **Live update rate** — position/status pushes per second over `/ws/live`,
  5-second rolling window.
- **Backend response time**, from round-tripping `/health`.

Both pages talk to the backend at `http://<hostname>:8000` by default
(same-machine assumption); the API base is derived from `location.hostname`
so it works unmodified when opened from another machine on the LAN too.

---

## 9. Running it

```bash
cp .env.example .env          # adjust POSTGRES_PASSWORD etc. if you want
docker compose up --build -d  # mosquitto, redis, postgres, server
cd dashboard && python3 -m http.server 8080   # serve the dashboard
FLOORS=3,4 ./venv/bin/python phone.py         # start the simulator (separate terminal)
```

Then open `http://localhost:8080/index.html` (live view) and
`http://localhost:8080/analytics.html` (historical view). Backend API docs
(auto-generated by FastAPI) are at `http://localhost:8000/docs`.

### `Makefile` shortcuts

| Target | Does |
|---|---|
| `make up` | `docker compose up --build` |
| `make down` | Stop containers |
| `make reset` | Stop + wipe volumes + rebuild |
| `make render-maps` | Regenerate SVG/PNG assets, `floors.json`, `02-rooms.sql` from the raw `.npy` grids |
| `make simulate` | Run `phone.py` |
| `make logs` | Tail the server container's logs |
| `make db` / `make redis-cli` | Open a psql / redis-cli shell inside the running container |
| `make test` | Curl `/health` and `/live/positions` |
| `make test-unit` | Run the `tests/` pytest suite (floor geometry detection against the real grids) — no Docker stack needed |

### `reset.sh`

A full clean rebuild in one command: stops and removes containers +
volumes, optionally clears `device_id.txt` and Mosquitto's persisted state,
reinstalls Python dependencies, regenerates the floor assets, syntax-checks
every Python source, validates `docker-compose.yml`, rebuilds, and polls
`/health` until the backend is actually up (printing the last 100 log lines
if it never comes up). Flags: `--yes`, `--keep-id`, `--keep-mqtt`,
`--no-install`. Run `./reset.sh --help` for the full list.

---

## 10. Regenerating the floor plans

If `maps/floor_3_grid.npy` or `maps/floor_4_grid.npy` ever change (new
survey, layout change), or `ROOM_DIRECTORY` in `tools/floor_geometry.py` is
edited (room numbers/names are real-world ground truth, not something
derivable from the grid — see the module docstring), regenerate every
downstream artifact in one step:

```bash
./venv/bin/python tools/render_floor_maps.py
```

This rewrites `dashboard/assets/floor_*.svg`/`.png`, `server/floors.json`
(preserving any manually-calibrated `meters_per_cell`/`origin` you've
already set), and `db/02-rooms.sql` — all from the same detected room
geometry, so the SVG labels, the dashboard's room lookup, and the database
seed can never disagree with each other.

`meters_per_cell` is computed automatically from `REAL_FLOOR_LENGTH_METERS`
(see §7a) — no manual measurement-and-edit step needed for a fresh
regeneration. A hand-edited override in `server/floors.json` (anything other
than `null` or the old `1.0` placeholder) is still preserved across re-renders.

---

## 11. Two dependency files, on purpose

- **`requirements.txt`** (repo root) — for the host-side `./venv` only, used
  to run `phone.py` and `tools/*.py`. Needs `numpy`, `pillow`, `matplotlib`.
- **`server/requirements.txt`** — for the Docker image only (`fastapi`,
  `asyncpg`, `redis`, `aiomqtt`, `websockets`). Deliberately excludes
  `numpy`/`matplotlib` so the server image stays small and doesn't rebuild
  slowly for a dependency it never uses.

---

## 12. Docs

- **`docs/MQTT_CONTRACT.md`** — the wire-format source of truth: topics,
  QoS/retain rules, the `device_id` identity rule, full payload schemas.
- **`docs/DASHBOARD_MQTT_RULES.md`** — what the dashboard is/isn't allowed
  to assume about the live data feed.
- **`docs/MOBILE_APP_MQTT_RULES.md`** — the contract a *real* phone client
  would need to follow to drop into this same pipeline in place of
  `phone.py`.

---

## 13. Known limitations

- `meters_per_cell` is calibrated from a single measured length (see §7a),
  not independently on both axes — floor 3's implied width comes out ~10%
  over the measured `15.765m`, floor 4's ~23% over, because the two grids'
  pixel aspect ratios don't quite match the real footprint's. Re-measuring
  and confirming which axis is more trustworthy for your specific site
  would resolve this; the current calibration is a documented, reasoned
  default, not a guess passed off as exact.
- Dwell-time analytics are a bucket-based approximation (5-minute
  `room_visits` windows), not per-visit session reconstruction — good
  enough for a demo, not a precise stopwatch.
- Single Mosquitto broker, single Postgres instance, in-memory-only
  WebSocket connection list — this is a demo/graduation-project topology,
  not a horizontally-scaled production one.
- `phone.py`'s stair columns (`STAIRS` dict) are configured per floor by
  hand; regenerating the floor grids at a very different scale would need
  those columns re-checked.