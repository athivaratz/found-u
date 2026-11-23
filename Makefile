COMPOSE ?= docker compose

.PHONY: up down logs composer test audit

up:
	$(COMPOSE) up -d --build

down:
	$(COMPOSE) down

logs:
	$(COMPOSE) logs -f --tail=200

composer:
	$(COMPOSE) run --rm --no-deps --user "$(shell id -u):$(shell id -g)" --entrypoint composer -w /srv/site/foundu web $(if $(ARGS),$(ARGS),install --no-dev --optimize-autoloader --no-interaction)

test:
	./foundu/bin/smoke-test.sh

audit:
	$(COMPOSE) run --rm --no-deps --entrypoint composer -w /srv/site/foundu web audit --no-interaction
	npm audit
