# Free-tier optimization

Found-U is designed to run on free infrastructure: Vercel Hobby, a Supabase Free project, optional Cloudflare R2, and free Gemini / OpenRouter models. Those plans fail in a few specific ways:

| Resource | Typical free ceiling | What happens when it is exceeded |
| --- | --- | --- |
| Supabase database | about 500 MB | Writes start failing. Chat logs, usage rows, and item photos stored in Postgres-backed storage all compete for this. |
| Supabase Realtime | about 200 concurrent connections | Extra students stop receiving live updates. Channels are often billed per subscription, not per browser. |
| Supabase egress | about 5 GB / month | Full-table `select("*")` refetches and public item reads burn this quickly. |
| Supabase Storage | about 1 GB if R2 is not configured | Item and blog images fill the project. The project can also pause after about a week with no API traffic. |
| Vercel functions | invocation count plus active CPU time; Hobby duration is short (historically 10s, now often capped near 60s) | Agent and vision routes time out. The user retries and the model is called again. |
| Gemini / OpenRouter free | low requests per minute and per day; experimental `:free` models disappear | Vision, NER, matching, and the assistant all stop together. |
| Vercel Image Optimization | a small monthly transform quota on Hobby | Optimized landing images start failing or get billed. |

The findings below are ordered by how fast they exhaust those ceilings. Line numbers refer to the tree reviewed on 25 September 2026.

---

## Summary

| ID | Severity | Quota | Fix in one line |
| --- | --- | --- | --- |
| OPT-01 | High | Realtime connections | One shared channel for config tables, not one per student |
| OPT-02 | High | Egress + Realtime | Admin item listeners refetch every row on every change |
| OPT-03 | High | Vercel invocations | Discord bot polls every 8 seconds, all day |
| OPT-04 | High | Database size | Every agent turn stores the full prompt and settings |
| OPT-05 | High | Database CPU | AI rate limit is four counts plus an insert, even when disabled |
| OPT-06 | High | Function time + Auth | Setup cookie lasts 60 seconds, then middleware hits the database |
| OPT-07 | High | Storage growth | Handover expiry has no schedule; `autoDeleteDays` is unused |
| OPT-08 | High | Gemini quota | Vision and NER accept anonymous, uncompressed images |
| OPT-09 | High | Function duration + tokens | Agent asks for 60s, 4096 output tokens, and a second synthesis call |
| OPT-10 | High | Gemini quota | Batch matching is up to five model calls per lost item |
| OPT-11 | Medium | Invocations | Public blog and help pages are `force-dynamic` and load Shiki / Video.js |
| OPT-12 | Medium | Database size | Activity and error logs never expire |
| OPT-13 | Medium | Cold-start time | Instrumentation hydrates the database on every Node cold start |
| OPT-14 | Medium | Auth requests | `getUser()` runs on almost every request, including public pages |
| OPT-15 | Medium | Storage + bandwidth | Upload API allows 10 MB; vision sends the original data URL |
| OPT-16 | Medium | Image optimization | `remotePatterns` is pinned to one Supabase host |
| OPT-17 | Medium | Database size + CPU | Eight trigram GIN indexes, plus `ILIKE '%q%'` that cannot use btree |
| OPT-18 | Medium | Egress | Admin user and export queries are unbounded `select("*")` |

---

## OPT-01 — Every logged-in student holds several full-table realtime channels

**Severity:** high  
**Quota:** Supabase Realtime concurrent connections (free plan is on the order of 200).

**What happens.** After login, the app shell opens a live subscription for categories, locations, and contact types. Auth opens two more (the current user row and app settings). Home and NFC pages add lost items, found items, and sometimes contact types again. A single student session is often five to eight channels. About twenty-five students online at once can saturate the free project, after which live updates stop for everyone.

**Root cause.** `DataProvider` wraps the whole signed-in app and subscribes as soon as `user.id` exists, even on pages that only need the default category list. `createRealtimeSubscription` names each channel with `Math.random()`, so a remount cannot reuse a channel and always opens a new one. The listener is `event: "*"`, and on `SUBSCRIBED` it immediately runs a full `select("*")`. Config tables have no row filter.

**Evidence.**

- `contexts/DataContext.tsx` lines 70–109 subscribe to categories, locations, and contact types for every signed-in user.
- `lib/database.ts` lines 292–322 build `channelName` as `` `${table}-${random}` `` and refetch on subscribe and on every change.
- `contexts/auth-context.tsx` lines 446–484 add `subscribeToUser` and `subscribeToAppSettings`.
- `components/providers/full-app-providers.tsx` mounts `DataProvider` for the full app.

**Fix.** Fetch categories, locations, and contact types once and cache them for several minutes (or serve them from a route with `revalidate`). Keep realtime only for the signed-in user's own row and for admin queues that truly need it. Use a stable channel name per table. Do not refetch the whole table when the change payload already contains the row.

---

## OPT-02 — Admin screens refetch every lost and found row on each change

**Severity:** high  
**Quota:** Realtime connections, Postgres CPU, egress.

**What happens.** Opening the admin dashboard, items, matching, or moderation page subscribes to the entire `lost_items` and `found_items` tables. Any insert or status change downloads every column of every row again, including contacts and image URLs. Subscribing to found items also fires the handover-expiry HTTP call.

**Root cause.** `subscribeToLostItems` / `subscribeToFoundItems` have no filter. Their callback calls `getLostItems()` / `getFoundItems()`, which are `select("*")` with no limit (`lib/database.ts` around lines 697 and 858). The expiry sweep is tied to the subscription itself (lines 993–997), so every admin listener becomes a writer.

**Fix.** Paginate (50–100 rows) and select only the columns the table renders. Filter by status. Apply the realtime payload instead of reloading the table. Move expiry to a scheduled job (OPT-07) so opening the admin page is read-only.

---

## OPT-03 — The Discord bot calls Vercel every 8 seconds

**Severity:** high  
**Quota:** Vercel function invocations and duration. About 10,800 requests per day, roughly 324,000 per month, from the bot alone.

**What happens.** The bot process polls `GET /api/discord/bot/verification-sessions` on a timer for as long as it is running. Each poll updates expired sessions and then selects verified ones. Middleware still runs, so each poll also calls Supabase Auth.

**Root cause.** Role sync is pull-based. `DISCORD_SYNC_INTERVAL_MS` defaults to 8000 and the allowed range starts at 5 seconds (`discord-bot/index.mjs` lines 52–56 and the `setInterval` near line 210). There is no idle backoff. The route expires pending rows on every read (`app/api/discord/bot/verification-sessions/route.ts`).

**Fix.** Poll every 30–60 seconds, and skip the HTTP call when the bot has no pending verifications. Prefer notifying the bot when a student finishes `/discord/verify` (a single signed POST) instead of polling. Skip the expire `UPDATE` when no pending rows exist. Exclude this path from the session middleware (OPT-14).

---

## OPT-04 — Every assistant turn writes a full transcript into Postgres

**Severity:** high  
**Quota:** Supabase database size (500 MB). IndexedDB on the phone does not count; this server copy does.

**What happens.** When an agent stream ends, the server inserts one `agent_chat_logs` row containing the pruned request messages, the response parts, the step log, routing metadata, and a snapshot of all app settings (including map polygons and model config). A few hundred chats with images or long threads can dominate the free database. Cleanup exists but nothing calls it unless an admin sends `DELETE` to the logs API. There is no `vercel.json` cron in this repository.

**Root cause.** Debug logging was implemented as “store the whole turn” (`lib/agent/agent-chat-log.ts` lines 4–22, called from `lib/agent/agent-ui-stream.ts` around lines 139–154). `cleanupAgentChatLogsOlderThan` is only wired to the admin route. The client already keeps history in Dexie (`lib/chat/storage/db.ts`), so the server copy is duplicate.

**Fix.** Persist a small row: user id, session id, provider, model, duration, token counts, finish reason. Drop `settings_snapshot` and the full message arrays, or keep them for a sampled 1-in-N debug session. Delete rows older than 24–48 hours from a cron with a shared secret.

---

## OPT-05 — Rate limiting scans `ai_usage` four times and never deletes it

**Severity:** high  
**Quota:** Database size and CPU on every vision, NER, and agent call.

**What happens.** Each AI request runs four exact counts (user/minute, user/hour, system/minute, system/hour) and then inserts a row. If rate limiting is turned off in settings, the function still inserts a row and returns (`lib/ai-rate-limit.ts` lines 30–44 and 51–70). Nothing purges `ai_usage`. Admin usage screens also subscribe to the table and reload up to 30 days of rows.

**Root cause.** The limiter is an append-only log plus read-time aggregation, not a counter. The only index is `(user_id, created_at)`, so the two system-wide counts cannot use it and scan by time. The check and the insert are not one transaction, so two parallel requests can both pass (BUG-12 in the other report) and also double the write.

**Fix.** One SQL function that checks and inserts in a single statement. Add an index on `created_at`. Do not insert when `aiRateLimitEnabled` is false. Delete rows older than two days on the same cron as OPT-04. Drop the realtime subscription on `ai_usage`; load stats when an admin opens the usage page.

---

## OPT-06 — The “setup is done” cookie expires after 60 seconds

**Severity:** high  
**Quota:** Vercel middleware CPU and Supabase reads on almost every navigation.

**What happens.** After setup, middleware trusts a signed cookie named `fu_setup_ok`. Its lifetime is 60 seconds (`lib/setup/constants.ts` line 6). When the cookie is missing, `enforceSetupGuard` reads `system_config` and often checks whether an admin account exists. `updateSession` then calls `auth.getUser()` as well. A student who clicks around the app re-pays that database round trip every minute.

**Root cause.** The cookie was given a short TTL so a finished wizard would be noticed quickly. That is the wrong default once `is_completed` is true: setup completion almost never flips back, and the failure path that does flip it is itself a bug (BUG-03).

**Fix.** After setup is complete, set the cookie for days, not a minute. Skip the admin-exists probe entirely when the cookie is valid. Combine this with OPT-14 so public pages do not call Auth at all.

---

## OPT-07 — Found-item expiry is not scheduled, and auto-delete is dead code

**Severity:** high  
**Quota:** Database and storage growth if nobody visits; extra function calls if they do.

**What happens.** Found items are supposed to leave `pending_room_confirm` after a handover deadline. The only triggers are a public `POST /api/found/expire-overdue`, a debounced fetch from the found-item page, and every `subscribeToFoundItems` listener. If the school is quiet for a week, nothing expires, rows and images stay, and a paused free project is more likely. The settings field `autoDeleteDays` (default 30 in `lib/types.ts` line 165) is editable in the admin UI and is not read by any server job.

**Root cause.** There is no `vercel.json` cron. Expiry was attached to user traffic so a free deploy would not need a scheduler. That couples correctness to “someone has the page open” and leaves the route unauthenticated (BUG-08).

**Fix.** Add a Vercel cron (every 15–30 minutes is enough) that calls the route with a secret header. Reject the POST without that secret. Replace the per-row updates with one `UPDATE ... WHERE deadline < now()`. Either implement `autoDeleteDays` in that job or remove the setting so admins are not told photos will disappear.

---

## OPT-08 — Vision and NER are anonymous and send large images

**Severity:** high  
**Quota:** Gemini free requests and Vercel bandwidth / duration.

**What happens.** `POST /api/vision` and `POST /api/ner` do not read the session. They rate-limit only when the body or query contains a `userId`. Omitting `userId` skips the limiter and still calls the model. `GET /api/vision?userId=` runs the four-count quota query with no auth. The found-item page polls that GET every 30 seconds while vision mode is open (`app/(app)/found/page.tsx` around lines 223–239) and posts the original data URL, which can be several megabytes after base64.

**Root cause.** The client is trusted to name the user. Compression exists for the found-item upload path (`lib/storage.ts`) but the vision call uses the raw data URL. Default vision, NER, and matching models are `gemini-1.5-flash` (`lib/types.ts` lines 122–130), an older model with a tighter free quota than current Flash-Lite.

**Fix.** Require `supabase.auth.getUser()` and use that id for the rate limit. Reject bodies over a few hundred kilobytes. Resize to about 1024 px and compress before the model call. Return the remaining quota on the POST response and delete the 30-second poll. Default the three models to the current free Flash-Lite (or whatever the Gemini free tier documents at deploy time).

---

## OPT-09 — The agent is configured for a long, expensive turn

**Severity:** high  
**Quota:** Vercel function duration and model tokens. A timeout causes a retry, so the tokens are spent twice.

**What happens.** `app/api/agent/chat/route.ts` line 30 sets `maxDuration = 60`, which asks for the full Hobby function window. Defaults are 4 steps and 2048 output tokens, but `normalizeAgentSettings` treats `agentProvider: "auto"` as an OpenRouter path and raises the floor to **4096** output tokens (`lib/agent/normalize-agent-settings.ts` lines 12–47). The system prompt concatenates identity, scope, tools, grounding, privacy, extraction, format, and examples. After the first tool call, `prepareStep` disables tools and asks for a full Thai synthesis (`lib/agent/create-agent.ts` lines 50–68). If that synthesis is cut off, `agent-ui-stream.ts` calls `generateText` again with the conversation.

**Root cause.** Auto mode was patched so OpenRouter free models would not stop mid-sentence. The patch rewrites the provider to `"openrouter"` and lifts the token cap for every auto deployment, including schools that intended Gemini-first. Fallback does not actually retry a failed stream: `withProviderFallback` returns as soon as the `Response` object is built, before the model body is read (`lib/agent/provider-router.ts` lines 120–145). A 429 from OpenRouter is therefore shown to the student, Gemini is not tried, and the failed call still consumed quota.

**Fix.** Leave `agentProvider: "auto"` as Gemini first, OpenRouter second. Apply the 4096-token floor only when the selected provider is OpenRouter. Default to 2 tool steps and 512–1024 output tokens on Hobby. Cap the recovery call at a few hundred tokens and send a summary, not the full history. Retry the fallback provider only if the first request fails before any token is streamed.

---

## OPT-10 — “Review queue with AI” is five Gemini calls per lost item

**Severity:** high  
**Quota:** Gemini free tier and function duration. Eighty open lost items can mean up to 400 model calls in one admin refresh.

**What happens.** `suggestAll({ useAI: true })` loads every matchable lost item and, for each one, asks the model to compare the top five heuristic candidates (`lib/match-service.ts` around lines 206–209, `lib/matching.ts` lines 653–667, concurrency 3). The admin matching page can send `useAI: true`. The agent tool `findMatches` can also set `useAI: true` inside an already expensive chat turn.

**Root cause.** AI matching was added as a pairwise rerank with a local cap of five, and no global cap across the queue. A failed or negative model answer also drops the heuristic match (BUG-07), so a quota error both spends the remaining free calls and empties the queue.

**Fix.** Keep the default path heuristic-only. If an admin explicitly reranks, cap the whole request (for example 10 model calls) or send one prompt that scores a short candidate list. Hard-code `useAI: false` inside the agent tool.

---

## OPT-11 — Blog and help are rendered dynamically and pull heavy libraries

**Severity:** medium  
**Quota:** Vercel invocations and client bandwidth. These pages are public and are the ones most likely to be shared.

**What happens.** `app/blog/page.tsx`, `app/blog/[slug]/page.tsx`, `app/help/page.tsx`, and `app/help/[slug]/page.tsx` set `dynamic = "force-dynamic"`, so they are not cached. Each article run highlights code with Shiki (many languages, two themes) on the server. `components/blog/article-content.tsx` statically imports `ArticleVideo`, which imports `video.js` and its CSS, so readers download the video player even when the article has no video.

**Root cause.** CMS pages were marked dynamic to avoid a stale cache after publish. Highlighting and the video player were imported at the top level for simplicity.

**Fix.** Use `revalidate` of several minutes and call `revalidateTag` when an admin publishes. Store highlighted HTML at save time. Dynamically import the video player only when a video block exists.

---

## OPT-12 — Activity and error logs grow without a retention policy

**Severity:** medium  
**Quota:** Database size. Stack traces and user agents are large text.

**What happens.** `lib/logger.ts` only inserts. Admin log pages `select("*")` (limits 200 and 500) and subscribe to the tables, so every new log row triggers another read. Students can also insert arbitrary activity rows because the insert policy is `WITH CHECK (true)` (see BUG-14).

**Fix.** Delete logs older than 7–14 days in the same cron as OPT-04. Stop subscribing; add a refresh button. Do not log page views. Truncate `stack` before insert.

---

## OPT-13 — Cold starts open a direct Postgres connection to “make sure the database is ready”

**Severity:** medium  
**Quota:** Function duration and database connections. Hobby instances cold-start often.

**What happens.** `instrumentation.ts` calls `ensureDatabaseReady()` on every Node.js runtime start. That path takes an advisory lock and may run account, CMS, and storage-bucket checks. The in-memory skip lasts about 30 seconds and is per instance, so each new isolate pays it again.

**Root cause.** First-boot hydration was placed on the server boot path so a new school would not have to run `db:push`. After the first successful setup, that work is repeated forever.

**Fix.** Hydrate only when `SETUP_HYDRATE_ON_BOOT=1` or when `system_config` says the database is not ready. After setup, never open `POSTGRES_URL_NON_POOLING` from a request or a cold start.

---

## OPT-14 — Middleware calls Supabase Auth on public pages

**Severity:** medium  
**Quota:** Auth requests and middleware CPU.

**What happens.** `middleware.ts` matches every path except static files. `updateSession` always calls `supabase.auth.getUser()` (`lib/supabase/middleware.ts` lines 35–37). The landing page, blog, help, and the Discord poll all pay for a session lookup.

**Fix.** Run `updateSession` only for protected prefixes (`/home`, `/admin`, `/assistant`, authenticated APIs, and so on). Leave `/`, `/blog`, `/help`, and the bot poll on the anon path.

---

## OPT-15 — Upload and vision limits do not match the compression settings

**Severity:** medium  
**Quota:** Supabase Storage (1 GB) when R2 is absent; Vercel request body size; R2 Class A operations when R2 is present.

**What happens.** Settings tell the UI to accept 5 MB and compress to about 0.5 MB / 1024 px. `app/api/storage/upload/route.ts` still accepts about 10 MB. Vision posts the uncompressed data URL (OPT-08). New schools without `R2_*` store item images in Supabase Storage, which counts against the 1 GB cap and against egress when images are public.

**Fix.** Reject uploads larger than the compressed target (about 1 MB). Compress before vision and before upload. For a free school deploy, prefer R2 for item images: the free R2 tier has no egress fee, which matters more than Supabase Storage once photos accumulate. Keep Supabase Storage only for the small branding bucket if that split is simpler.

---

## OPT-16 — Image optimization is pinned to one Supabase project

**Severity:** medium  
**Quota:** Vercel Image Optimization, and broken images on any other school.

**What happens.** `next.config.ts` lines 4–11 allow `next/image` only for `qfqptklywqbvpjjbmswy.supabase.co`. A new school's storage host is rejected by the optimizer. Landing images under `public/img` are optimized (the first ones use `priority`), which spends the Hobby transform quota. Item thumbnails already set `unoptimized`, which avoids that quota and spends bandwidth instead.

**Fix.** Build `remotePatterns` from `NEXT_PUBLIC_SUPABASE_URL` and, when set, `R2_PUBLIC_BASE_URL`. Keep item photos `unoptimized` (or serve them from R2). For the landing gallery, either commit pre-sized files and use `unoptimized`, or optimize only the first hero image.

---

## OPT-17 — Fuzzy search maintains eight GIN indexes and still sequential-scans

**Severity:** medium  
**Quota:** Database size (GIN indexes are large relative to 500 MB) and CPU on every search.

**What happens.** Migrations `20260705125122_agent_search_indexes.sql` and `20260705125243_trgm_fuzzy_search.sql` create trigram GIN indexes on name, description, location, and tracking code for both item tables. Every report updates all of them. The query path still uses `ILIKE '%query%'` (`lib/search/ilike-search.ts`), which cannot use a btree index, and `similarity() >= threshold OR col % query`. The default similarity threshold is `0.15` (`lib/types.ts`), which scores a large share of rows. This is cheap at tens of items and expensive once a school has thousands.

**Fix.** Keep one GIN index on item name (or on a single `search_text` column) per table. Look up tracking codes with an equality or prefix match. Raise the agent threshold toward `0.3`. Drop the duplicate btree on `tracking_code` if the initial schema already has one.

---

## OPT-18 — Admin lists and CSV export download full tables

**Severity:** medium  
**Quota:** Egress. PostgREST also caps a response (often 1000 rows), so the export can be silently incomplete as well as expensive.

**What happens.** `getAllUsers()` is `select("*")` with no limit (`lib/database.ts` around lines 408–415) and is used by the users page, settings, and AI usage. Settings export selects every column of `lost_items` and `found_items` in the browser (`app/admin/settings/page.tsx` around lines 149–150).

**Fix.** Select the columns the screen shows and paginate. Stream an admin-only export from a route instead of loading both tables into the client.

---

## Smaller items

These are real but will not be what exhausts a free project first.

| Item | Why it still costs something | Change |
| --- | --- | --- |
| Geocode proxy uses `revalidate: 0` (`app/api/geocode/search/route.ts` line 83) | Identical admin searches hit Nominatim every time. The in-memory 1 request/second guard does not hold across Vercel instances, so the school IP can get blocked. | Cache `q` for a day. |
| `app/layout.tsx` loads Kanit at weights 300–700 | Extra font bytes on every page. | Ship 400 and 600. |
| `app/banned/page.tsx` reloads the document every 60 seconds | One full middleware + Auth round trip per banned user per minute. | Countdown locally; check once at the end. |
| `force-dynamic` on `"use client"` NFC and admin pages | Does not cache anything useful and does not by itself create a server render. The cost is the realtime subscriptions, not the export. | Remove the flag on client pages. |
| Landing revalidation reads every hero file from disk (`lib/landing-public-data.ts`) | Each 60-second revalidate `readFile`s images to measure them. | Commit a small JSON manifest of filename, width, and height. |
| Duplicate contact-type subscription on `app/nfc/found/page.tsx` | One extra realtime connection on top of `DataProvider`. | Read contact types from context. |

---

## Suggested order

1. OPT-04 and OPT-05 — stop unbounded writes. This is the difference between staying under 500 MB and not.
2. OPT-01 and OPT-02 — cut realtime channels before a class of students opens the app together.
3. OPT-08, OPT-09, and OPT-10 — protect the free model quota. Do these together with the auth fixes in the bug report, because the same routes are also unauthenticated.
4. OPT-03 and OPT-07 — replace always-on polling and “expire when someone visits” with rare scheduled work.
5. OPT-06, OPT-13, and OPT-14 — shrink middleware and cold-start work once the data path is stable.
6. OPT-11, OPT-15, OPT-16, OPT-17, and OPT-18 — bandwidth, storage, and search shape. Worth doing before the catalog is large, not before the items above.
