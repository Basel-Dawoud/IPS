# MQTT Contract v1.0

This repository uses one shared MQTT identity for each phone/device.

## Identity rule

The mobile app must generate or receive one stable `device_id` and reuse it forever on that installation.
The same value is used as:
- MQTT CONNECT `ClientID`
- payload field `device_id`
- command topic path segment

Do not depend on broker-assigned IDs for normal app operation.

## Topics

### Mobile app → broker → backend
- `ips/<building_id>/device/<device_id>/position`
- `ips/<building_id>/device/<device_id>/status`

### Backend → broker → mobile app
- `ips/<building_id>/device/<device_id>/command`
- `ips/<building_id>/device/<device_id>/alert`

### Backend → dashboard / other services
- `ips/<building_id>/zone/<zone_id>/crowd`
- `ips/<building_id>/live/snapshot`
- `ips/<building_id>/system/health`

## Position payload

Published by the mobile app after the local ML positioning function predicts a position.

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