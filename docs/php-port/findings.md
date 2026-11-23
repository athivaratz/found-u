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
