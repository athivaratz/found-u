#!/bin/sh
# Hits the local stack the way a browser would. Stack must already be up.
set -eu

ROOT=$(CDPATH= cd -- "$(dirname "$0")/../.." && pwd)
BASE="${BASE_URL:-http://127.0.0.1:8080}"
FLAG="$ROOT/public_html/.cf-allowlist-off"
MOCK="$ROOT/foundu/config/mock-cf.on"
BODY=/tmp/foundu-smoke-body
COMPOSE="docker compose -f $ROOT/docker-compose.yml"

fail() {
    echo "FAIL: $*" >&2
    if [ -f "$BODY" ]; then
        echo "body: $(cat "$BODY")" >&2
    fi
    exit 1
}

restore() {
    touch "$FLAG" 2>/dev/null || true
    rm -f "$MOCK" "$ROOT/public_html/api/nope.php" \
        "$ROOT/public_html/.well-known/acme-challenge/ping" \
        "$ROOT/public_html/blog/_/index.html" \
        "$ROOT/public_html/nfc/t/_/index.html"
    rmdir "$ROOT/public_html/blog/_" "$ROOT/public_html/blog" \
        "$ROOT/public_html/nfc/t/_" "$ROOT/public_html/nfc/t" \
        "$ROOT/public_html/nfc" \
        "$ROOT/public_html/.well-known/acme-challenge" \
        "$ROOT/public_html/.well-known" 2>/dev/null || true
}
trap restore EXIT

code() {
    curl -sS -o "$BODY" -w '%{http_code}' "$@" || true
}

echo "waiting for $BASE/api/health"
ok=0
i=0
while [ "$i" -lt 60 ]; do
    c=$(code "$BASE/api/health")
    if [ "$c" = "200" ]; then
        ok=1
        break
    fi
    i=$((i + 1))
    sleep 2
done
[ "$ok" = "1" ] || fail "health never returned 200 (last $c)"

grep -q '"ok":true' "$BODY" || fail "health not ok"
grep -q '"db":"ok"' "$BODY" || fail "db not ok"
grep -q '"upload_progress":"off"' "$BODY" || fail "upload progress still on"
python3 - "$BODY" <<'PY' || fail "version gate"
import json, sys
j = json.load(open(sys.argv[1]))
php = j.get("php") or ""
parts = php.split(".")
if len(parts) < 3 or tuple(int(x) for x in parts[:3]) < (8, 2, 36):
    sys.stderr.write("php too old: %s\n" % php)
    sys.exit(1)
raw = j.get("db_version") or ""
ver = raw.split("-", 1)[0]
nums = tuple(int(x) for x in ver.split(".")[:3])
ok = ((10, 11, 20) <= nums < (10, 12, 0)) or nums >= (11, 4, 14)
if not ok:
    sys.stderr.write("db refused: %s\n" % raw)
    sys.exit(1)
PY
grep -q '"client"' "$BODY" && fail "client leaked while mock is off"

c=$(code "$BASE/")
[ "$c" = "200" ] || fail "static $c"
grep -q "Found-U" "$BODY" || fail "static body"
c=$(code "$BASE/plain.css")
[ "$c" = "200" ] || fail "css $c"

loc=$(curl -sS -o /dev/null -w '%{http_code} %{redirect_url}' "$BASE/login")
echo "$loc" | grep -q '^301 ' || fail "login redirect $loc"
echo "$loc" | grep -q '/auth/login/' || fail "login location $loc"
for path in /list /login/register /login/forgot-pin /login/reset-password /login/change-password /login/setup-pin; do
    c=$(curl -sS -o /dev/null -w '%{http_code}' "$BASE$path")
    [ "$c" = "301" ] || fail "$path -> $c"
done

hdr=$(curl -sSI "$BASE/" | tr -d '\r')
echo "$hdr" | grep -qi 'x-content-type-options: nosniff' || fail "missing nosniff"
echo "$hdr" | grep -qi 'x-frame-options: DENY' || fail "missing frame deny"

c=$(code "$BASE/.cf-allowlist-off")
[ "$c" = "403" ] || fail "dotfile $c"
echo '<?php echo "nope";' > "$ROOT/public_html/api/nope.php"
c=$(code "$BASE/api/nope.php")
[ "$c" = "403" ] || fail "extra php $c"
rm -f "$ROOT/public_html/api/nope.php"

c=$(code "$BASE/api/no-such")
[ "$c" = "404" ] || fail "missing route $c"
grep -q '"error":"not_found"' "$BODY" || fail "404 body"

mkdir -p "$ROOT/public_html/blog/_" "$ROOT/public_html/nfc/t/_"
echo blog-placeholder > "$ROOT/public_html/blog/_/index.html"
echo nfc-placeholder > "$ROOT/public_html/nfc/t/_/index.html"
c=$(code "$BASE/blog/some-slug/")
[ "$c" = "200" ] || fail "blog rewrite $c"
grep -q 'blog-placeholder' "$BODY" || fail "blog body"
c=$(code "$BASE/nfc/t/abc")
[ "$c" = "200" ] || fail "nfc rewrite $c"
grep -q 'nfc-placeholder' "$BODY" || fail "nfc body"

[ -f "$FLAG" ] || fail "allowlist flag missing"
rm -f "$FLAG"
c=$(code "$BASE/api/health")
[ "$c" = "403" ] || fail "allowlist expected 403 got $c"
mkdir -p "$ROOT/public_html/.well-known/acme-challenge"
echo ok > "$ROOT/public_html/.well-known/acme-challenge/ping"
c=$(code "$BASE/.well-known/acme-challenge/ping")
[ "$c" = "200" ] || fail "acme while locked $c"
touch "$FLAG"
c=$(code "$BASE/api/health")
[ "$c" = "200" ] || fail "allowlist restore $c"

touch "$MOCK"
c=$(code -H 'X-Mock-CF-Edge-IP: 173.245.48.10' -H 'X-Mock-CF-Connecting-IP: 203.0.113.9' -H 'X-Mock-CF-IPCountry: th' "$BASE/api/health")
[ "$c" = "200" ] || fail "mock health $c"
grep -q '"ip":"203.0.113.9"' "$BODY" || fail "mock ip"
grep -q '"country":"TH"' "$BODY" || fail "mock country"
grep -q '"from_cloudflare":true' "$BODY" || fail "mock cf"
c=$(code -H 'X-Mock-CF-Connecting-IP: 198.51.100.7' -H 'CF-Connecting-IP: 198.51.100.7' -H 'X-Forwarded-For: 198.51.100.8' "$BASE/api/health")
grep -q '198.51.100.7' "$BODY" && fail "trusted connecting ip without a cloudflare edge"
grep -q '198.51.100.8' "$BODY" && fail "trusted x-forwarded-for"
rm -f "$MOCK"
c=$(code -H 'X-Mock-CF-Edge-IP: 173.245.48.10' -H 'X-Mock-CF-Connecting-IP: 203.0.113.9' "$BASE/api/health")
grep -q '"client"' "$BODY" && fail "mock leaked after the flag was removed"

apache=$($COMPOSE exec -T web apache2 -v 2>&1 || true)
echo "$apache" | grep -q 'Apache/2.4.71' || fail "apache version: $apache"
$COMPOSE exec -T web php /srv/site/foundu/bin/check-cf-list.php
$COMPOSE exec -T web php /srv/site/foundu/bin/cache-fallback-check.php
$COMPOSE exec -T web php /srv/site/foundu/bin/client-address-check.php
$COMPOSE exec -T web php -r 'exit(ini_get("session.upload_progress.enabled") ? 1 : 0);' \
    || fail "cli upload_progress is on"

echo OK
