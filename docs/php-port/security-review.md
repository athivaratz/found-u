# Security review (P12)

Reviewed the PHP API under `foundu/src` and `public_html/.htaccess` against `authz-matrix.md`. PHPUnit covers the fixes. Anything that needs the real DirectAdmin account is listed at the bottom and again in `go-live.md`.

Severity is `critical`, `high`, `medium`, or `low`.

## Fixed

| Sev | Finding | Fix | Test |
|---|---|---|---|
| high | `GET /lost-items`, `/lost-items/latest`, `/lost-items/{id}`, `/lost-items/by-code/{code}`, and the same four found-item routes returned `contacts` or `finderContacts` to a guest and to another student. A lost row also carried that student's id. `POST /match` did the same inside `lostItem` and `foundItem`, and it does not require a session. Search already hid the contact list. The catalog and the match response did not | `Foundu\Data\Privacy` clears `contacts` and `studentId` on a lost row, and `finderContacts` on a found row, unless the caller is the owner or an admin. List, latest, by-code, detail, search, and match suggestions all use it. The create response is still the owner's own row, so the form can show what they just typed | `DataHttpTest::testListsHideContactsFromGuestsAndOtherStudents`, `AiPipelineTest::testSearchHidesContactsFromGuestsAndOtherStudents` |
| medium | `LimitRequestBody 262144` in `.htaccess`, and `post_max_size` / `upload_max_filesize` of 256K in `.user.ini` and the docker `php.ini`, answered before PHP for `/api/vision` and `/api/agent/chat`. Those two routes accept a photo up to 1.5 MiB. Every other route was already capped in `JsonBody` | Apache now stops at 1572864. The ini files allow 8M so a 1.5 MiB photo reaches PHP. A normal post over 256 KiB, and an AI post over 64 KiB, still get `413 payload_too_large` from PHP | `tools/attack.php` (`oversized`) |
| medium | `bin/cron.php` tried to dump the whole database in one run with a 50 second budget. The host stops PHP at 30 seconds, so a larger dump would die mid-file and the next run would start over. The first cut of the chunked writer also stopped after 40 rows even when time was left, and a restore of `accounts` died on the delete trigger | `SqlDump::advance` keeps writing until the deadline or the row budget. Each cron slice stops around 18 seconds and the next run continues. The dump sets `@foundu_allow_privileged` so the account trigger lets the restore delete and insert. `bin/restore.php` loads a `.sql` or `.sql.gz` with no `exec()` | `CronTasksTest::testDumpRestoresADeletedRow`, `CronTasksTest::testDumpCanStopAndResumeInsideThirtySeconds`. A 2001-row database dumped in 0.073s and restored in 0.197s |
| low | There was no way to stop new signups without taking the site down. Login and admin import are different things | `SIGNUPS_ENABLED=0` in `.env.php` makes register lookup and register complete return 403 `ปิดรับสมัครชั่วคราว`. Login, PIN, and admin create still work. The default is on | `AuthHttpTest::testSignupsCanBeClosedFromEnv` |

## Looked at, left as they are

| Sev | What | Why it stays |
|---|---|---|
| — | CSRF | A cookie session that mutates must send `X-CSRF-Token`. The header has to match the CSRF cookie and the value stored on the session row. GET does not. Login has no session yet, so it is not asked. `CsrfMiddleware` |
| — | Session fixation | Login does not keep a token the browser already held for a different account. It revokes that row, inserts a new one, then rotates the token and the CSRF secret before the response. `SessionService::issue` then `rotate` |
| — | SQL injection | Values go through prepared statements. Table and column names in the dump and the list filters are checked against `[A-Za-z0-9_]` or a fixed list. `LIKE` patterns escape `%`, `_`, and the escape character |
| — | Stored XSS in help and blog HTML | `Foundu\Cms\Html` keeps an allowlist. `script`, `svg`, event handlers, and `javascript:` links are dropped. Attributes other than a safe `href` are not copied |
| — | Reflected XSS | Item name and description are JSON, and the React pages render them as text. Blog and help titles injected by `meta.php` go through `htmlspecialchars` |
| — | SSRF | Geocode calls only the URL in `GEOCODE_ENDPOINT`, defaulting to Nominatim over HTTPS, with redirects off. The search text is a query parameter. Vision refuses an `http` or `https` image URL and accepts a data URL or base64. Gemini and OpenRouter URLs are fixed in code |
| — | Upload and presign | The browser does not choose the object key. The key is `{purpose}/{accountId}/{random}.{ext}`. SVG is not in the type list. Presign is 20 per hour per account. A guest is 401. Delete checks the account id in `storage_objects` and the same id in the key |
| — | Mass assignment | `Values::only` rejects a key that is not on that route's list. Profile update cannot set `role`. The MariaDB trigger rejects locked account columns unless the route set `@foundu_allow_privileged` |
| — | Rate limits | Every API path, including a 404, spends the IP bucket before routing (120/minute, 10/minute on `/auth`). Login locks an account after 5 failures for 15 minutes, and an IP after 20 for an hour. AI calls need a Turnstile pass on the session when the secret is set |
| — | Error leaks | Production JSON is `{"error":"..."}`. Stack traces go to the log file and, for 5xx, to `error_logs`. `APP_ENV=local` may add `detail`. It does not add the trace |
| — | Login timing | A missing account still runs `password_verify` against a fixed Argon2id hash, so it does not return early. A wrong password and a missing id share one sentence. An unregistered roster id still returns `needsRegistration`, which the login page branches on. That difference is recorded in `findings.md` |

## Still not something this repo can close

| Sev | What | Where it has to be done |
|---|---|---|
| medium | If the host copies the visitor IP into `REMOTE_ADDR` (mod_remoteip or LiteSpeed "Use Client IP"), the `Require ip` block in `.htaccess` answers 403 for everyone, including Cloudflare | Ask VisperHost before go-live. The check is in `cloudflare.md` and `go-live.md` |
| medium | Imunify360 may answer 403 for `/api/agent/chat` because the JSON looks like a payload. PHP never sees the request | Ask them to whitelist that path. See `go-live.md` |
| low | Bot Fight Mode can challenge `fetch` to `/api` and a custom rule cannot skip it | Leave it off. `cloudflare.md` |
| low | `GET /auth/device-profile` and a successful register lookup still return a name | The screens need it. Each id is limited to 5 lookups a minute, on top of the auth IP bucket |

The old Supabase holes (RLS off on `accounts`, public vision, student-callable match RPC) are not in this API. Notes on those stay in `findings.md`.
