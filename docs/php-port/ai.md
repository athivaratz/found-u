# AI, search, and matching

This is the PHP side of vision, NER, item search, and the match desk. The chat agent is not here yet. P9 should call the pieces below and should not open its own cURL client or its own key store.

## What a request is allowed to do

A vision, NER, match-with-AI, provider probe, or OpenRouter model lookup holds one `ai_slots` row for the whole HTTP request, then writes one `ai_usage` row, then talks to the model. The lease is released in `finally`, including when the model fails. A full queue is HTTP 429 `rate_limit_exceeded` with `reason` `queue_full` and the message `คิว AI เต็ม ลองใหม่อีกสักครู่`. That path does not write `ai_usage`.

Quota is the existing `Foundu\Ai\Quota`: 5 calls a minute and 30 an hour per account, 20 a minute and 100 an hour for the site, unless `app_settings` says otherwise. A denied call is also 429 `rate_limit_exceeded`, with `reason`, the settings message, remaining counts, and `Retry-After`. The charge happens before the upstream call, so a provider error still counts.

`AI_MAX_CONCURRENCY` defaults to 3. `AI_UPSTREAM_TIMEOUT` defaults to 12 seconds and is clamped to 3–20. Match compares use 8 seconds each and stop after 20 seconds. `set_time_limit(26)` is set on these routes. The host `max_execution_time` is about 30 seconds, so a request must not start a fourth compare. Batch AI only re-ranks the 8 newest matchable lost items. The `pool` counts are still the full matchable lost, found, and high-confidence totals.

Admin vision `testMode` skips the quota row. The flag is ignored unless the session is an admin. A client-supplied `userId` is ignored on vision, NER, and the quota GET. Those routes require a logged-in account.

Turnstile on the first AI call of a session is still open. P9 owns that check. Do not add a second quota table for it.

## Providers

`Foundu\Ai\Credentials` reads `ai_credentials`. A ciphertext that decrypts wins over `GEMINI_API_KEY` / `OPENROUTER_API_KEY`. An empty box leaves that provider on env. `provider` is `auto` (Gemini, then OpenRouter), `gemini`, `openrouter`, or `none`.

The box is `sodium_crypto_secretbox`. The key is SHA-256 of `APP_KEY` (raw). Nonces are 24 bytes and a save or rotate seals again with a new nonce. `APP_KEY` shorter than 16 characters is 503 `server_error` when a key must be sealed or opened. Decrypt failure does not fall through to env.

Admin routes:

| Method | Path | Body |
|---|---|---|
| GET | `/api/admin/ai-credentials` | flags: `provider`, `openrouterModel`, `hasGeminiKey`, `hasOpenrouterKey`, `configuredAt` |
| PATCH | `/api/admin/ai-credentials` | `provider`, `geminiApiKey`, `openrouterApiKey`, `openrouterModel`. A bullet placeholder keeps the stored key |
| POST | `/api/admin/ai-credentials/rotate` | re-seals the stored keys. Does not return them |
| POST | `/api/admin/ai-credentials/test` | `{ "provider": "gemini" \| "openrouter" }` |
| GET, POST | `/api/agent/test-providers` | optional `provider`. Response is `{ providers, settingsSource }` |
| GET | `/api/agent/openrouter/endpoints?model=` | OpenRouter model endpoints |
| GET | `/api/ai/models` | the four model ids from settings plus the OpenRouter model |

None of these responses include a key. Do not log `Credentials`, the Gemini URL (the key is the query string), or exception detail that might contain it. cURL is limited to `generativelanguage.googleapis.com` and `openrouter.ai`, HTTPS, no redirects.

Tests set `Foundu\Ai\Runtime::$upstream`. Production leaves it null and uses cURL. Prompts and JSON parsing live in `Foundu\Ai\Prompts`, `Foundu\Ai\Parse`, `Foundu\Ai\Vision`, and `Foundu\Ai\Ner`. They follow `lib/vision.ts`, `lib/ner.ts`, and `lib/matching.ts`.

## Search

`GET /api/search` is public. Query: `q` or `query` (max 80), `type` `lost|found|all`, `mode` `catalog|agent`, `limit` 1–10, `category`, `status`, `threshold`. The body is `{ lost, found, filteredCount }` using the same item shape as the list routes, including contacts. `Cache-Control` is `private, no-store`.

MariaDB 10.11 has no ngram FULLTEXT parser. FULLTEXT splits on spaces, and Thai text has none, so a name is one token. An extra n-gram table would be rewritten on every item save for a few hundred rows. The scan is the PHP port of Postgres `pg_trgm`: two spaces on the left, one on the right, unique character trigrams, Jaccard. Threshold 0.15 for the catalog and 0.30 for `mode=agent`, unless the query or settings override it.

When the filtered table has 300 rows or fewer, every text row is ranked. Above that, up to four character bigrams are `LIKE` probes (escaped) across name, description, location, and tracking code, capped at 300, then the same ranker. A query that starts with `LOST-` or `FOUND-` is a tracking-code prefix only and is not mixed into the score. Empty `q` returns the latest rows.

`foundu/tests/fixtures/search-expected.json` is 25 lost items and 20 queries. Expected ids were produced by `foundu/tests/fixtures/build-search-expected.py`, which is a separate pg_trgm implementation, not a call into the PHP ranker. Top-5 set overlap on that fixture is 100%, which clears the 80% bar. Odd Thai hits are the same ones Postgres would return: `สมุด` matches `ห้องสมุด`, and `เงิน` matches `น้ำเงิน`.

Agent mode then applies the location markers from `lib/search/relevance.ts` (`แถว`, `บริเวณ`, `ใกล้`, and the rest) to the already limited list. `filteredCount` is how many of those rows were dropped.

## Matching

| Method | Path | Who |
|---|---|---|
| POST | `/api/match` | public when `useAI` is absent or false. A session is required when `useAI` is true. Body `{ type, itemId, useAI? }` |
| GET | `/api/match/batch` | admin. `useAI=true` or `1` |
| POST | `/api/match/batch` | admin. `{ useAI?, includeHistory? }` |
| POST | `/api/match/confirm` | admin. `{ lostId, foundId }` |
| POST | `/api/match/unmatch` | admin |
| POST | `/api/match/reject` | admin. Writes `match_dismissals` |

Scoring is the character-bigram matcher from `lib/matching.ts`, not the search trigram. Weights are category 0.20, lost name against found description 0.35, location 0.20, description 0.15, time 0.10. Threshold 0.40. Confidence is recomputed at 0.70 / 0.55. The response match has `key`, `score`, `scorePercentage`, `confidence`, `reasons`, `lostItem`, `foundItem`. Batch adds `pool` `{ lost, found, highConfidence }` and `history`.

Confirm and unmatch are one transaction with `SELECT … FOR UPDATE` on the lost row, then the found row. Confirm sets both to `found` and stores the cross ids. Unmatch sets the lost item back to `searching` and leaves the found item `found`. Conflicts are 409: `lost_not_found`, `found_not_found`, `lost_not_matchable`, `found_not_matchable`, `not_linked`. A missing suggest target is 404 `Item not found`. Confirm, unmatch, and reject bump `change_feed` inside the same transaction (`lost_items` and `found_items`, or `match_dismissals`).

Non-AI match is limited to 30 requests a minute per account (or per IP for a guest). Batch is 10. That limiter is `too_many_requests`, separate from the AI quota.

## What P9 should wire

The browser already posts vision, NER, match, credentials, and the provider test with `phpFetchHeaders()` from `lib/api-client.ts` (CSRF and `X-Requested-With: foundu`, no 429 retry). `lib/match-service.ts`, `lib/vision.ts` `extractVisionData`, and the agent tools still throw or still talk to Gemini from Node. Replace those with:

- `Foundu\Ai\Budget` for the lease and the quota charge
- `Foundu\Ai\Credentials` and `Foundu\Ai\Generate` for the model call
- `GET /api/search` when a tool needs items, with `mode=agent`
- one JSON object, not a stream

Do not return API keys. Do not raise the upstream timeout above 20 seconds. Do not put the agent prompt in the error envelope.
