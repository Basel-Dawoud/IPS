# MQTT Contract v1.2

This document is the single source of truth for all MQTT topics, payloads, and
QoS settings used in the IPS project. Every team member and every service must
follow it exactly.

---

## Identity rule

The mobile app must generate one stable `device_id` on first launch and reuse it
forever on that installation.

The same value is used as:
- MQTT CONNECT `ClientID`
- payload field `device_id`
- topic path segment `.../device/<device_id>/...`

**Format:** `user-<8 hex chars>`  →  example: `user-a3f9b2c1`

Do not depend on broker-assigned IDs for normal app operation.

---

## Topic design

Floor is kept **in the payload only**. Topics are stable for the lifetime of a
device installation, even when the user moves between floors.

```
Topic  = where the message goes   (routing)
Payload = what the message means  (data)
```

### Mobile app → broker → backend

| Topic | Purpose |
|---|---|
| `ips/<building_id>/device/<device_id>/position` | Predicted position from on-device ML model |
| `ips/<building_id>/device/<device_id>/status`   | Device heartbeat (battery, connectivity)   |

### Backend → broker → mobile app

| Topic | Purpose |
|---|---|
| `ips/<building_id>/device/<device_id>/command` | ACK or navigation instruction |
| `ips/<building_id>/device/<device_id>/alert`   | Emergency or evacuation alert  |

### Backend → dashboard / other services

| Topic | Purpose |
|---|---|
| `ips/<building_id>/zone/<zone_id>/crowd`  | Live crowd density per zone   |
| `ips/<building_id>/live/snapshot`         | Full floor state for dashboard |
| `ips/<building_id>/system/health`         | Backend service health status  |

### Useful wildcard subscriptions

```
ips/<building_id>/device/+/position   # all devices in one building
ips/<building_id>/#                   # everything in one building (admin/dashboard)
ips/+/device/+/position               # all devices across all buildings
```

---

## QoS levels

| Topic | QoS | Retain | Reason |
|---|:---:|:---:|---|
| `.../position`     | 0 | true  | High frequency; last known state is what matters |
| `.../status`       | 1 | true  | Must arrive; monitoring always needs latest state |
| `.../command`      | 1 | false | Must arrive; do not replay stale commands |
| `.../alert`        | 1 | false | Must arrive; do not replay stale alerts |
| `.../zone/crowd`   | 0 | true  | Live snapshot; last value is sufficient |
| `.../live/snapshot`| 0 | true  | Dashboard gets latest state on connect |
| `.../system/health`| 1 | true  | Monitoring must always see the latest health |

---

## Payloads

### Position payload
Published by the mobile app after the on-device ML model predicts a position.

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

| Field | Type | Notes |
|---|---|---|
| `device_id` | string | Stable device identity |
| `building_id` | string | Matches topic segment |
| `floor` | int | Floor number; payload-only (not in topic) |
| `zone_id` | string | Named zone from ML model output |
| `x` | float | Metres from building origin |
| `y` | float | Metres from building origin |
| `accuracy` | float | Estimated error radius in metres |
| `motion` | string | `"walking"` \| `"stationary"` \| `"unknown"` |
| `ts` | int | Unix timestamp (seconds) |

---

### Status payload
Published by the mobile app every 30 seconds as a heartbeat.

```json
{
  "device_id":   "user-a3f9b2c1",
  "building_id": "building1",
  "floor":       2,
  "ts":          1710000000,
  "state":       "online",
  "battery":     84,
  "connected":   true
}
```

| Field | Type | Notes |
|---|---|---|
| `state` | string | `"online"` \| `"background"` \| `"offline"` |
| `battery` | int | Percentage 0–100 |
| `connected` | bool | True if MQTT connection is active |

---

### Command payload (backend → mobile app)
Sent by the backend as an ACK or navigation instruction.

```json
{
  "type":      "ack",
  "status":    "stored",
  "device_id": "user-a3f9b2c1",
  "ts":        1710000000
}
```

| `type` value | Meaning |
|---|---|
| `"ack"` | Position was received and stored |
| `"navigate"` | Navigation instruction (future) |
| `"config"` | Remote config update (future) |

---

### Alert payload (backend → mobile app)
Sent by the backend for emergencies or system-level events.

```json
{
  "type":    "emergency",
  "message": "Please evacuate via Exit B",
  "ts":      1710000000
}
```

| `type` value | Meaning |
|---|---|
| `"emergency"` | Evacuation or safety alert |
| `"info"` | General announcement |
| `"congestion"` | Route congestion warning |

---

## Rules for all publishers

1. Never publish to a topic that starts with `$` — those are reserved for broker internals.
2. Never use `+` or `#` in a publish topic — wildcards are for subscriptions only.
3. Always set `retain` and `qos` explicitly — do not rely on library defaults.
4. `device_id` in the payload must always match the `device_id` in the topic.
5. `ts` must always be a Unix timestamp in **seconds** (not milliseconds).
