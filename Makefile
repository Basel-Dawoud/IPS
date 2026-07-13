# Makefile — IPS Project
# Usage: make <target>

PYTHON ?= ./venv/bin/python

# phone.py run knobs (override on the command line, e.g. `make simulate-fleet N=100`)
FLOORS   ?= 3,4
N        ?= 50
SCENARIO ?= corridor458

.PHONY: up down reset simulate simulate-fleet simulate-scenario render-maps logs db redis-cli ps test test-unit

up:
	docker compose up --build

down:
	docker compose down --remove-orphans

reset:
	docker compose down --remove-orphans --volumes
	docker compose up --build -d

render-maps:
	$(PYTHON) tools/render_floor_maps.py

# Mode 1 — one persistent simulated user on the default looping route
# (floor 3 <-> floor 4 via the stairs). Stable device id (device_id.txt).
simulate:
	FLOORS=$(FLOORS) $(PYTHON) phone.py

# Mode 2 — fleet of N ephemeral users for load / concurrency testing.
# Override the count with `make simulate-fleet N=100`.
simulate-fleet:
	NUM_DEVICES=$(N) FLOORS=$(FLOORS) $(PYTHON) phone.py

# Mode 3 — scripted 3-user demo (SCENARIO=corridor458): three users spawn in
# front of floor-4 room 458; user 1 -> floor-4 right stairs (stops), users 2 & 3
# -> floor-4 left stairs -> down to floor 3 -> floor-3 right stairs (stop).
simulate-scenario:
	SCENARIO=$(SCENARIO) FLOORS=$(FLOORS) $(PYTHON) phone.py

logs:
	docker compose logs -f server

db:
	docker compose exec postgres psql -U ipsuser -d ipsdb

redis-cli:
	docker compose exec redis redis-cli

ps:
	docker compose ps

test:
	curl -s http://localhost:8000/health | $(PYTHON) -m json.tool
	curl -s http://localhost:8000/live/positions | $(PYTHON) -m json.tool

test-unit:
	$(PYTHON) -m pytest tests/ -v