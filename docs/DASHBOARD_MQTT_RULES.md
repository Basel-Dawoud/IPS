# Dashboard — MQTT Rules v1.1
# IPS Project · Web Dashboard Developer Guide

This document tells you everything you need to connect the web dashboard to the
IPS system via MQTT and the FastAPI REST layer.
For the full engineering spec, see `MQTT_CONTRACT.md`.

---

## Two Data Sources — Use the Right One

The dashboard reads from two sources depending on what it needs:

| Query | Source | Why |
|---|---|---|
| Where is everyone right now? | **MQTT / Redis** (via FastAPI) | Sub-second updates, always current |
| Show me the heatmap for today | **PostgreSQL REST API** | Historical range query — latency is acceptable |
| Device last seen / battery | **MQTT / Redis** (via FastAPI) | Retained last-known state |
| Navigation history for a device | **PostgreSQL REST API** | Persistent record |
| Floor occupancy count | **PostgreSQL REST API** | `crowd_analytics` continuous aggregate |

---

## Option A — Subscribe to MQTT Directly (WebSocket)

The dashboard can subscribe to the broker directly over WebSocket.
Mosquitto supports WebSocket on port `9001` (requires config update).

```javascript
// JavaScript / MQTT.js
import mqtt from 'mqtt';

const client = mqtt.connect('ws://localhost:9001');

client.on('connect', () => {
  // All devices in building1
  client.subscribe('ips/building1/device/+/position');
  client.subscribe('ips/building1/device/+/status');

  // Zone crowd density
  client.subscribe('ips/building1/zone/+/crowd');

  // Full floor snapshot
  client.subscribe('ips/building1/live/snapshot');
});

client.on('message', (topic, message) => {
  const data = JSON.parse(message.toString());

  if (topic.endsWith('/position')) {
    updateDeviceMarker(data.device_id, data.x, data.y, data.floor);
  }
  if (topic.endsWith('/status')) {
    updateDeviceStatus(data.device_id, data.state, data.battery);
  }
  if (topic.includes('/zone/') && topic.endsWith('/crowd')) {
    updateCrowdIndicator(data);
  }
});
```

To enable WebSocket on Mosquitto, add to `mosquitto.conf`:
```
listener 9001
protocol websockets
```

And expose port `9001` in `docker-compose.yml`:
```yaml
mosquitto:
  ports:
    - "1883:1883"
    - "9001:9001"
```

---

## Option B — Poll FastAPI REST Endpoints (HTTP)

Use this when you want historical data, aggregations, or server-filtered results.
These endpoints are planned for the next phase — not yet implemented.

| Endpoint | Returns | Source |
|---|---|---|
| `GET /devices/live` | All devices, latest position | Redis |
| `GET /devices/{id}/history?from=&to=` | Position history for one device | TimescaleDB |
| `GET /analytics/heatmap?floor=&from=&to=` | Heatmap grid data | `crowd_analytics` |
| `GET /analytics/floor/{floor}` | Occupancy count per 5-min bucket | `crowd_analytics` |
| `GET /health` | Server status | FastAPI |

---

## Topics You Subscribe To

| Topic | QoS | What arrives | Update frequency |
|---|:---:|---|---|
| `ips/<building_id>/device/+/position` | 0 | x, y, floor, zone per device | Every 2 seconds per device |
| `ips/<building_id>/device/+/status`   | 1 | battery, state, last_seen | Every 30 seconds per device |
| `ips/<building_id>/zone/+/crowd`      | 0 | device_count per zone | On crowd change |
| `ips/<building_id>/live/snapshot`     | 0 | Full floor state JSON | On any position change |
| `ips/<building_id>/system/health`     | 1 | Backend health status | Every 60 seconds |

---

## Topics You Never Publish To

The dashboard is **read-only** on MQTT. Never publish to:
```
ips/+/device/+/position   ← mobile app only
ips/+/device/+/status     ← mobile app only
ips/+/device/+/command    ← backend only
ips/+/device/+/alert      ← backend only
```

---

## Position Payload Reference

```json
{
  "device_id":   "user-a3f9b2c1",
  "building_id": "building1",
  "floor":       2,
  "zone_id":     "north_corridor",
  "x":           10.5,
  "y":           7.2,
  "accuracy":    1.8,
  "motion":      "walking",
  "ts":          1710000000
}
```

Render `accuracy` as a circle radius around the dot on the map.
`ts` is seconds — multiply by 1000 for JavaScript `Date` objects.

---

## Recommended Dashboard Architecture

```
WebSocket (MQTT)          REST (FastAPI)
      │                        │
      ├─ live device dots       ├─ heatmap overlay
      ├─ device status badges   ├─ history timeline
      ├─ zone crowd colours     ├─ analytics charts
      └─ system health bar      └─ device detail panel
```

Keep live rendering (MQTT) and analytical views (REST) completely separate.
Do not poll REST for live data — use MQTT retain for that.