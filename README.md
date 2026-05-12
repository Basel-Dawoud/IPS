# IPS

# Communication
Mobile App
    │
    │  MQTT (position payload)
    ▼
Mosquitto Broker          ← routes messages only, zero logic
    │
    │  MQTT subscription
    ▼
FastAPI Backend           ← the ONLY service that touches storage
    │
    ├──▶ Redis            ← write latest position per device
    │       │
    │       └──▶ Web Dashboard (reads live state via WebSocket/HTTP)
    │
    └──▶ PostgreSQL + TimescaleDB extension
                │
                └──▶ Analytics queries (heatmaps, history, reports)

## Under Testing ..
Mobile → MQTT → Broker → FastAPI
                           │
           ┌───────────────┴───────────────┐
           ▼                               ▼
        Redis                        PostgreSQL
     (real-time)                  (history/logs)
           │                               │
           └────────── Dashboard ──────────┘
                 (FastAPI API layer)

# Topics

## position_topic
ips/floor3/device/phone_001/position
 │      │      │       │        └── what type of data
 │      │      │       └── which device
 │      │      └── entity type
 │      └── subdivision
 └── root namespace
