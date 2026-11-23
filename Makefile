COMPOSE ?= docker compose

.PHONY: up down logs composer test audit migrate seed

up:
	$(COMPOSE) up -d --build

down:
	$(COMPOSE) down

logs:
	$(COMPOSE) logs -f --tail=200

composer:
	$(COMPOSE) run --rm --no-deps --user "$(shell id -u):$(shell id -g)" --entrypoint composer -w /srv/site/foundu web $(if $(ARGS),$(ARGS),install --no-dev --optimize-autoloader --no-interaction)

test:
	./foundu/bin/migrate-test.sh
	./foundu/bin/smoke-test.sh

migrate:
	$(COMPOSE) exec -T web php /srv/site/foundu/bin/migrate.php

seed:
	$(COMPOSE) exec -T mariadb mariadb --default-character-set=utf8mb4 -ufoundu -pfoundu_dev foundu < foundu/seed/dev.sql

audit:
	$(COMPOSE) run --rm --no-deps --entrypoint composer -w /srv/site/foundu web audit --no-interaction
	npm audit
