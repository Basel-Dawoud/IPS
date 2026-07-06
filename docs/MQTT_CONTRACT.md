# MQTT Contract v1.4
# IPS Project · Single Source of Truth

This document defines the core MQTT contract for the IPS system.

If another document conflicts with this one, this file wins.

**v1.4 change:** documents the topic/QoS/retain table and the alert payload
schema that `server/main.py` and `docs/MOBILE_APP_MQTT_RULES.md` already
relied on but this file hadn't formally specified yet. No topic changed
shape — this closes a gap in the "single source of truth" doc, it doesn't
introduce a new one.

---

## Broker

| Property | Value |
|---|---|
| Host (Docker internal) | `mosquitto` |
| Host (host machine) | `localhost` |
| Port | `1883` |
| Protocol | MQTT 3.1.1 |
| Auth | Anonymous (development only) |

---

## Identity Rule

Every device gets one stable `device_id` on first launch, stored locally and reused forever on that installation.

**Format:** `user-<8 hex chars>`  
Example: `user-a3f9b2c1`

The same value is used as:
- MQTT `ClientID` on CONNECT
- `device_id` field in every payload
- `<device_id>` segment in every topic

---

## Topic Design

Floor is in the payload only.  
Topics are stable even when the user moves between floors.

```text
Topic   = where the message goes   (routing)
Payload = what the message means   (data)
```

| Topic | Direction | QoS | Retain | Notes |
|---|---|---|---|---|
| `ips/<building_id>/device/<device_id>/position` | device → server | 0 | false | Live state belongs in Redis, not the broker — see `docs/DASHBOARD_MQTT_RULES.md` |
| `ips/<building_id>/device/<device_id>/status`   | device → server | 1 | true  | Last heartbeat visible immediately to a fresh subscriber |
| `ips/<building_id>/device/<device_id>/command`  | server → device | 1 | false | ACKs — must arrive, never replayed to a late subscriber |
| `ips/<building_id>/device/<device_id>/alert`    | server → device | 1 | false | Crowd/emergency pushes — see schema below; must arrive, never replayed |

---

## Alert Payload

Published by the server (`server/main.py`'s crowd-alert check) when a
device's current room crosses the configured crowding threshold. A real
mobile client should show this as a full-screen notification regardless of
app state.

```json
{
  "type":      "emergency",
  "message":   "Crowding detected in Health & Personal Care — 8 people currently present.",
  "room_id":   "358",
  "floor":     3,
  "count":     8,
  "threshold": 8,
  "ts":        1710000000
}
```

- `type` and `message` are the two fields a minimal client must read;
  `room_id`/`floor`/`count`/`threshold` are additive context a richer
  client can use, safe to ignore otherwise.
- Only published on the *onset* of crowding for a given room (not
  repeated every check interval while still crowded, and not published
  again when the room clears) — see `CROWD_ALERT_HYSTERESIS` in
  `server/main.py` for the anti-flapping rule.
- The dashboard's own "back to normal" notification is carried over
  `/ws/live` instead of this topic (see `docs/DASHBOARD_MQTT_RULES.md`) —
  a monitoring screen benefits from knowing when a room clears; a phone
  doing a full-screen emergency takeover doesn't need a second push just
  to dismiss the first one.