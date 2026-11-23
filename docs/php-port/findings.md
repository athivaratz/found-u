# Findings from the P0 inventory

Recorded while reading the tree at `0bfec91`. Nothing here was "fixed" in the Next/Supabase app. Later PHP phases should design these out. Severity is `critical`, `high`, `medium`, or `low`.

The host is VisperHost Web Hosting M: PHP 8.2, `.htaccess`, MariaDB, panel cron, no SSH, no Node at runtime, no daemon, no websocket server, no Redis. APCu may be missing. Host gaps are listed first because they block the port even when they are not security bugs. The replacement column is the plan, not a new idea. The same table is in `contract.md` under Host limits.

## Host: will not run as it does today

| Sev | What | Where | Why it fails on this host | Replacement |
|---|---|---|---|---|
| high | Supabase Realtime | `lib/database.ts` (`createRealtimeSubscription`); `app/admin/logs/page.tsx`, `error-logs/page.tsx`, `categories/page.tsx` | Websocket to an outside service. No websocket server and no long-lived worker | Poll `GET /api/changes` (P5). 20–30s, 10s on admin logs |
| high | Agent SSE / `streamText` | `app/api/agent/chat/route.ts` (`maxDuration = 60`), `lib/agent/agent-ui-stream.ts`, `contexts/chat-context.tsx` (`useChat`) | Streaming holds a PHP worker. No Node | One JSON body, custom `useChat` transport (PLAN §4.4). `set_time_limit(60)`, cURL 45s, concurrency 3 via `GET_LOCK` or `ai_slots` |
| high | Next middleware | `middleware.ts`, `lib/supabase/middleware.ts`, `lib/setup/middleware-guard.ts` | No edge runtime. Without Supabase env it redirects every page and API (except `/setup` and `/api/setup`) to `/setup` | Delete in P6. `.htaccess` rewrite + PHP session |
| high | Server Actions | `app/setup/actions.ts`, `lib/setup/create-wizard-admin.ts` | No Next server | Cut with the wizard |
| high | Edge OG image | `app/blog/[slug]/opengraph-image.tsx` (`runtime = "edge"`) | No edge, no Node, no `@vercel/og` | Static default or one GD image (P10) |
| high | ISR / `revalidateTag` / `unstable_cache` | `app/page.tsx` (`revalidate = 60`), `app/layout.tsx` `generateMetadata`, `lib/seo-metadata.ts`, `app/api/revalidate-og/route.ts`, `app/admin/settings/page.tsx` | No Next cache | Static HTML. `/api/revalidate-og` stays as `{ revalidated: true }` and does nothing. Cloudflare purge is a deploy step |
| high | Server-rendered blog/help | `app/blog/page.tsx`, `app/blog/layout.tsx`, `app/blog/[slug]/page.tsx`, `app/help/page.tsx`, `app/help/layout.tsx`, `app/help/[slug]/page.tsx`, `app/admin/blog/[id]/preview/page.tsx` | They fetch in a Server Component. Static export runs that only at build time, and dynamic `[slug]` cannot be enumerated | Client fetch, skeleton unchanged. Dynamic routes use a `_` placeholder plus a rewrite, then `usePathname()` (PLAN §4) |
| medium | `redirect()` in server pages | `app/(app)/settings/security/page.tsx`, `app/admin/help/page.tsx`, `app/admin/help/[slug]/page.tsx`, `app/admin/ai/models/page.tsx` | `next/navigation` redirect needs the Next server for dynamic params | `.htaccess` redirects for the fixed ones. The slug redirect becomes a client `replace` or a rewrite |
| medium | `next/image` | many components; `next.config.ts` `images.remotePatterns` is pinned to `qfqptklywqbvpjjbmswy.supabase.co` | The optimizer is Node. The hostname is a specific Supabase project, not `APP_URL` | `images.unoptimized`. R2 public base from env |
| medium | Node runtime + AWS SDK | `app/api/storage/upload/route.ts`, `delete/route.ts`, `app/api/admin/blog/upload/route.ts`, `help/upload/route.ts` | No Node. Full AWS SDK is a bad inode fit | Hand-written SigV4 presign (PLAN §4.3) |
| medium | Process-local memory | `lib/student-auth-server.ts` `rateLimitStore`; `lib/passkey-challenge-store.ts`; `app/api/geocode/search/route.ts` `lastRequestAt` | Each PHP request is a new process. Memory is not a shared store. No Redis | `rate_limits`, `login_attempts`, and `sessions` in MariaDB. APCu only as a fast path when it exists |
| medium | Postgres-only SQL | `supabase/migrations/*.sql`: `pg_trgm`, `jsonb`, `timestamptz`, `gen_random_uuid`, enums, RLS, `SECURITY DEFINER` RPCs | MariaDB | PLAN §4.1. Fuzzy match is `LIKE` plus trigram Jaccard in PHP |
| medium | Discord bot loop | `discord-bot/index.mjs` | A resident Node process. No SSH to supervise it | Cut |
| medium | Direct `postgres` and the Supabase CLI | `scripts/reset-setup-sandbox.ts`, `package.json` `db:push`, `postgres` dependency | Node, and a Postgres URL the host does not have | phpMyAdmin for the first SQL, then `bin/migrate.php` from panel cron |
| low | `next/font` | root layout | Safe only if the font is built off-host and shipped as files | Static export. Do not run `next build` on the host |
| low | AI request length | vision/NER/agent | A 30s Gemini call is not a daemon, but it burns one entry process | Semaphore of 3, timeout 45s, 429 when the queue is full |
| low | Browser timers | `app/banned/page.tsx`, `app/(app)/found/page.tsx`, landing hero | These are client timers. They are fine | Leave them. Do not move them into a PHP loop |

Panel cron (`php ~/foundu/bin/cron.php` every 5 minutes) is allowed. It is not a daemon. There is no SSH, so the first admin is a SQL file from `bin/create-admin.php` run in phpMyAdmin, and Composer runs on the build machine.

## Security and authz

| Sev | What | Where |
|---|---|---|
| critical | `public.accounts` has policies but no `ENABLE ROW LEVEL SECURITY` anywhere in `supabase/migrations`. `GRANT UPDATE` to `authenticated` is in `20260616152631_fix_accounts_service_role_grants.sql`. With RLS off, a logged-in user who can reach PostgREST can update any account column the grant allows, including `role`, `pin_hash`, and `current_password_hash` | `20260616152000_create_unified_accounts.sql`, `20260616152631`, `20260616153520`, `20260616171804` |
| critical | Even if RLS were on, `accounts_update_own` is `USING (id = auth.uid()) WITH CHECK (id = auth.uid())` with no column limit. A user can set their own `role` to `admin` | `20260616152631_fix_accounts_service_role_grants.sql` |
| critical | `confirm_item_match` and `unmatch_item_match` are `SECURITY DEFINER` and `GRANT EXECUTE` to `authenticated`. They never call `is_admin()`. Any logged-in student can confirm or undo a match through the Data API, bypassing `/api/match/confirm` | `supabase/migrations/20260723030000_matching_core.sql` |
| critical | `POST /api/ner` and `POST /api/vision` are public. `userId` is optional. Omit it and the Gemini call is not rate limited. `GET` of both returns another user's quota for any id | `app/api/ner/route.ts`, `app/api/vision/route.ts` |
| high | `POST /api/vision` with `testMode: true` skips the limiter when the supplied `userId` is an admin. The caller does not have to be that admin | `app/api/vision/route.ts` |
| high | `lost_items` and `found_items` `SELECT` is `USING (true)` for every role. Rows include `contacts` and `finder_contacts`. The public catalog is intentional; contact details on a world-readable table are not, if the UI ever meant to hide them | `20260612172624_rls_policies_and_realtime.sql` |
| high | `GET /api/auth/device-profile` and `GET /api/auth/register/lookup` are public. Lookup is careful with the not-found message. Device profile returns `nickname`, `firstName`, `hasPin`, and `hasLoggedInOnce` for any 5-digit id. The limiter is an in-process `Map` keyed by student id, 5 per minute per process, so it does not survive two PHP workers and it does not stop a slow scan | `app/api/auth/device-profile/route.ts`, `app/api/auth/register/lookup/route.ts`, `lib/student-auth-server.ts` |
| high | `POST /api/found/expire-overdue` and `POST /api/revalidate-og` have no auth. The first writes. The second only busts a Next cache, which PHP will not have, but the route is still an open POST | `app/api/found/expire-overdue/route.ts`, `app/api/revalidate-og/route.ts` |
| high | `search_lost_items_fuzzy` and `search_found_items_fuzzy` are granted to `anon` and return `SETOF` the whole row. Combined with the public SELECT policy, anon gets contacts | `20260705125243_trgm_fuzzy_search.sql` |
| high | Passkey login verifies the assertion and then returns 501 `"การเข้าสู่ระบบด้วย Passkey อยู่ระหว่างปรับปรุงสำหรับ Supabase"`. Register does write credentials. P4 is a real implementation, not a wrap of this route | `app/api/auth/passkey/login/route.ts` |
| high | Password and PIN hashes are scrypt `salt:hash` (`hashSecret`), not `password_hash`. There is no data migration, so PHP must not try to verify these. New accounts use `password_hash`. Do not copy `hashSecret` into PHP and call it done: scrypt parameters are fine, but the plan already chose `PASSWORD_DEFAULT` | `lib/student-auth-server.ts` |
| medium | `activity_logs` and `error_logs` inserts are `WITH CHECK (true)` for every authenticated user. Anyone can write log rows | `20260612172624_rls_policies_and_realtime.sql` |
| medium | `app_settings` SELECT is public. The JSON blob is the whole settings document. AI keys live in `system_config`, which is better, but anything secret that lands in `app_settings.settings` is world-readable | same migration; `lib/database.ts` `getAppSettings` |
| medium | `help_pages` and `help_sections` SELECT is `USING (true)`, including rows with `audience = 'admin'` | `20260717120000_help_pages_cms.sql` |
| medium | `agent_chat_logs` has a SELECT policy for admins and grants for `service_role`, but no `service_role` policy. Supabase hides this because `service_role` bypasses RLS. PHP has no bypass. Inserts must be an explicit server path, and students must not read other students' prompts | `20260707124102_agent_chat_logs.sql`, `20260707124325_agent_chat_logs_grants.sql` |
| medium | Same bypass assumption on `lost_items`, `found_items`, `articles`, `help_*`, `match_dismissals`: the API uses the service role and the policies never mention it | `20260616153520`, `20260717220000`, `20260717120000`, `20260723030000` |
| medium | Cookie routes and bearer routes do not accept each other's credentials. A PHP port that only checks one of them will 401 half the app | `lib/nfc-server.ts` `verifyAuthRequest`; `lib/supabase/server.ts` |
| medium | `is_admin()` reads `accounts.role` only. It does not look at `admin_whitelist`. Promotion happens as a side effect of `GET /api/auth/session-status`. A whitelisted user is not an admin until that GET runs | `20260616153450_fix_is_admin_use_accounts.sql`, `app/api/auth/session-status/route.ts` |
| medium | Bootstrap admin is the hardcoded student id `11111` | `lib/student-auth-server.ts` `BOOTSTRAP_ADMIN_STUDENT_IDS` |
| medium | NFC found-report rate limit fails open when the count query errors | `lib/nfc-server.ts` `checkNfcFoundRateLimit` |
| medium | `accounts` SELECT policies are `linked_uid = auth.uid()` and `is_admin()`. There is no `id = auth.uid()` policy. A row with a null `linked_uid` is invisible to its owner | `20260616171804_accounts_select_linked_and_remove_duplicate_admin_auth.sql` |
| low | `cleanupOldAIUsage` deletes, but `authenticated` has no DELETE grant or policy on `ai_usage` | `lib/database.ts`, `20260612172624` |
| low | `lost_items` / `found_items` UPDATE and DELETE are admin-only. `updateLostItem` and `updateFoundItem` in `lib/database.ts` run with the user JWT, so a student edit fails closed. PHP should keep that unless a route already does the write as the server | `lib/database.ts`, RLS file |
| low | `lib/validations/admin.ts` `importStudentsSchema` uses `csv`. The route schema uses `csvContent`. Port the route | `app/api/admin/students/import/route.ts` |
| low | Geocode limiter is one global `lastRequestAt`. One admin blocks every other admin | `app/api/geocode/search/route.ts` |
| low | `next.config.ts` redirects (`/login` → `/auth/login`, and the other six) must be copied into `.htaccess`. They are not in the PHP app by magic | `next.config.ts` |

## Worth doing while porting, not bugs

| Sev | What | Where |
|---|---|---|
| medium | `getStats` downloads every status and counts in the browser | `lib/database.ts` |
| medium | Realtime callbacks refetch full lists. Polling should fetch `max(updated_at)` first and skip the list when nothing changed | `lib/database.ts` `createRealtimeSubscription` |
| low | `getAIUsageStats` names `total` but the query is only the last 7 days, same as `thisWeek` | `lib/database.ts` |
| low | `isAdminUser` is copy-pasted in several route files | agent, geocode, ai-credentials, vision |
| low | Identity is split across `accounts`, legacy `profiles`, legacy `student_accounts`, and `passkey_lookup`. Runtime auth uses `accounts` plus `passkey_lookup`. PHP should not recreate `profiles` or `student_accounts` | migrations `20260616152000` and `lib/student-auth-server.ts` |
| low | `GRANT SELECT ON ALL TABLES` ran before `accounts` existed, so later tables do not inherit it. Effective grants on a hosted Supabase project may be wider than the SQL files because of default privileges. The matrix follows the SQL we have | `20260612172624_rls_policies_and_realtime.sql` |

## Plan vs code, kept as written

- NFC found reports require a bearer. The plan mentions Turnstile on anonymous NFC reports. The route retired that. PHP keeps the login requirement.
- Turnstile is not in the current app. Add it on login and register only (owner), managed mode.
- No domain is hardcoded for the app URL. One Supabase storage host is hardcoded in `next.config.ts`. Drop it.
- `POST /api/agent/chat` streams today. PHP returns JSON once. That is the one response-type change in the contract.

## Security baseline

Pinned while building the local stack. Versions checked against public releases on 2026-11-24.

- MariaDB in docker is 10.11.20, not 10.6 (that line stopped receiving security fixes on 2026-07-06). Docker Hub had no `mariadb:10.11.20` tag on 2026-11-23, so `docker/mariadb/Dockerfile` starts from `mariadb:10.11.19` and installs `1:10.11.20` from `archive.mariadb.org`. Health returns 503 `db_version` below 10.11.20, and also below 11.4.14 on the 11.x line. `SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci` and `SET time_zone = '+00:00'` are valid on both 10.11 and 11.x (`foundu/src/Database.php`).
- PHP image is `php:8.2.36-apache`. `Foundu\Platform::MIN_PHP_VERSION_ID` is 80236. `public_html/api/index.php` loads `foundu/src/Platform.php` before Composer and returns 503 JSON `php_version` when `PHP_VERSION_ID` is lower, and logs it. The same code path is valid on 8.3 and 8.4. 8.2 security support ends 2026-12-31; the host may move to 8.3.37 or 8.4.28. Select that version in DirectAdmin. Do not add syntax that 8.2.36 cannot parse.
- `session.upload_progress.enabled` is forced off and is not left to the 8.2.36 default. It is set in `docker/php/php.ini`, `public_html/.user.ini`, `php_flag` inside `IfModule` in `public_html/.htaccess`, and `ini_set` at the top of `public_html/api/index.php`. The directive is `PHP_INI_PERDIR`, so `ini_set` does not stick on every SAPI. The ini files are the ones that count. php-fpm on the host reads `.user.ini`. If the site answers 503 `upload_progress`, set the same directive in the DirectAdmin PHP selector.
- Composer minimums in `foundu/composer.json`: `slim/slim` ^4.15.3, `slim/psr7` ^1.8.1, `monolog/monolog` ^3.13.0. `foundu/composer.lock` is committed. `vendor/` is not. `make audit` runs `composer audit` and `npm audit`. Later phases add `web-auth/webauthn-lib` ^5.3.5 and, only if the hand-written SigV4 presign is not enough, `aws/aws-sdk-php` >=3.383.1.
- Apache in `php:8.2.36-apache` is 2.4.71 (Debian, built 2026-11-11). The image build refuses an older binary. `mod_remoteip` is not enabled, so `Require ip` in `.htaccess` sees the TCP peer. If VisperHost already copies the visitor IP into `REMOTE_ADDR`, that block will 403 every client and has to come out (`public_html/.htaccess`).
- `public_html/.cf-allowlist-off` disables the Cloudflare IP lock. It is created only when `FOUNDU_CF_ALLOWLIST=off`. Uploading it opens the origin. Mock Cloudflare headers are honored only when `APP_ENV` is `local` and `foundu/config/mock-cf.on` exists (`foundu/src/Http/ClientAddress.php`). `X-Forwarded-For` is not read.
- `/api/health` has no rate limit yet. P3 adds the APCu / file / MariaDB limiter. The health body does not include the visitor IP unless the local mock flag is on.
- CSP in `.htaccess` allows `img-src https:` until the R2 host is fixed. Next's static export may also need a script hash. Revisit in P11.
- `composer audit` on `foundu/composer.lock` reports no advisories. `npm audit` on the existing Next lockfile reports 26 (1 critical, 13 high, 8 moderate, 4 low), including `undici` via `discord.js` and `zod` below 4.6.6. That tree is outside this stack. `make audit` still runs it.

## Closed or narrowed in P2

| Sev | What | What changed |
|---|---|---|
| critical | `accounts` had policies and `GRANT UPDATE` to `authenticated`, and no `ENABLE ROW LEVEL SECURITY`. An owner update could also set `role` | The PHP database is one app user, so a grant to `authenticated` does not exist. `accounts_bi_guard`, `accounts_bu_guard`, and `accounts_bd_guard` reject inserts, deletes, and changes to the locked columns unless that connection has `@foundu_allow_privileged = 1`. The column list is in `authz-matrix.md`. A student update of `shown_name` still works. A route in P4 has to set the flag for a real password or role write, and it still must not copy request fields onto the locked columns. The Supabase project is untouched |
| low | Postgres partial indexes (`WHERE linked_uid IS NOT NULL`, `WHERE tag_uid <> ''`) | MariaDB 10.11 has no partial indexes. `linked_uid` is a normal index. `tag_uid` is `UNIQUE` and the check constraint rejects `''`, so missing hardware ids are `NULL` (those do not collide) |
| low | A token-protected web page that runs migrations | Not built. The token would live next to the site, and a bug in the check would be schema execution. Import `foundu/migrations/all.sql` in phpMyAdmin. `bin/migrate.php` is the CLI and the panel cron, and it records checksums so a file that changed after it was applied is refused |

`password_hash` prefers Argon2id (`memory_cost` 65536, `time_cost` 4, `threads` 1) and falls back to bcrypt. bcrypt ignores bytes after 72, so `create-admin.php` refuses a longer password when the hash it actually produced is bcrypt. `password_verify` accepts either form. Do not copy the old scrypt `salt:hash` format.

## Closed or narrowed in P3

| Sev | What | What changed |
|---|---|---|
| medium | `/api/health` had no rate limit | It now uses the same per-IP API window as every other non-auth path (120/minute by default). It is still unauthenticated |
| medium | `Database` kept a static PDO and `create-admin.php --apply` set `@foundu_allow_privileged` inside a transaction | A MariaDB user variable is not undone by `ROLLBACK`, and PHP-FPM reuses the process, so a flag or an open transaction would have been visible on the next request that shared the worker. `Database::privileged()` clears the flag in a `finally`. The end of the request rolls back a leftover transaction and sets the flag back to 0. `create-admin.php --apply` goes through that helper. The printed SQL for phpMyAdmin still sets and clears the variable itself, because that session is not ours |
| low | The app connection did not set a strict SQL mode | It now sets the same `sql_mode` as the migration scripts, so a too-long string fails instead of being stored chopped |

The error JSON from this layer does not include a stack trace, including when `APP_ENV=local`. Local adds `detail` with the exception message. The trace is in `foundu/storage/logs` and, for 5xx, in `error_logs`. That is deliberate: a local docker port is still an HTTP port.

Slim's routing middleware throws 404 before it calls whatever is inside it. The first draft of the kernel added routing on the outside of the rate limit, so a request for a path that does not exist never touched `rate_limits`. Routing now sits inside the limiter. Unknown paths are counted and then answered 404.

## Closed or narrowed in P4

| Sev | What | What changed |
|---|---|---|
| high | Login, register, reset, and passkey challenges lived in process memory, and passkey login returned 501 | Challenges are `sessions` rows with `kind` `passkey_login` or `passkey_register` and a 5 minute expiry. A success consumes the row with `SELECT … FOR UPDATE`. Passkey login now issues a real session. `web-auth/webauthn-lib` 5.3.15 checks origin as scheme, host, and port |
| medium | A banned account could keep using a cookie that was issued before the ban | `BanMiddleware` revokes every session of a blocked account, and `AccountWriter::setBan` does the same when the status is not `none`. P5 should call `setBan` rather than writing `ban_status` itself |
| medium | `verify-password` and `verify-pin` would have shared one fake IP for the hourly bucket | The first draft passed `0.0.0.0`. Both routes now use the client IP from the middleware |

## Closed or narrowed in P5

| Sev | What | What changed |
|---|---|---|
| high | Supabase Realtime cannot run on this host | `GET /api/changes` reads `change_feed` with one indexed query and an ETag. A matching `If-None-Match` is 304 with an empty body. The route does not open a session, so polling does not slide `expires_at` |
| medium | `getStats` downloaded every row and counted in the browser | `GET /api/stats` is one `UNION ALL` of `GROUP BY status` |
| medium | `POST /api/found/expire-overdue` loaded every pending row and updated them one by one | One `UPDATE` on `(status, handover_deadline_at)`. The route is still public, and it now also sits behind 10 requests a minute per IP |
| medium | `SessionService::revokeAccount` always cleared the cookies on the response | An admin reset, and an admin ban of someone else, would have signed the admin out. The clear is now a flag, and it is set only when the target is the current session |
| low | A Google profile photo host was copied into `photoURL` | `People::map` drops `googleusercontent` hosts, the same way `mapAccountRowToAppUser` does |

Item lists stay `Cache-Control: private, no-store`. They are readable by a guest, and they still include contacts. Caching that at Cloudflare would pin contact details on a shared edge. The public cache (`public, s-maxage=60`) is for settings, the catalog, stats, and the hero image list.

Creating an item is limited to 30 an hour for a student and 200 an hour for an admin. The admin settings page imports many rows. 30 would have failed that restore.

## Left open on purpose in P5

| Sev | What | Why it is still like this |
|---|---|---|
| high | Guest reads of lost and found items include contacts | The matrix and the current pages both do this. Hiding contacts is a product change, not a quiet port |
| low | A student cannot update or delete their own item | That is how the RLS policies already fail. Confirm, unmatch, and `matched_*` are the later match phase |
| low | `POST /found-items/{id}/handover` is admin only | The only caller is the admin items page |
| low | A role change does not revoke sessions | The next request reads `accounts.role`. Demoting yourself is refused so an admin cannot lock the last session out of the admin routes by accident |

## Left open on purpose in P4

| Sev | What | Why it is still like this |
|---|---|---|
| medium | `POST /auth/login` still returns `needsRegistration` when the roster row has no password and is not registered | The login page branches on that flag. A missing id and a wrong password share one sentence. An unregistered roster id does not. P6 can drop the flag once the page stops needing it |
| medium | The login JSON used to include `access_token` and `refresh_token` | Closed in P6. The cookie is the session. The JSON no longer carries the secret |
| low | `Authorization: Bearer` used to skip CSRF when the cookie was absent | Closed in P6. The middleware only reads the session cookie |
| low | `GET /auth/device-profile` and a successful register lookup still return a name | The device and register screens need it. Each student id is limited to 5 lookups a minute, on top of the auth IP bucket. Disabled and banned rows look like "not found" |
| low | `web-auth/webauthn-lib` 5.3.15 pulls in about 1,100 files (CBOR, COSE, Symfony polyfills) | The plan said to switch to `lbuchs/webauthn` if the inode count was too high. Production `vendor/` is about 1,800 files, and roughly 1,100 of those are this library. That is acceptable next to the AWS SDK we are not shipping, and this library matches `@simplewebauthn/browser` plus the origin check. Do not add another WebAuthn package |
| low | A changed password is not limited to the old 7–8 character school alphabet | Login accepts 8–128 characters with a letter and a digit (72 when the box only has bcrypt). The school password on reset, and the optional password on admin create, stay 7–8 alphanumeric. Student ids stay 5 digits. Student id `11111` is not special; `create-admin.php` is the bootstrap |
| low | Reset of a missing account is 401 with the same sentence as a wrong PIN or school password | The old contract said 404. That told a caller which ids exist. An admin reset of a missing student is still 404, because that caller is already an admin |

## P6

| Sev | What | Why it is still like this |
|---|---|---|
| low | `needsRegistration` is still on a failed login for an unregistered roster id | The login page still branches on it. Dropping it would make that id look like a wrong password |
| low | `getLostItems` and `getFoundItems` ignore the old constraint argument | Nothing in the app passed one. The HTTP list has its own filters |
| low | `cleanupOldAIUsage` returns 0 | Students cannot delete `ai_usage`. Cron does |
| note | Article and help writes answer 501 after the authz check | The editor pages call those routes. Reading works. P10 fills in the writes |
| note | NFC, match, vision, and the agent still have server modules that throw if called | Their Next routes are gone so the proxy can reach PHP. P7–P10 replace the modules |
| note | Several pages are still server components (`generateMetadata`, `revalidate`, blog and help reads) | P11 turns the app into a static export. `FOUNDU_API_ORIGIN` is only the dev proxy and should go away then |
| note | `npm audit` before this phase was 26 (1 critical, 13 high). After next 16.4.6, removing discord.js, and `npm audit fix`, it is 0 | `zod` is pinned at 4.6.7. Next vendors the patched server-dom packages |

## P7

| Sev | What | What changed |
|---|---|---|
| medium | Upload routes ran in Node with the AWS SDK, and the blog and help editors posted `FormData` to routes that no longer exist | `Foundu\Storage\SigV4` signs a PUT and a DELETE. `lib/storage.ts` and the two editors PUT the file to R2. PHP does not read the body. SVG is rejected. Blog and help stay at 5MB; other images stay at 10MB |
| low | `lib/storage.ts` posted the file with `fetch` and no `X-CSRF-Token` or `X-Requested-With` | Deletes and presigns go through `apiRequest` / `apiFetch`, so the cookie session is accepted |
| low | `lib/storage/upload-backend.ts` fell back to Supabase Storage when R2 env was empty | Nothing imported it. It now only lists the image types the browser may ask for. There is no second backend |
| low | The found-item object key used a tracking code the browser chose, before the item row existed | The key is `{prefix}/{accountId}/{random}.{ext}`. A client `path` is ignored. Delete checks that id against `storage_objects` |
| note | No anonymous upload exists, so Turnstile is not called here | A guest is 401 even if the body includes `turnstileToken`. A signed-in upload does not send a token. Login and register still verify Turnstile |
| note | The delete response includes `deleteUrl` as well as `{ success: true }` | The browser has to perform the DELETE. The row stays so a failed attempt can ask again. The URL expires in 120 seconds |
| note | Presign is 20/hour/account via `Buckets::presign($config)` | The account id is the limiter subject, not an argument of `presign()`. Deletes do not spend that bucket |

## Closed or narrowed in P8

| Sev | What | What changed |
|---|---|---|
| critical | `POST /api/ner` and `POST /api/vision` were public, and a caller could omit `userId` to skip the limiter. `GET` returned another user's quota | Both require a session. `?userId=` is ignored. Quota is the session account. A full semaphore is 429 `queue_full` with `คิว AI เต็ม ลองใหม่อีกสักครู่` and does not write `ai_usage` |
| high | `testMode: true` skipped the limiter for any `userId` that belonged to an admin | `testMode` is honored only when the session itself is an admin |
| high | `search_*_fuzzy` was granted to `anon` and returned whole rows | `GET /api/search` is the replacement. It still returns the public item shape, contacts included, with `private, no-store`. There is no SQL function for a student to call |
| critical | `confirm_item_match` / `unmatch_item_match` were `SECURITY DEFINER` and granted to `authenticated` | Confirm and unmatch are admin routes. The write is a PHP transaction with `SELECT … FOR UPDATE`. A student gets 403 |
| medium | Fuzzy search needed `pg_trgm`, which MariaDB 10.11 does not have | Character trigrams and Jaccard run in PHP on at most 300 rows. Above that, character-bigram `LIKE` probes pick the 300. No n-gram table and no FULLTEXT. The method and the 20-query fixture are in `docs/php-port/ai.md` |
| low | AI calls were specified at 45 seconds, which does not fit a 30 second `max_execution_time` | Primary timeout is 12 seconds (cap 20). Match compares are 8 seconds, three of them, with a 20 second deadline. Batch AI re-ranks 8 lost items, not the whole pool |

## Left open on purpose in P8

| Sev | What | Why it is still like this |
|---|---|---|
| high | Guest reads of lost and found items, including search, still include contacts | Same product choice as P5. Search uses the list mapper |
| medium | The first AI call of a session does not check Turnstile | The plan puts that on the agent phase. P9 should add it in front of `Budget::charge`, not a second limiter |
| note | `lib/match-service.ts`, `lib/vision.ts` `extractVisionData`, and the agent tools still throw or still call Gemini from Node | The pages that used to `fetch` those routes now send the CSRF header. The agent modules stay for P9. See `docs/php-port/ai.md` |
| note | Gemini is called with the key in the query string | That is the Gemini URL. The client JSON, logs, and `debug` do not include the URL or the key. cURL errors are not returned |

## P10

| Sev | What | What changed |
|---|---|---|
| high | Blog and help HTML would have been stored raw, and the edge OG image cannot run here | Admin writes sanitize TipTap and help HTML with an allowlist. `meta.php` fills the tags. `og.php` draws the card with GD and Sarabun |
| medium | NFC routes were missing, so the client treated every tag as empty, and a body could have set `ownerId` | The contract routes and the `lib/database.ts` helpers are implemented. `ownerId` on a found report is ignored. `finderUserId` must be the session. Another student's tag is 403 |
| medium | Geocode rate limit was one timestamp in a Node process | It is a MariaDB window: 1 upstream call per 2 seconds, 30 per admin per minute, plus a 7 day cache |
| low | `Values::contacts` with `$required = true` still accepts an empty list | Pre-existing. NFC register checks the list is non-empty before it calls that helper. Item create still allows an empty contact list, which matches the current forms |
| note | The daily dump PUTs with `SigV4::authorization` | Same signer as the presigned upload. Region is `R2_REGION`, or `auto`. The dump is skipped when the R2 keys are empty |
| note | Article and help writes are no longer 501 | Closed the P6 note above. The blog index navigates to the new draft |
