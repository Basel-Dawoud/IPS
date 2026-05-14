# Mobile App — MQTT Rules v1.1
# IPS Project · Flutter / Kotlin Developer Guide

This document tells you everything you need to implement MQTT in the mobile app.
For the full engineering spec, see `MQTT_CONTRACT.md`.

---

## Quick-Start Checklist

```
☐ Generate a stable device_id on first launch (format: user-<8 hex chars>)
☐ Store it in shared preferences / secure storage — never regenerate it
☐ Connect to broker with that device_id as the MQTT ClientID
☐ Publish position every 2 seconds after the ML model predicts a location
☐ Publish status every 30 seconds as a heartbeat
☐ Subscribe to command and alert topics immediately after connecting
☐ Handle reconnects automatically — broker may restart
```

---

## Broker Connection

| Property | Development | Production |
|---|---|---|
| Host | IP of the machine running Docker | TBD |
| Port | `1883` | `1883` |
| ClientID | your stable `device_id` | same |
| Auth | none | TBD |

---

## Your Topics

Replace `<building_id>` with `building1` and `<device_id>` with your stable ID.

| Direction | Topic | Action |
|---|---|---|
| You publish | `ips/<building_id>/device/<device_id>/position` | After every ML prediction |
| You publish | `ips/<building_id>/device/<device_id>/status`   | Every 30 seconds |
| You subscribe | `ips/<building_id>/device/<device_id>/command` | On connect |
| You subscribe | `ips/<building_id>/device/<device_id>/alert`   | On connect |

---

## What to Publish

### Position — every 2 seconds

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

- `ts` = `System.currentTimeMillis() / 1000` (Kotlin) or `DateTime.now().millisecondsSinceEpoch ~/ 1000` (Flutter)
- `zone_id` = from ML model output; omit if unknown
- `floor`, `x`, `y`, `accuracy` = from ML model output
- QoS: **0**, retain: **true**

### Status — every 30 seconds

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

- `state`: `"online"` when app is active, `"background"` when backgrounded
- QoS: **1**, retain: **true**

---

## What to Receive

### Command — `qos=1`
```json
{ "type": "ack", "status": "stored", "device_id": "user-a3f9b2c1" }
```
For now, `"ack"` just confirms your position was saved. Future types: `"navigate"`, `"config"`.

### Alert — `qos=1`
```json
{ "type": "emergency", "message": "Please evacuate via Exit B", "ts": 1710000000 }
```
Show this immediately as a full-screen notification regardless of app state.

---

## Flutter Implementation Reference

```dart
// pubspec.yaml
dependencies:
  mqtt_client: ^10.0.0

// Generate device_id once
import 'package:shared_preferences/shared_preferences.dart';
import 'package:uuid/uuid.dart';

Future<String> getOrCreateDeviceId() async {
  final prefs = await SharedPreferences.getInstance();
  String? id = prefs.getString('device_id');
  if (id == null) {
    id = 'user-${const Uuid().v4().replaceAll('-', '').substring(0, 8)}';
    await prefs.setString('device_id', id);
  }
  return id;
}

// Connect
final client = MqttServerClient('<broker_ip>', deviceId);
client.port = 1883;
await client.connect();

// Subscribe on connect
client.subscribe('ips/building1/device/$deviceId/command', MqttQos.atLeastOnce);
client.subscribe('ips/building1/device/$deviceId/alert',   MqttQos.atLeastOnce);

// Publish position
final payload = jsonEncode({
  'device_id':   deviceId,
  'building_id': 'building1',
  'floor':       2,
  'x':           10.5,
  'y':           7.2,
  'ts':          DateTime.now().millisecondsSinceEpoch ~/ 1000,
});

final builder = MqttClientPayloadBuilder()..addString(payload);
client.publishMessage(
  'ips/building1/device/$deviceId/position',
  MqttQos.atMostOnce,   // QoS 0
  builder.payload!,
  retain: true,
);
```

---

## Common Mistakes to Avoid

| Mistake | Correct approach |
|---|---|
| Using `DateTime.now().millisecondsSinceEpoch` as `ts` | Divide by 1000 — server expects seconds |
| Generating a new `device_id` on every launch | Load from storage; create only once |
| Publishing to `ips/building1/device/+/position` | Never use wildcards in publish topics |
| Not subscribing to command/alert on reconnect | Re-subscribe in the `onConnected` callback |
| Sending `"floor": null` when floor is unknown | Omit the field entirely |