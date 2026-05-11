# Dashboard Rules v1.0

This file is for the dashboard teammate only.

## Main rule

The dashboard should talk to `FastAPI`, not directly to Redis or PostgreSQL.

## Why

- FastAPI can serve HTTP endpoints for one-time queries.
- FastAPI can serve WebSocket endpoints for live updates.
- Redis is for live state.
- PostgreSQL is for history.

## Dashboard → FastAPI

Use HTTP for:
- crowd list
- user history
- filters
- exports
- reports

Use WebSocket for:
- live map
- real-time crowd updates
- live user movement

## Typical endpoints

- `GET /api/crowd?building=b1`
- `GET /api/users/{device_id}/history`
- `GET /api/live/snapshot`
- `WS /ws/live-map`
- `WS /ws/crowd`

## Data source rules

- Redis: latest/current state only
- PostgreSQL: historical queries only

Examples:
- latest position of a device → Redis
- current crowd count per zone → Redis
- most visited places → PostgreSQL
- per-user movement history → PostgreSQL

## What the dashboard must not do

- It must not publish raw position updates to MQTT.
- It must not depend on `phone.py`.
- It must not query the broker as its main data source.

## Optional future option

If the browser ever needs direct MQTT access, Mosquitto can expose MQTT over WebSockets.
That is optional and not the default architecture for this project.

FastAPI supports WebSocket endpoints directly, Redis is the live in-memory state layer, and PostgreSQL is the historical store used for INSERT and SELECT-style queries.
