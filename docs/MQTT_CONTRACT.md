# MQTT Contract v1.3
# IPS Project · Single Source of Truth

This document defines the core MQTT contract for the IPS system.

If another document conflicts with this one, this file wins.

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