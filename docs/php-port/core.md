# PHP core

P3 is the shared layer behind `public_html/api/index.php`. Domain routes are not here yet. A later phase adds a route on the Slim app in `foundu/src/Kernel.php` and reads the attributes below. There is no service container. The kernel builds a few objects and closes over a PDO factory that connects on the first call.

## What a request walks through

1. Security headers, from PHP, on the way out.
2. Real client IP.
3. A size and path check, then the IP rate limit (one MariaDB upsert). A missing route is counted here too. Routing sits further in, so a scan of random paths cannot skip the counter.
4. JSON body, only when a mutation actually sent bytes.
5. Session cookie, only when one was sent.
6. CSRF, only for a mutation that has a live session.
7. The route.

`/api/health` stays open to guests and still spends one rate-limit upsert. It does not read a session unless the browser sent the cookie.

Request attributes later code can read:

| Attribute | What it is |
|---|---|
| `client` | `Foundu\Http\ClientAddress` |
| `actor` | `Foundu\Auth\Actor` (`guest`, `user`, or `admin`) |
| `session` | `Foundu\Auth\SessionRecord`, or null |
| `json` | The decoded object, or null when the body was empty |
| `cookies` | `Foundu\Http\CookieQueue`. Push `Set-Cookie` lines here |

`Foundu\Auth\Authz::permits($table, $op, $actor, $row)` is the matrix in `authz-matrix.md`. `guest` is that document's anon. Unknown tables and the server-only tables (`sessions`, `rate_limits`, `login_attempts`, `ai_slots`, `ai_credentials`, `change_feed`, `schema_migrations`, `cron_lock`, `passkey_lookup`) come back denied. A route that is allowed to write one of those does the check for its own role first, then writes. There is no bypass flag.

`Authz::requireRole` throws 401 for a guest and 403 for a signed-in account that is short of the role, banned, or disabled. The account row is read on every request that sends a session cookie, so a demotion shows up on the next call. That is not a substitute for `SessionService::rotate`, which kills the old cookie. Call `rotate` after login and after a role, ban, password, or PIN change.

An owner update of `accounts` means the profile columns only (`display_name`, `photo_url`, `nickname`, `shown_name`, `has_seen_tutorial`). The trigger rejects the locked columns. `Database::privileged()` is how a route sets `@foundu_allow_privileged` for a real password, PIN, ban, or role write. Clear is in a `finally`, because a user variable survives `ROLLBACK`. The same clear runs again at the end of the request: the PDO handle is cached on the worker (PHP-FPM reuses the process), and an open transaction or a leftover flag would otherwise be visible to the next request. Do not turn on `PDO::ATTR_PERSISTENT`.

Selecting `app_settings`, categories, or a help page is allowed for a guest. The public route still returns the small JSON from `contract.md`, not the whole row.

## Errors

Every error from this layer is JSON:

```json
{"error":"not_found"}
```

A 429 also sends `Retry-After` (seconds) and `retryAfterMs`. The code is a short token (`csrf`, `too_many_requests`, `invalid_json`, `payload_too_large`, `unsupported_media_type`, `unauthorized`, `forbidden`, `server_error`). Routes that already have a Thai sentence in the contract should catch `HttpError` and replace `error` with that sentence.

Nothing in the JSON is a stack trace. `APP_ENV=local` adds `detail` with the exception message for errors we did not raise on purpose. Production omits it. The trace goes to `foundu/storage/logs` (Monolog, 14 daily files) and, for 5xx only, into `error_logs`. A 429 is sampled into `activity_logs` about one time in twenty so a flood does not fill the table.

## Real IP

`Foundu\Http\ClientAddress` is unchanged from P1. `CF-Connecting-IP` counts only when `REMOTE_ADDR` is in `foundu/config/cloudflare-ips.php`. `X-Forwarded-For` is not read. Mock headers still need `APP_ENV=local` and `foundu/config/mock-cf.on`.

Cookies use `APP_URL` and the server's own `HTTPS` flag to decide Secure and the `__Host-` prefix. `X-Forwarded-Proto` is not read. If a proxy speaks plain HTTP to PHP, set `APP_URL` to `https://…` so the cookie is still marked Secure.

## Rate limits

Fixed window, one statement:

```sql
INSERT INTO rate_limits (scope, subject, window_start, hits)
VALUES (?, ?, ?, LAST_INSERT_ID(1))
ON DUPLICATE KEY UPDATE hits = LAST_INSERT_ID(LEAST(hits + 1, 1000000000))
```

The middleware applies the IP buckets from PLAN §7.3. Counts come from config, windows are fixed:

| Bucket | Who | Default | Window |
|---|---|---|---|
| `ip_api` | every path that is not auth, including `/api/health` | `RATE_LIMIT_API_PER_MINUTE` 120 | 60s |
| `ip_auth` | `/auth` and `/auth/…` | `RATE_LIMIT_AUTH_PER_MINUTE` 10 | 60s |
| `account_presign` | not applied by the middleware | `RATE_LIMIT_PRESIGN_PER_HOUR` 20 | 3600s |

P7 calls `Limiter::hit` with `Buckets::presign()` and the account id. APCu (or a missing APCu) only remembers a denial until the window ends. A request is allowed only after MariaDB says so. `FOUNDU_DISABLE_APCU=1` turns the cache off. There is no Redis and no file counter for this.

## Sessions and CSRF

The cookie value is 32 random bytes, base64url. `sessions.token_hash` is SHA-256 of that value. The cookie is `HttpOnly`, `SameSite=Lax`, `Path=/`, and `Secure` on HTTPS. The name is `__Host-foundu` on HTTPS and `foundu` on plain HTTP. `__Host-` has no `Domain` attribute.

Idle default is 30 minutes (`SESSION_IDLE_SECONDS`). Absolute default is 12 hours (`SESSION_ABSOLUTE_SECONDS`). `expires_at` moves forward on activity, and it never passes `created_at` plus the absolute lifetime. A write happens at most about once a minute. `bin/cron.php` deletes expired rows, revoked rows older than a day, and rows past the absolute lifetime.

CSRF is double-submit, checked against the session row. The second cookie (`__Host-foundu-csrf` or `foundu_csrf`) is not `HttpOnly`, so the browser script can copy it into `X-CSRF-Token`. A mutation with a live session must send a header that matches both that cookie and `sessions.csrf_token`. GET, HEAD, and OPTIONS skip the check. So does a request with no session, which is how login and register stay open. P6's `apiFetch` should send the header on every mutation. Origin and `Sec-Fetch-Site` are not consulted: they fail local tools, and some browsers drop Origin.

`SessionService::markAiVerified` writes `ai_verified_until`. P9 uses that for the "Turnstile once per AI session" flag. This phase does not set it.

## Turnstile, lockout, AI

`Foundu\Auth\Turnstile` POSTs to Cloudflare's siteverify with cURL, a 5 second timeout, and no redirects. An empty `TURNSTILE_SECRET` skips the check (local docker). `TURNSTILE_ENABLED=0` skips it even when a secret is set. `TURNSTILE_ENABLED=1` with an empty secret fails closed. A timeout or a bad answer fails closed. Login and register call this in P4. Nothing in P3 demands a token on its own.

`LoginLockout` is the same idea for P4. Five failures on one account lock it for 15 minutes. Twenty failures from one IP lock that IP for an hour. A success resets the count that comes after it. The class returns a wait in seconds. The route still answers with a vague message.

`Foundu\Ai\Semaphore` leases a row in `ai_slots` under `GET_LOCK`, after deleting expired leases. The cap is `AI_MAX_CONCURRENCY` (3) and the lease is `AI_SLOT_LEASE_SECONDS` (60). A full queue returns null. The Thai sentence for that 429 is `Semaphore::FULL_MESSAGE` (`คิว AI เต็ม ลองใหม่อีกสักครู่`). `Foundu\Ai\Quota` counts `ai_usage` (5/minute and 30/hour per account, 20/minute and 100/hour for the site, matching the current app). Neither class calls a model.

## Bodies

Mutations with a non-empty body must be `application/json` or `application/json; charset=utf-8`. The cap is `BODY_MAX_BYTES` (256 KiB). `/agent`, `/ai`, `/ner`, and `/vision` use `BODY_MAX_AI_BYTES` (64 KiB). Nested JSON deeper than 16 levels is rejected. A list body is rejected. `Foundu\Validation\Input` checks strings, 5-digit student ids, UUIDs, enums, and ints, and answers 400 `invalid_input` with a `field`. P8 may raise the vision cap; a photo does not fit in 64 KiB.

## Cron

DirectAdmin runs one command:

```text
*/5 * * * * php ~/foundu/bin/cron.php
```

The script takes the `cron_lock` row. If the row is still held, it prints `cron busy` and exits 0 so the panel does not mail a failure. The lock lasts 10 minutes, which is long enough that a crash does not block the rest of the day and short enough that two live runs do not delete the same rows. This entry point currently deletes expired sessions, old rate-limit windows, login attempts older than two days, expired AI leases, and `ai_usage` older than two hours (500 rows at a time). Item expiry, chat logs, the Cloudflare IP refresh, and the database dump should be added here in later phases, not as a second script.

## Tests

`make test` migrates the dev database, runs the smoke script, then `foundu/bin/phpunit.sh` against a separate `foundu_phpunit` database. `composer audit` is still `make audit`.
