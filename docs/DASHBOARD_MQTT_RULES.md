# Dashboard — MQTT Rules v1.2
# IPS Project · Web Dashboard Developer Guide

This document tells you everything you need to connect the web dashboard to
the IPS system. For the full engineering spec, see `MQTT_CONTRACT.md`.

**v1.2 change:** this doc previously described connecting the dashboard
directly to the MQTT broker over WebSocket (port `9001`). That approach was
tried and deliberately abandoned — see the comment on the `mosquitto`
service in `docker-compose.yml`. The dashboard has never actually done this;
it reads everything through FastAPI. This revision replaces that guidance
with what's really there, instead of leaving a developer to implement
against a plan the project moved away from.

---

## Two Data Sources — Use the Right One

| Query | Source | Why |
|---|---|---|
| Where is everyone right now? | **`WS /ws/live`** (FastAPI, Redis-backed) | Sub-second, event-driven pushes, always current |
| Is a room currently crowded? | **`WS /ws/live`** (`"alert"` messages) + **`GET /alerts/active`** | Same live pipeline; REST version for a point-in-time read |
| Show me the heatmap for today | **`GET /analytics/heatmap`** | Historical range query — latency is acceptable |
| Device last seen / battery | **`GET /live/status/{device_id}`** or `/ws/live` | Redis, TTL-expired automatically if the device goes stale |
| Navigation history for a device | **`GET /history/device/{device_id}`** | Persistent record, TimescaleDB |
| Floor occupancy over time | **`GET /analytics/floor/{floor}`** | `crowd_analytics` continuous aggregate |
| Most-visited rooms | **`GET /analytics/rooms`** | `room_visits` continuous aggregate |

There is no direct broker connection anywhere in this list, and there
shouldn't be — the reasons are below.

---

## Why FastAPI, Not the Broker Directly

The dashboard is a browser tab, not an MQTT device — it doesn't have a
`device_id`, and it needs three things MQTT alone doesn't give it:

1. **A snapshot on connect.** A newly-opened dashboard needs "who's here
   right now," not just messages published after it happened to subscribe.
   `/ws/live` gets this from Redis (a real point-in-time query) the instant
   it connects. MQTT retained messages can approximate this, but only if
   every device reliably clears its retained message on disconnect — real
   phones don't disconnect cleanly, so this becomes a "ghost device" trap
   without a lot of extra Last-Will-and-Testament plumbing.
2. **One validated gatekeeper.** FastAPI drops malformed payloads before
   they reach a browser. A direct broker connection means every dashboard
   tab gets raw, unvalidated firehose access.
3. **A single point to measure from.** Every "msgs/sec" or "devices online"
   number the dashboard shows exists because exactly one process is
   counting. Multiple independent broker subscribers would each need their
   own counting logic.

---

## `WS /ws/live` — the live channel

Connect once per dashboard session:

```javascript
const ws = new WebSocket(`ws://${location.hostname}:8000/ws/live`);

ws.onmessage = (event) => {
  const msg = JSON.parse(event.data);

  switch (msg.type) {
    case 'snapshot':
      // Sent once, immediately on connect.
      msg.items.forEach(item => upsertDeviceMarker(item));
      msg.active_alerts.forEach(alert => showAlert(alert)); // already-active alerts, not just new ones
      break;

    case 'position':
      upsertDeviceMarker(msg); // msg itself is the position payload, plus "type"
      break;

    case 'status':
      updateDeviceStatus(msg.device_id, msg.battery, msg.state);
      break;

    case 'alert':
      if (msg.level === 'warning') showAlert(msg);
      else clearAlert(msg.room_id); // msg.level === 'clear'
      break;
  }
};
```

No polling, no reconnect-and-miss-messages window for position/status —
each arrives the instant `server/main.py` receives it from MQTT. Alerts are
the one thing computed on a short interval (`CROWD_ALERT_CHECK_INTERVAL_SECONDS`,
default 3s) rather than per-message, since checking room occupancy on every
single position update would scale with MQTT message rate for no benefit —
see the comment above `crowd_alert_loop()` in `server/main.py`.

### `alert` message shape

```json
{
  "type":        "alert",
  "level":       "warning",
  "room_id":     "358",
  "room_name":   "Health & Personal Care",
  "floor":       3,
  "building_id": "building1",
  "count":       8,
  "threshold":   8,
  "ts":          1710000000
}
```

`level` is `"warning"` on the moment a room crosses the threshold, or
`"clear"` on the moment it recovers — each fires exactly once per episode,
not on every check while still over/under threshold. This is a dashboard-only
message shape; it isn't published to MQTT. The MQTT-facing alert (which goes
to the affected phones, not the dashboard) has a different, simpler shape —
see `MQTT_CONTRACT.md`.

---

## REST Endpoints

| Endpoint | Returns | Source |
|---|---|---|
| `GET /health` | MQTT/Redis/Postgres connectivity | Live |
| `GET /floors` | Floor dimensions, image path, room directory, `meters_per_cell` | `server/floors.json` |
| `GET /rooms?floor=` | Room id/name/bounding box | `server/floors.json` |
| `GET /live/positions` | Every active device's current position | Redis (same data as the WS snapshot) |
| `GET /live/status/{device_id}` | Latest heartbeat for one device | Redis |
| `GET /alerts/active` | Currently-crowded rooms | In-memory (same data as WS `"alert"` state) |
| `GET /history/device/{device_id}?limit=` | Raw position history, most recent first | TimescaleDB |
| `GET /analytics/floor/{floor}?minutes=` | 5-min-bucketed occupancy time series | `crowd_analytics` |
| `GET /analytics/rooms?floor=&minutes=&limit=` | Per-room visit counts, ranked | `room_visits` |
| `GET /analytics/heatmap?floor=&minutes=` | Per-room intensity, normalized 0–1 | `room_visits` |

Poll the `/analytics/*` endpoints for historical views. Never poll
`/live/positions` on a timer for the live map — that's what `/ws/live` is
for; polling it would just be a slower, less efficient version of a
connection you should already have open.

---

## Topics You Never Publish To

The dashboard talks to FastAPI, never to the broker, so this is more of a
"why would you" than a rule — but for clarity, these topics exist and none
of them are the dashboard's to touch:

```
ips/+/device/+/position   ← mobile app / simulator only
ips/+/device/+/status     ← mobile app / simulator only
ips/+/device/+/command    ← backend only
ips/+/device/+/alert      ← backend only
```

---

## Position Item Shape (inside `snapshot.items[]` and standalone `"position"` messages)

```json
{
  "type":        "position",
  "device_id":   "user-a3f9b2c1",
  "building_id": "building1",
  "floor":       3,
  "zone_id":     "floor-3-open",
  "room_id":     "358",
  "x":           10.5,
  "y":           7.2,
  "accuracy":    1.8,
  "motion":      "walking",
  "ts":          1710000000
}
```

`room_id` is nullable — a device in the corridor between rooms won't have
one. `ts` is seconds; multiply by 1000 for a JavaScript `Date`.

---

## Recommended Dashboard Architecture

```
WS /ws/live (FastAPI)          REST (FastAPI)
      │                              │
      ├─ live device dots           ├─ heatmap overlay
      ├─ device status badges       ├─ history timeline
      ├─ active alert banner/pulse  ├─ analytics charts
      └─ system health bar          └─ device detail panel
```

Both columns go through FastAPI. There is no MQTT-direct column — that's
the whole point of this revision.