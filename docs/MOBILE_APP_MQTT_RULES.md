# Mobile App MQTT Rules v1.0

This file is for the mobile teammate only.

## Responsibilities

The mobile app must:
- run the local fingerprinting / ML positioning model
- visualize the predicted position locally in the app UI
- publish the same predicted position to MQTT
- subscribe to its own command topic
- reconnect with the same device identity every time

## Identity

The app must create or receive one stable `device_id` and persist it locally.
Use the same value as:
- MQTT `ClientID`
- payload field `device_id`
- command topic segment

Example:
- `user123`

Do not rely on a broker-generated ID for normal app use.

## Connection flow

1. Create or load `device_id`.
2. Connect to Mosquitto with MQTT `CONNECT` using that same `ClientID`.
3. Subscribe to:
   - `ips/<building_id>/device/<device_id>/command`
   - `ips/<building_id>/device/<device_id>/alert`
4. Publish predicted positions to:
   - `ips/<building_id>/device/<device_id>/position`

## Position update flow

When the on-device ML model predicts a position:

1. Update the local map/UI immediately.
2. Publish the same value to MQTT.
3. Include a timestamp.
4. Keep publishing at the agreed rate.

## Position payload

```json
{
  "device_id": "user123",
  "building_id": "b1",
  "floor": 2,
  "zone_id": "north_corridor",
  "x": 10.5,
  "y": 7.2,
  "accuracy": 1.8,
  "ts": 1710000000,
  "motion": "walking"
}
Command payloads to support
{
  "type": "navigate",
  "destination": "lab_204",
  "route_id": "r1",
  "ts": 1710000000
}
{
  "type": "reroute",
  "reason": "crowded_area",
  "avoid_zones": ["north_corridor"],
  "destination": "cafeteria",
  "ts": 1710000000
}
{
  "type": "ack",
  "status": "stored",
  "ts": 1710000000
}
