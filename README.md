# IPS

## Communication
Mobile App
    ↓ MQTT
Mosquitto Broker
    ↓
FastAPI Backend
    ├─ Redis      (latest live state)
    ├─ PostgreSQL (full historical data)
    └─ AI Models  (analytics and recommendations)

mall/floor3/device/phone_001/position
 │      │      │       │        └── what type of data
 │      │      │       └── which device
 │      │      └── entity type
 │      └── subdivision
 └── root namespace
