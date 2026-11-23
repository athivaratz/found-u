#!/bin/sh
# PHPUnit for the shared core. Uses the compose MariaDB, not the dev database.
set -eu

ROOT=$(CDPATH= cd -- "$(dirname "$0")/../.." && pwd)
COMPOSE="docker compose -f $ROOT/docker-compose.yml"
DB=foundu_phpunit

fail() {
    echo "FAIL: $*" >&2
    exit 1
}

$COMPOSE up -d mariadb web

i=0
until $COMPOSE exec -T mariadb mariadb -uroot -proot_dev -N -e "SELECT 1" >/dev/null 2>&1; do
    i=$((i + 1))
    [ "$i" -lt 40 ] || fail "mariadb did not accept connections"
    sleep 2
done

$COMPOSE exec -T mariadb mariadb -uroot -proot_dev -e \
    "CREATE DATABASE IF NOT EXISTS ${DB} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci; GRANT ALL PRIVILEGES ON ${DB}.* TO 'foundu'@'%'; FLUSH PRIVILEGES;"

i=0
until $COMPOSE exec -T web test -f /srv/site/foundu/vendor/autoload.php >/dev/null 2>&1; do
    i=$((i + 1))
    [ "$i" -lt 60 ] || fail "web container never had vendor/autoload.php"
    sleep 2
done

$COMPOSE exec -T web composer install --no-interaction --working-dir=/srv/site/foundu
$COMPOSE exec -T -e DB_NAME="$DB" web php /srv/site/foundu/bin/migrate.php
$COMPOSE exec -T \
    -e DB_HOST=mariadb \
    -e DB_PORT=3306 \
    -e DB_NAME="$DB" \
    -e DB_USER=foundu \
    -e DB_PASS=foundu_dev \
    -e APP_ENV=local \
    -e APP_URL=http://localhost:8080 \
    -e FOUNDU_TEST_DB=1 \
    -e FOUNDU_DISABLE_APCU=1 \
    -w /srv/site/foundu \
    web php vendor/bin/phpunit -c phpunit.xml.dist
