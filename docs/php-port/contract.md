# API and adapter contract

Source: `app/api/**/route.ts` and `lib/database.ts` at `0bfec91`, plus `app/auth/callback/route.ts`.

This file describes the current HTTP shapes the PHP port must keep, and the pieces that cannot run on VisperHost Web Hosting M. Do not redesign the JSON. Where the host cannot do what Next does today, the replacement is the one already in PLAN.md. Those replacements are called out in [Host limits](#host-limits) and again on the route.

## Counts

| Item | Plan §1 | In this tree |
|---|---|---|
| Route files under `app/api` | 57 | **56** |
| Extra route outside `app/api` | (folded into 57) | `app/auth/callback/route.ts` (GET). 56 + 1 = 57 |
| HTTP handlers | — | **71** (`tests/contract/catalog.mjs`) |
| After the cut | ~52 | **51** route files stay: drop 4 Discord files, `app/api/setup/status`, and `app/auth/callback` |
| `lib/database.ts` exports | 65 | **65** (functions, consts, types, interfaces) |
| Public tables | 25 | **25** |
| RLS policies still in migrations | 65 | **70** named policies after every migration (62 on `public`, 8 on `storage.objects`). See `authz-matrix.md` |

Ambiguity: the plan's "57 routes" matches 56 API files plus the auth callback. The "65 policies" count is short of the policies that actually survive. PHP should enforce the matrix in `authz-matrix.md`, not the round number.

## Auth on the wire

Two mechanisms exist. A later PHP session cookie replaces both. Until the client is switched (P6), these are the rules:

| Name | How the route checks | Missing credential |
|---|---|---|
| `public` | none | — |
| `bearer-user` | `Authorization: Bearer <access_token>`, `verifyAuthRequest` → `auth.getUser(token)` | 401 `{ error: "Unauthorized" }` |
| `bearer-admin` | bearer, then `accounts.role = 'admin'` | 401 or 403 `{ error: "Forbidden" }` |
| `cookie-user` | Supabase SSR cookies, `createClient().auth.getUser()` | 401 `{ error: "Unauthorized" }` |
| `cookie-admin` | cookie, then `accounts.role = 'admin'` | 401 or 403 |
| `bot-secret` | `Authorization: Bearer <DISCORD_BOT_API_SECRET>` | 401. **Cut** |
| `setup-cookie` | setup wizard cookie | 403 `{ ok: false }`. **Cut** |

A bearer token does not satisfy a cookie route, and a cookie does not satisfy a bearer route. Login returns `access_token` and `refresh_token` in JSON. The browser Supabase client is what turns those into cookies for the cookie routes.

Student ids are 5 digits. School passwords are 7–8 letters or digits. New passwords are at least 8 characters with one letter and one digit. PIN is 6 digits. Validation errors are `{ error: string }` with status 400.

There is no `superadmin` role in the database. `accounts.role` is `user` or `admin`. The whitelist promotes a logged-in email to admin inside `GET /api/auth/session-status`.

Domain: do not hardcode a host. Today the code reads `NEXT_PUBLIC_APP_URL`, then `VERCEL_URL`. PHP reads `APP_URL`.

## Host limits

VisperHost Web Hosting M is DirectAdmin shared hosting: PHP 8.2, Apache or LiteSpeed `.htaccess`, MariaDB, cron from the panel. No SSH, no Node process at runtime, no daemon, no websocket server, no Redis. APCu might be missing. The build (`next build`, `composer install`) happens off the host. The zip that lands in `public_html` is static files plus PHP.

Anything below is a current feature that the host cannot run. The replacement is the plan's, not a new design.

| Current feature | Where | Why the host cannot run it | Replacement |
|---|---|---|---|
| Supabase Realtime (`postgres_changes`) | `lib/database.ts` `createRealtimeSubscription`; also `app/admin/categories`, `logs`, `error-logs` | Needs a websocket to Supabase. No daemon, no websocket server | Poll `GET /api/changes?tables=` for `max(updated_at)`, ETag/304. 20–30s while the tab is visible, 10s on admin logs (PLAN §4) |
| Agent UI stream | `POST /api/agent/chat` → `createFoundUAgentUIStreamResponse` / AI SDK `streamText`. `maxDuration = 60` | SSE holds a PHP worker open and needs a streaming runtime. Shared-host `max_execution_time` is unknown and there is no Node | One JSON body. Client feeds it into `useChat` with a custom transport. UI stays; tokens do not trickle. Feature flag only if the host later allows SSE (PLAN §4.4) |
| Next.js middleware | `middleware.ts`: setup guard + `updateSession` | Edge/Node middleware does not exist on Apache. Static export has no middleware | Delete it (P6). `.htaccess` rewrites `/api/*` to `api/index.php`, redirects, and security headers (PLAN §7.2). Session refresh is a PHP read of the `sessions` row |
| Server Actions | `app/setup/actions.ts`, `lib/setup/create-wizard-admin.ts` (`"use server"`) | No Next server | **Cut** with the wizard. Config is env + seed + `bin/create-admin.php` SQL |
| Edge OG image | `app/blog/[slug]/opengraph-image.tsx` (`runtime = "edge"`, `ImageResponse`) | Edge runtime and `@vercel/og` need Node/edge | P10: a static default image, or one GD image generated in PHP. No per-request edge function |
| `generateMetadata`, `unstable_cache`, `revalidate` | `app/layout.tsx`, blog/help pages, `lib/seo-metadata.ts`, `app/page.tsx` (`revalidate = 60`), `POST /api/revalidate-og` | ISR and `revalidateTag` need a Next server and its cache | Static HTML. Blog/help `<head>` is injected at build or by a PHP front controller for `/blog/*` and `/help/*` (P10). Settings page currently POSTs `/api/revalidate-og`; on PHP that route is a no-op `{ revalidated: true }` until a Cloudflare purge exists. Do not call `revalidateTag` |
| `next/image` optimizer | layouts and item/landing components. `next.config.ts` `images.remotePatterns` points at a hardcoded Supabase host | The optimizer is a Node server | `images.unoptimized: true` (P11). Image URLs are R2 or the public bucket URL from env |
| `next/font` (Kanit) | root layout | Fine only because the build is off-host. The host must not run `next` | Fonts ship inside the static export |
| Node-only upload routes | storage and blog/help upload set `runtime = "nodejs"` and use the AWS SDK | No Node, and `aws-sdk-php` is too heavy for the inode budget | Presigned PUT written by hand, SigV4, about 120 lines (PLAN §4.3) |
| In-memory rate limit and passkey challenges | `lib/student-auth-server.ts` `rateLimitStore`; `lib/passkey-challenge-store.ts`; `app/api/geocode/search/route.ts` `lastRequestAt` | PHP does not share process memory across requests or workers. No Redis | MariaDB `rate_limits` and `login_attempts`. Passkey challenges live in `sessions` for 5 minutes. Geocode limit is a DB or APCu window, not a global variable. If APCu is absent, use MariaDB only (PLAN §7.3) |
| Supabase Auth, RLS, Realtime, Storage, `pg_trgm`, `gen_random_uuid`, `timestamptz`, `jsonb` | migrations and `lib/supabase/*` | Not on MariaDB, and there is no Supabase on this host | PLAN §4.1–4.3: `CHAR(36)`, `JSON`, `DATETIME(3)` UTC, PHP trigram, `sessions`, R2 |
| Discord bot | `discord-bot/index.mjs` | Long-running Node process. No SSH, no daemon | **Cut** |
| Setup wizard + direct `postgres` | `lib/setup/*`, `scripts/*` | Node, and often a direct Postgres URL | **Cut**. Schema is applied in phpMyAdmin, then `bin/migrate.php` from cron or a one-shot panel command |
| `confirm_item_match` / `unmatch_item_match` / fuzzy RPCs | migrations | Postgres functions. MariaDB has no `pg_trgm` | PHP transaction with `SELECT … FOR UPDATE`. Fuzzy search is `LIKE` plus trigram Jaccard in PHP (PLAN §4.1) |
| AI call that runs 5–40s | agent, vision, NER, match `useAI` | Not a daemon, but it occupies one PHP worker and may hit `max_execution_time` | `set_time_limit(60)`, cURL timeout 45s, `AI_MAX_CONCURRENCY` via `ai_slots` or `GET_LOCK` (no Redis). Full queue returns 429 with the Thai message in the plan |
| Cron that is "the client calls the API" | `POST /api/found/expire-overdue`, and `subscribeToFoundItems` triggering a sweep | A browser is not a scheduler | Keep the HTTP route (idempotent, rate limited). Real schedule is DirectAdmin cron: `php ~/foundu/bin/cron.php` every 5 minutes. That is a panel cron, not a daemon |

Client-only things that stay in the browser and do not need the host: Dexie (chat history in IndexedDB), Leaflet, framer-motion, GSAP, `setInterval` on the page, WebAuthn in the browser. Passkey verification itself moves to PHP (`web-auth/webauthn-lib` or `lbuchs/webauthn`).

`GET /api/changes` does not exist yet. It is the polling endpoint P5 adds. It is not part of today's 71 handlers.

## Cut routes

Do not port these.

### Discord (bot secret or cookie)

| Method | Path | Auth | Request | Response |
|---|---|---|---|---|
| GET | `/api/discord/bot/members/:discordUserId` | bot | query `guildId` | member link or 401/403/404 |
| POST | `/api/discord/bot/verification-sessions` | bot | JSON guild + discord user | session payload |
| GET | `/api/discord/bot/verification-sessions` | bot | query `guildId`, `limit` | pending queue |
| POST | `/api/discord/bot/verification-sessions/:sessionId/result` | bot | JSON result | ack |
| POST | `/api/discord/verify` | cookie-user | `{ token }` | `{ verified: true, roleCount }` or 400/403/409 |

Tables: `discord_links`, `discord_verification_sessions`.

### Setup

| Method | Path | Auth | Response |
|---|---|---|---|
| GET | `/api/setup/status` | public | `{ databaseReady, setupCompleted, reason }` |
| POST | `/api/setup/status` | setup-cookie | `{ ok: true }` or 403 `{ ok: false }` |

### Supabase callback

`GET /auth/callback?code=&next=&link=` exchanges an OAuth/magic-link code and redirects. There is no email flow. Drop it. No JSON body.

## Routes to port

Paths stay the same. PHP answers them from `api/index.php`. Status codes and JSON keys below are the current ones.

### Auth

`POST /api/auth/login` public. Body `{ studentId, password }`. 200 `{ access_token, refresh_token, mustChangePassword, mustSetupPin, studentId, nickname, uid }`. 401 `{ error, retryAfterMs?, needsRegistration? }`. 429 when `retryAfterMs` is set. 500 `{ error: "เข้าสู่ระบบไม่สำเร็จ" }`. Tables: `accounts`, Supabase Auth users. Host: tokens become a PHP session cookie; the JSON may keep the same keys with the session id in `access_token` only if the client still expects it. P4 decides the token field once the client stops talking to GoTrue. Do not invent a second login shape.

`POST /api/auth/pin/login` public. Body `{ studentId, pin }`. Same success and 401/429 shape as password login. Table: `accounts.pin_hash`.

`POST /api/auth/pin/setup` bearer-user. Body `{ pin }` (route also accepts the password check used by the server helper). 200 success flag. 401 if the bearer is missing or the password/PIN check fails.

`GET /api/auth/register/lookup?studentId=` public. 400 `{ error: "เลขประจำตัวไม่ถูกต้อง" }`. 429 `{ error: "ลองบ่อยเกินไป กรุณารอสักครู่" }`. 200 one of: `{ found: false, message }`, `{ found: true, alreadyRegistered: true, message }`, `{ found: true, canRegister: true, studentId, firstName, lastName, gradeLevel, roomNumber, registrationToken }`. Disabled accounts look like not found. Table: `accounts`.

`POST /api/auth/register/complete` public. Body `{ studentId, registrationToken, password, pin }`. 200 session-shaped JSON from the server helper. 400 validation.

`POST /api/auth/reset-password` public. Body `{ studentId, schoolPassword, newPassword }`. 200 on success. 401 if the school password does not match. 404 if the account is missing. 429 on the in-memory limiter.

`POST /api/auth/reset-password-with-pin` public. Body `{ studentId, pin, newPassword }`. 200 or 401 `{ error }`.

`POST /api/auth/change-password` bearer-user. Body `{ currentPassword, newPassword }`. 200 `{ success: true }`. 400/404/401 as in the route (Thai messages). Table: `accounts`.

`POST /api/auth/verify-password` bearer-user. Body `{ password }`. 200 on match. 401 `{ error: "รหัสผ่านไม่ถูกต้อง" }`.

`POST /api/auth/verify-pin` bearer-user. Body `{ pin }`. 200 on match. 401 `{ error: "PIN ไม่ถูกต้อง" }`.

`GET /api/auth/session-status` bearer-user. 200 either `{ isAdmin: true, isStudentVerified: true, whitelisted: true }` or `{ isAdmin, isStudentVerified, whitelisted: false, mustChangePassword, mustSetupPin, hasPin, studentId, role, profile }`. `profile` is an `AppUser` from `mapAccountRowToAppUser`. Tables: `accounts`, `admin_whitelist`.

`GET /api/auth/eligibility` bearer-user. 200 `{ eligible: true, studentId }` or 403 `{ error }`.

`GET /api/auth/device-profile?studentId=` public. 200 `{ exists: false }` or `{ exists: true, studentId, nickname, firstName, hasLoggedInOnce, hasPin, quickUnlockAvailable }`. This is an unauthenticated read of student PII. See findings.

Passkey:

| Method | Path | Auth | Body / result |
|---|---|---|---|
| POST | `/api/auth/passkey/login` | public | `{ studentId? }` → `{ options, challengeKey }`. Options are `@simplewebauthn/server` JSON |
| PUT | `/api/auth/passkey/login` | public | `{ challengeKey, response, studentId? }`. After a good WebAuthn check the route still returns **501** `{ error: "การเข้าสู่ระบบด้วย Passkey อยู่ระหว่างปรับปรุงสำหรับ Supabase" }` |
| POST | `/api/auth/passkey/register` | bearer | `{ options, challengeKey }` |
| PUT | `/api/auth/passkey/register` | bearer | `{ challengeKey, response, studentId? }` → `{ success: true }` |
| GET | `/api/auth/passkey/register` | bearer | `{ hasPasskey, count }` |
| DELETE | `/api/auth/passkey/register` | bearer | clears credentials |
| POST | `/api/auth/passkey/sync-profile` | bearer | mirrors credentials onto the account |
| DELETE | `/api/auth/passkey/sync-profile` | bearer | removes them |

Tables: `accounts.passkey_credentials`, `passkey_lookup`. Challenges are an in-memory `Map` (see host table). PHP stores them in `sessions`.

### Admin (bearer unless noted)

`GET /api/admin/whitelist` → `{ totalStudents, loggedInCount, registeredCount, pendingRegistrationCount, disabledCount, whitelist }`. `whitelist` is raw `admin_whitelist` rows.

`POST /api/admin/whitelist` body `{ email, note? }` → `{ success: true, email }`.

`DELETE /api/admin/whitelist?email=` → `{ success: true }`.

`POST /api/admin/students/create` body `{ studentId, password?, firstName, lastName, gradeLevel?, roomNumber?, role? }` with `role` `user|admin` (default `user`) and grade `ม.1`–`ม.6`. 200 `{ success: true, ...result, role }`.

`POST /api/admin/students/import` body `{ csvContent, dryRun? }`. The unused Zod in `lib/validations/admin.ts` says `csv`; the route requires `csvContent`. 200 dry-run `{ dryRun: true, previewCount, rows }` or `{ importBatchId, summary, previewCount }`.

`POST /api/admin/students/reset-account` body `{ studentId }` → `{ success: true }`.

`GET|PATCH /api/admin/ai-credentials` is **cookie-admin**. GET returns `{ provider, openrouterModel, hasGeminiKey, hasOpenrouterKey, configuredAt }` and never the raw key. PATCH body `{ provider?, geminiApiKey?, openrouterApiKey?, openrouterModel? }`. Placeholder bullets are ignored. Keys are encrypted into `system_config`. 200 `{ ok: true, ...same flags }`. Host: wizard crypto (`SETUP_SECRETS_KEY` or the service role key) becomes `sodium_crypto_secretbox` with `APP_KEY`. DB value wins over env (PLAN §4).

`GET /api/admin/agent-logs` cookie-admin. Query `truncated=1`, `sessionId`, `userId`, `limit` (max 200, default 50). 200 `{ logs }`. `DELETE` runs `cleanup_agent_chat_logs` and returns `{ deleted }`.

`GET /api/admin/agent-logs/:id` cookie-admin. 200 `{ log }` or 404 `{ error: "Not found" }`. Table: `agent_chat_logs`.

`POST /api/admin/blog/upload` and `POST /api/admin/help/upload` bearer-admin, multipart file. 400 if missing, over 5MB, or not jpeg/png/webp/gif. 200 `{ publicUrl, path }`. Host: no Node runtime; PHP accepts the upload and stores it on R2 or the local public dir.

### Agent and AI

`POST /api/agent/chat` cookie-user. Body `{ messages, memoryFacts?, sessionId?, clientLocation?, adminLocationBypass? }`. `memoryFacts` are kept only when `userId` matches the caller, then capped by settings. `adminLocationBypass` is honored only for an admin. Success is an **AI SDK UI message stream**, not JSON. Headers include `X-Agent-Stream-Version: 2`, `X-Agent-Provider`, and maybe `X-Chat-Session-Id`. 401 JSON. 429 `{ fallback: true, reason: "rate_limit", message, suggestedRoutes }`. 503 `reason: "provider_error"`. 500 `reason: "unknown"`. `suggestedRoutes` is `/home`, `/tracking`, `/lost`, `/found`. Tables: `app_settings`, `ai_usage`, `agent_chat_logs`, plus the tool queries. **Host:** return one JSON document with the same assistant message the stream would have finished with, plus the fallback object on failure. Do not hold an SSE connection. Cap concurrency at 3.

`GET /api/agent/chat/sync?sessionId=` cookie-user. 400 if `sessionId` is missing. 200 `{ parts: null }` or `{ parts, truncated, createdAt }`. Table: `agent_chat_logs` filtered by the caller's `user_id`. This exists so a client can recover after a stream. With a single JSON response it becomes optional; keep the shape if the client still calls it.

`GET /api/agent/openrouter/endpoints?model=` cookie-admin. 200 `{ modelId, endpoints }`. Missing key is 503 `{ error, modelId, endpoints: [] }`. Upstream failure is 502 with the same empty list.

`GET|POST /api/agent/test-providers` cookie-admin. POST may send `{ settings, provider }`. 200 `{ providers, settingsSource }`. Each provider entry is `{ configured, ok, model?, error? }`. This calls Gemini/OpenRouter and will sit on a PHP worker. Same timeout and concurrency cap as the agent.

`GET /api/ai/models` cookie-admin. 200 `{ models }` from the configured provider.

`GET /api/ner?userId=` public. 400 `{ error: "userId required" }`. 200 the quota object from `getRateLimitQuota`. **No auth.** The `userId` is whoever the client sends.

`POST /api/ner` public. Body `{ text, type: "lost"|"found", userId? }`. If `userId` is omitted, the rate limit is skipped. 200 `{ item, description, location, time, contact, contactType, category, remark, target }`. 429 `{ error: "rate_limit_exceeded", reason, message, userRemainingMinute, userRemainingHour, systemRemainingMinute, systemRemainingHour, resetMinute, resetHour }`. 500 `{ error: "Failed to extract data from text" }` or `"Internal server error"`. **Host:** require a session, ignore a client-supplied user id, and count the call against that session. That is an authz fix recorded in findings, not a silent shape change: the success body stays the NER object.

`GET /api/vision?userId=` public. Same quota hole as NER.

`POST /api/vision` public. Body `{ imageDataUrl? , imageBase64?, mimeType?, userId?, testMode? }`. 400 if the image is missing. `testMode: true` skips the rate limit when `userId` belongs to an admin, without proving the caller is that admin. 200 `{ data }` where `data` is `{ itemName, category, color, brand, details, confidence }`. Admin test mode adds `formMapping`, `debug`, `meta`, and `quota`. 429 same quota object as NER. **Host:** same session rule as NER. Image bytes travel in the JSON body; keep the body cap in mind (plan says 64KB for AI, which is smaller than a photo — P8 must allow the image and still reject huge JSON).

### Match

`POST /api/match` public (auth is read and ignored). Body `{ type: "lost"|"found", itemId, useAI? }`. 200 `{ matches, total, useAI }`. Each match is `serializeMatchForJson`: lost item, found item, `score`, `reasons`, `confidence` (`high|medium|low`), `scorePercentage`, `key`. 404 `{ error: "Item not found" }`. Also runs the overdue sweep first. Tables: `lost_items`, `found_items`, `match_dismissals`.

`GET /api/match/batch?useAI=true` and `POST /api/match/batch` bearer-admin. POST body `{ useAI?, includeHistory? }` (history defaults on). 200 `{ matches, total, pool, useAI, history }`. `pool` is `{ lost, found, highConfidence }` (counts). History items are `{ key, lostItem, foundItem, matchedAt }`. GET always includes history.

`POST /api/match/confirm` bearer-admin. Body `{ lostId, foundId }`. 200 `{ ok: true, lostId, foundId, lostStatus: "found", foundStatus: "found" }`. 409 `{ error }` from the RPC (`lost_not_found`, `found_not_found`, `lost_not_matchable`, `found_not_matchable`). Table writes go through `confirm_item_match`. **Host:** PHP transaction, `FOR UPDATE`. Do not expose a DEFINER function to every logged-in user (see findings).

`POST /api/match/unmatch` bearer-admin. Same body. 200 `{ ok: true, lostId, foundId, lostStatus: "searching", foundStatus: "found" }`. 409 `{ error: "not_linked" }` and the not-found errors.

`POST /api/match/reject` bearer-admin. Body `{ lostId, foundId }`. 200 `{ ok: true, lostId, foundId }`. Writes `match_dismissals`.

### NFC

`GET /api/nfc/resolve?tag=` public. 400 `{ error: "tag parameter required" }`. 404 `{ error: "tag_not_found" }`. 200 `{ tag: { tagId, itemName, category, description, status, isLost }, isOwner, ownerId? }`. `ownerId` is added only when the bearer (optional here) matches the owner. Contacts are not in this payload.

`GET /api/nfc/my-tags` bearer-user. 200 `{ tags, reports }` camelCase as built in `getOwnerNfcDashboardAdmin`.

`POST /api/nfc/register` bearer-user. Body `{ itemName, category, description?, contacts[], tagUid?, readOnlyLocked? }`. 200 `{ tagId, tagUrl }`. 409 tag uid taken. 403 `{ error: "nfc_disabled", message }` when settings turn NFC off.

`POST /api/nfc/found` bearer-user. The route comment says anonymous reports were removed. Body `{ tagId, finderMessage, locationFound?, locationCoords?, finderContacts? }`. 200 `{ reportId, success: true }`. 404 unknown tag. 403 disabled tag. 429 `{ error: "rate_limit_exceeded", message }`. The plan's Turnstile-for-anonymous-NFC line does not match this route. Keep login required. Turnstile still goes on login and register (owner decision).

`PATCH /api/nfc/tags/:id` bearer-user (owner or admin). Body is `updateNfcTagSchema` (status, lostItemId, itemName, description, category, contacts, ndefWritten). Never `ownerId`. 200 `{ success: true }`.

`PATCH /api/nfc/reports/:id` bearer-user (owner or admin). Body `{ status: "viewed"|"resolved" }`. 200 `{ ok: true }`.

### Storage, profile, public, cron, geocode

`POST /api/storage/upload` cookie-user. Multipart `file` + `path` (max 10MB), or JSON presign `{ path, contentType, ... }` from `presignUploadSchema`. `buildAuthorizedPath` allows only `avatars/{userId}/…` (rewritten to `avatars/{userId}/{timestamp}.jpg`, and the id must be the caller) or `found-items/{itemId}/…` (rewritten to `found-items/{itemId}/{timestamp}.jpg`). Anything else, or `..`, is 403. 200 `{ uploadUrl?, publicUrl, path, backend }` where `backend` is `r2` or the Supabase bucket. 400 if presign is requested without R2. **Host:** presign in PHP. No Supabase Storage fallback once Supabase is gone; R2 only. Keep the same prefix rules.

`POST /api/storage/delete` cookie-user. Body `{ path }` or `{ url }`. 200 `{ success: true }`. Owner or admin.

`PATCH /api/user/profile` bearer-user. Body `{ shownName? }` max 40. 200 `{ ok: true, shownName }`. Column `accounts.shown_name`.

`GET /api/public-settings` public. 200 `{ comingSoonEnabled, comingSoonMessage }`. On failure the fallback is `{ comingSoonEnabled: false, comingSoonMessage: "พบกันเร็วๆนี้" }`. `Cache-Control` today is Next `revalidate = 60`. **Host:** `Cache-Control: public, s-maxage=60` plus ETag (PLAN §6).

`GET /api/public-images?folder=` public. `folder` is `img` or `img/mobile_responsive`. 200 `{ images: [{ fileName, label, url, width, height }] }`. Reads the `public/` directory with Node `fs`. **Host:** those files are static. The route can read the directory in PHP or the client can use a manifest written at build time. Do not shell out.

`POST /api/revalidate-og` public, no auth. 200 `{ revalidated: true }`. Called from the admin settings page. **Host:** no-op with the same JSON. Purging Cloudflare is a deploy step, not this request.

`POST /api/found/expire-overdue` public, no auth. 200 `{ expired: number }` or 500 `{ error: "Failed to expire overdue items" }`. **Host:** keep it, add a rate limit, and also run it from panel cron.

`GET /api/geocode/search?q=` cookie-admin. Short queries return `{ results: [] }`. 200 `{ results: [{ id, label, lat, lng }] }`. 429 `{ error: "Too many requests. Please wait a moment." }`. 502 if Nominatim fails. The limiter is one timestamp for the whole process. **Host:** per-IP or per-admin DB limit, cache results, country code `th` stays.

## `lib/database.ts` exports

All 65. The browser calls these with the anon key and the user JWT, so RLS applies. PHP keeps the signature and implements the body with `apiFetch`. Realtime subscribers become pollers. They are not portable as written (host table above).

`COLLECTIONS` maps: `LOST_ITEMS` lost_items, `FOUND_ITEMS` found_items, `USERS` **accounts** (not `profiles`), `SETTINGS` app_settings, `AI_USAGE` ai_usage, `ERROR_LOGS` error_logs, `NFC_TAGS` nfc_tags, `NFC_FOUND_REPORTS` nfc_found_reports. Settings row id is `"default"`.

| Export | Signature (short) | Table / behavior |
|---|---|---|
| `COLLECTIONS` | const | names above |
| `mapAccountRowToAppUser` | `(row: AccountRow) => AppUser` | pure |
| `coerceAppSettings` | `(blob) => AppSettings` | pure |
| `createOrUpdateUser` | `({ uid, email, displayName, photoURL? }) => AppUser` | accounts select/update/insert |
| `getUser` | `(uid) => AppUser \| null` | accounts where `id` or `linked_uid` |
| `updateUserRole` | `(uid, role) => void` | accounts.role |
| `getAllUsers` | `() => AppUser[]` | accounts, newest first |
| `subscribeToUser` | `(uid, cb, onError?) => unsubscribe` | realtime + `getUser` |
| `updateUserTutorialSeen` | `(uid) => void` | accounts.has_seen_tutorial |
| `banUser` | `(uid, reason, bannedBy) => void` | accounts ban columns |
| `unbanUser` | `(uid) => void` | clears ban |
| `timeoutUser` | `(uid, durationMinutes, reason, bannedBy) => void` | ban_status timeout |
| `isUserBanned` | `(user) => boolean` | pure |
| `getTimeoutRemaining` | `(user) => minutes` | pure |
| `getAppSettings` | `() => AppSettings` | app_settings id=default; on error returns defaults |
| `AppSettingsLoadResult` | type `{ settings, loadError? }` | — |
| `getAppSettingsWithMeta` | `() => AppSettingsLoadResult` | same row, surfaces the error |
| `updateAppSettings` | `(partial, updatedBy) => void` | upsert id=default, merges JSON |
| `subscribeToAppSettings` | `(cb) => unsubscribe` | realtime; no env → defaults |
| `addLostItem` | `(data) => id` | lost_items insert, `createLostItemSchema` |
| `getLostItem` | `(id) => LostItem \| null` | lost_items |
| `getLostItemByTrackingCode` | `(code) => LostItem \| null` | uppercased tracking_code |
| `getLostItems` | `(constraints?) => LostItem[]` | lost_items, caller-supplied filters |
| `getLostItemsByStudentId` | `(studentId) => LostItem[]` | lost_items.student_id |
| `getLostItemsByUserId` | `(userId) => LostItem[]` | lost_items.user_id |
| `subscribeToLostItemsByUserId` | `(userId, cb) => unsubscribe` | realtime |
| `subscribeToFoundItemsByUserId` | `(userId, cb) => unsubscribe` | realtime + found_items |
| `getLatestLostItems` | `(count=5) => LostItem[]` | status searching |
| `updateLostItem` | `(id, partial) => void` | lost_items. RLS allows this only for admin |
| `deleteLostItem` | `(id) => void` | lost_items. admin RLS |
| `addFoundItem` | `(data) => id` | found_items, `createFoundItemSchema` |
| `getFoundItem` | `(id) => FoundItem \| null` | found_items |
| `getFoundItems` | `(constraints?) => FoundItem[]` | found_items |
| `getLatestFoundItems` | `(count=5) => FoundItem[]` | status found or claimed |
| `updateFoundItem` | `(id, partial) => void` | found_items. admin RLS |
| `confirmFoundItemRoomHandover` | `(id, { uid, displayName?, email? }) => void` | sets status found and handover columns |
| `deleteFoundItem` | `(id) => void` | found_items. admin RLS |
| `getStats` | `() => { searching, found, claimed, pendingRoomConfirm }` | reads every lost and found status |
| `subscribeToLostItems` | `(cb) => unsubscribe` | realtime, full list |
| `subscribeToFoundItems` | `(cb) => unsubscribe` | realtime, and in the browser also POSTs expire-overdue |
| `timestampToDate` | `(value) => Date` | pure |
| `CategoryConfig` | interface | id, value, label, icon, order |
| `LocationConfig` | interface | id, value, label, order |
| `ContactTypeConfig` | interface | id, value, label, icon, placeholder, order |
| `getCategories` | `() => CategoryConfig[]` | categories; falls back to 9 hardcoded Thai categories |
| `getLocations` | `() => LocationConfig[]` | locations, else drop_off_locations, else 6 defaults |
| `getContactTypes` | `() => ContactTypeConfig[]` | contact_types, else 5 defaults |
| `subscribeToCategories` | `(cb) => unsubscribe` | realtime |
| `subscribeToLocations` | `(cb) => unsubscribe` | realtime |
| `subscribeToContactTypes` | `(cb) => unsubscribe` | realtime |
| `AIRateLimitResult` | interface | allowed, remainingMinute/Hour, resetMinute/Hour, message? |
| `subscribeToAIUsage` | `(cb) => unsubscribe` | ai_usage last 30 days, limit 1000 |
| `getAIUsageStats` | `() => { total, today, thisWeek, byEndpoint, byUser }` | ai_usage since 7 days. `total` is the week count |
| `recordAIUsage` | `(userId, endpoint="ner") => void` | ai_usage insert |
| `checkAIRateLimit` | `(userId, settings) => AIRateLimitResult` | counts ai_usage. Defaults 5/min and 30/hour |
| `cleanupOldAIUsage` | `() => number` | deletes ai_usage older than 2 hours, max 500. No DELETE grant/policy for `authenticated` |
| `getNfcTagById` | `(tagId) => NfcTag \| null` | nfc_tags, id uppercased |
| `getNfcTagsByOwnerId` | `(ownerId) => NfcTag[]` | nfc_tags |
| `subscribeToNfcTagsByOwnerId` | `(ownerId, cb) => unsubscribe` | realtime |
| `updateNfcTag` | `(tagId, partial) => void` | nfc_tags. Does not write `owner_id` |
| `createNfcFoundReport` | `(data) => id` | nfc_found_reports |
| `getNfcFoundReportsByTagId` | `(tagId) => NfcFoundReport[]` | nfc_found_reports |
| `subscribeToNfcFoundReportsByOwnerId` | `(ownerId, cb) => unsubscribe` | realtime |
| `updateNfcFoundReport` | `(reportId, { status? }) => void` | nfc_found_reports |
| `getAllNfcTags` | `(limit=200) => NfcTag[]` | nfc_tags |

Item and user objects use camelCase. Dates are `Date` in the client and ISO strings on the wire. PHP responses that stand in for these reads should use the camelCase fields the pages already read, with timestamps as ISO `…Z`.

`getStats` pulls every status into the browser. On PHP, count in SQL. Same numbers.

## What this contract does not change

Turnstile is not on any current route. The owner wants it on login and register (managed). That is new UI in P4/P11, not a change to these JSON bodies.

The agent stream is the one deliberate response-type change, and only because the host cannot stream. Documented above.
