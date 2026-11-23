#!/bin/bash
# Local stand-in for a shared host. The host itself has no entrypoint:
# Apache there just executes public_html/api/index.php.
set -euo pipefail

APP=/srv/site/foundu
WEB=/srv/site/public_html
export COMPOSER_ALLOW_SUPERUSER=1

mkdir -p "$APP/storage/cache" "$APP/config"

host_uid="$(stat -c '%u' "$APP")"
host_gid="$(stat -c '%g' "$APP")"
if [[ "$host_uid" != "0" ]]; then
    usermod -o -u "$host_uid" www-data
    groupmod -o -g "$host_gid" www-data
fi

if [[ ! -f "$APP/vendor/autoload.php" ]]; then
    composer install --no-dev --optimize-autoloader --no-interaction --working-dir="$APP"
    chown -R "$host_uid:$host_gid" "$APP/vendor" || true
fi

if [[ ! -f "$APP/config/.env.php" ]]; then
    php "$APP/bin/write-env.php"
fi
chown "$host_uid:$host_gid" "$APP/config/.env.php"
chmod 600 "$APP/config/.env.php"

chown "$host_uid:$host_gid" "$APP/storage/cache"
chmod 775 "$APP/storage/cache"

# Default is allowlist ON. Compose sets FOUNDU_CF_ALLOWLIST=off for local use.
if [[ "${FOUNDU_CF_ALLOWLIST:-on}" == "off" ]]; then
    touch "$WEB/.cf-allowlist-off"
else
    rm -f "$WEB/.cf-allowlist-off"
fi

if [[ "${FOUNDU_MOCK_CF:-0}" == "1" ]]; then
    touch "$APP/config/mock-cf.on"
else
    rm -f "$APP/config/mock-cf.on"
fi

exec "$@"
