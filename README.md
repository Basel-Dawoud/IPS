# IPS

## Communication

```
Mobile App
    │
    │  MQTT (position payload)
    ▼
Mosquitto Broker          ← routes messages only, zero logic
    │
    │  MQTT subscription
    ▼
FastAPI Backend           ← the ONLY service that writes to storage
    │
    ├──▶ Redis                    ← latest position per device (real-time)
    │
    └──▶ PostgreSQL + TimescaleDB ← full history, logs, analytics
              │
              └──▶ TimescaleDB extension → heatmaps, history, reports
```

The dashboard reads from **both** storages through the FastAPI API layer:

```
Mobile → MQTT → Broker → FastAPI
                              │
              ┌───────────────┴───────────────┐
              ▼                               ▼
           Redis                        PostgreSQL
        (real-time)                   (history/logs)
              │                               │
              └──────────── Dashboard ────────┘
                       (FastAPI API layer)
```

| Dashboard query | Source | Why |
|---|---|---|
| Where is everyone right now? | Redis | Sub-millisecond reads, updated on every position message |
| Show heatmap for today | PostgreSQL | Historical range query, latency of seconds is acceptable |
| Device last seen | Redis | Retained last-known state per device |
| Navigation history for user | PostgreSQL | Persistent record, never expires |

---

## Topics

### `position_topic`

```
ips/<building_id>/device/<device_id>/position
 │        │             │                └── what type of data
 │        │             └── which device
 │        └── subdivision (building)
 └── root namespace
```

Floor is kept in the **payload only** — topics are stable even when the user
moves between floors.

Full topic table and payload schemas: `docs/MQTT_CONTRACT.md`