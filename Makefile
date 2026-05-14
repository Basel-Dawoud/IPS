.PHONY: help up down reset simulate logs db ps

PYTHON ?= ./venv/bin/python
COMPOSE ?= docker compose

help:
	@echo "make up        - build and start the stack"
	@echo "make down      - stop the stack"
	@echo "make reset     - stop, remove volumes, and rebuild"
	@echo "make simulate  - run phone.py"
	@echo "make logs      - follow server logs"
	@echo "make db        - open psql inside the postgres container"
	@echo "make ps        - show container status"

up:
	$(COMPOSE) up --build

down:
	$(COMPOSE) down --remove-orphans

reset:
	$(COMPOSE) down --remove-orphans --volumes
	$(COMPOSE) up --build

simulate:
	$(PYTHON) phone.py

logs:
	$(COMPOSE) logs -f server

db:
	$(COMPOSE) exec postgres psql -U ipsuser -d ipsdb

ps:
	$(COMPOSE) ps