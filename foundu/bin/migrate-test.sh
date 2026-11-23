#!/bin/sh
# Applies the schema to an empty database, then applies it again.
# Uses the compose MariaDB. Does not touch the foundu database.
set -eu

ROOT=$(CDPATH= cd -- "$(dirname "$0")/../.." && pwd)
COMPOSE="docker compose -f $ROOT/docker-compose.yml"
DB=foundu_migtest
OUT=/tmp/foundu-migrate-out

fail() {
    echo "FAIL: $*" >&2
    exit 1
}

sql_root() {
    $COMPOSE exec -T mariadb mariadb -uroot -proot_dev -N -e "$1"
}

sql_app() {
    # -N -B so a count is just the digits. Password goes in the environment
    # so it is not another argument, and stderr stays attached for SQL errors.
    $COMPOSE exec -T -e MYSQL_PWD=foundu_dev mariadb \
        mariadb --default-character-set=utf8mb4 -N -B -ufoundu "$DB" -e "$1"
}

echo "starting mariadb"
$COMPOSE up -d mariadb web

i=0
until sql_root "SELECT 1" >/dev/null 2>&1; do
    i=$((i + 1))
    [ "$i" -lt 40 ] || fail "mariadb did not accept connections"
    sleep 2
done

sql_root "DROP DATABASE IF EXISTS ${DB}; CREATE DATABASE ${DB} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci; GRANT ALL PRIVILEGES ON ${DB}.* TO 'foundu'@'%'; FLUSH PRIVILEGES;"

echo "waiting for php in the web container"
i=0
until $COMPOSE exec -T web test -f /srv/site/foundu/vendor/autoload.php >/dev/null 2>&1; do
    i=$((i + 1))
    [ "$i" -lt 60 ] || fail "web container never had vendor/autoload.php"
    sleep 2
done

$COMPOSE exec -T web php /srv/site/foundu/bin/build-migrations-sql.php --check

echo "migrate, first time"
$COMPOSE exec -T -e DB_NAME="$DB" web php /srv/site/foundu/bin/migrate.php > "$OUT"
grep -q 'applied 001_schema_migrations.sql' "$OUT" || fail "first run did not apply 001"
grep -q 'applied 010_change_feed.sql' "$OUT" || fail "first run did not apply 010"
grep -q 'applied 011_cron_lock.sql' "$OUT" || fail "first run did not apply 011"
grep -q 'applied 012_list_indexes.sql' "$OUT" || fail "first run did not apply 012"
grep -q 'applied 040_storage_objects.sql' "$OUT" || fail "first run did not apply 040"
grep -q 'done applied=13 skipped=0' "$OUT" || fail "first run count: $(cat "$OUT")"

echo "migrate, second time"
$COMPOSE exec -T -e DB_NAME="$DB" web php /srv/site/foundu/bin/migrate.php > "$OUT"
grep -q 'done applied=0 skipped=13' "$OUT" || fail "second run count: $(cat "$OUT")"
grep -q '^applied ' "$OUT" && fail "second run applied a file"

echo "import all.sql twice"
$COMPOSE exec -T mariadb mariadb --default-character-set=utf8mb4 -ufoundu -pfoundu_dev "$DB" < "$ROOT/foundu/migrations/all.sql"
$COMPOSE exec -T mariadb mariadb --default-character-set=utf8mb4 -ufoundu -pfoundu_dev "$DB" < "$ROOT/foundu/migrations/all.sql"

echo "migrate still skips"
$COMPOSE exec -T -e DB_NAME="$DB" web php /srv/site/foundu/bin/migrate.php > "$OUT"
grep -q 'done applied=0 skipped=13' "$OUT" || fail "tracker changed after all.sql"

bad=$(sql_app "
SELECT TABLE_NAME FROM information_schema.TABLES
WHERE TABLE_SCHEMA = DATABASE() AND TABLE_TYPE = 'BASE TABLE'
  AND (ENGINE <> 'InnoDB' OR TABLE_COLLATION <> 'utf8mb4_unicode_ci');
")
[ -z "$bad" ] || fail "not InnoDB utf8mb4_unicode_ci: ${bad}"

for missing in discord_links discord_verification_sessions system_config profiles student_accounts; do
    hit=$(sql_app "SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = '${missing}';")
    [ "$hit" = "0" ] || fail "unexpected table ${missing}"
done

for need in accounts sessions rate_limits login_attempts ai_slots ai_credentials ai_usage change_feed schema_migrations passkey_lookup admin_whitelist lost_items found_items nfc_tags articles cron_lock storage_objects; do
    hit=$(sql_app "SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = '${need}';")
    [ "$hit" = "1" ] || fail "missing table ${need}"
done

feed=$(sql_app "SELECT COUNT(*) FROM change_feed;")
[ "$feed" = "19" ] || fail "change_feed rows ${feed}"

idx=$(sql_app "SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'lost_items' AND INDEX_NAME = 'idx_lost_items_tracking_code';")
[ "$idx" != "0" ] || fail "tracking index missing"

guard=$(sql_app "SELECT COUNT(*) FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA = DATABASE() AND TRIGGER_NAME = 'accounts_bu_guard';")
[ "$guard" = "1" ] || fail "account guard missing"

echo "account column guard"
$COMPOSE exec -T -e DB_NAME="$DB" -e FOUNDU_ADMIN_PASSWORD='migrate-test-pass1' web \
    php /srv/site/foundu/bin/create-admin.php --student-id=11111 --apply --database="$DB" \
    > "$OUT"
grep -q 'created admin 11111' "$OUT" || fail "create-admin: $(cat "$OUT")"

set +e
sql_app "UPDATE accounts SET role = 'user' WHERE student_id = '11111';" > "$OUT" 2>&1
code=$?
set -e
[ "$code" -ne 0 ] || fail "role update should have been rejected"
grep -q 'account change is not allowed' "$OUT" || fail "guard message: $(cat "$OUT")"

sql_app "UPDATE accounts SET shown_name = 'Desk' WHERE student_id = '11111';"
name=$(sql_app "SELECT shown_name FROM accounts WHERE student_id = '11111';")
[ "$name" = "Desk" ] || fail "shown_name not updated (${name})"

set +e
$COMPOSE exec -T -e DB_NAME="$DB" -e FOUNDU_ADMIN_PASSWORD='migrate-test-pass1' web \
    php /srv/site/foundu/bin/create-admin.php --student-id=11111 --apply --database="$DB" \
    > "$OUT" 2>&1
code=$?
set -e
[ "$code" -ne 0 ] || fail "second admin insert should fail"
grep -q 'already exists' "$OUT" || fail "duplicate message: $(cat "$OUT")"

$COMPOSE exec -T -e DB_NAME="$DB" web php -r '
require "/srv/site/foundu/vendor/autoload.php";
$h = Foundu\Auth\PasswordHash::hash("migrate-test-pass1");
if (!password_verify("migrate-test-pass1", $h)) { fwrite(STDERR, "verify failed\n"); exit(1); }
if (strncmp($h, "\$argon2id\$", 10) !== 0 && strncmp($h, "\$2", 2) !== 0) { fwrite(STDERR, "unexpected hash\n"); exit(1); }
echo "hash-ok\n";
' | grep -q 'hash-ok' || fail "password hash"

sql_root "DROP DATABASE IF EXISTS ${DB};"
echo OK
