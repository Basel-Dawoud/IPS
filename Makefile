# Makefile — IPS Project
# Usage: make <target>

PYTHON ?= ./venv/bin/python

.PHONY: up down reset simulate render-maps logs db redis-cli ps test test-unit

up:
	docker compose up --build

down:
	docker compose down --remove-orphans

reset:
	docker compose down --remove-orphans --volumes
	docker compose up --build -d

render-maps:
	$(PYTHON) tools/render_floor_maps.py

simulate:
	$(PYTHON) phone.py

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