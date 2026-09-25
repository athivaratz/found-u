# Bugs and failure points

Static review of this repository on 25 September 2026. These are defects that can expose student data, grant admin, break matching or login, or reopen the setup wizard. Line numbers refer to the tree reviewed that day.

No live database was queried. Confirm `accounts` row-level security on the deployed project before treating BUG-01 as already exploited or already fixed:

```sql
SELECT c.relrowsecurity
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relname = 'accounts';
```

`relrowsecurity = false` means the policies in the migrations are not enforced.

---

## Summary

| ID | Severity | Area | Failure |
| --- | --- | --- | --- |
| BUG-01 | Critical | Accounts / RLS | Logged-in student can set `role = admin` and rewrite hashes |
| BUG-02 | Critical | Matching RPCs | Any logged-in user can confirm or undo any match |
| BUG-03 | Critical | Setup | A failed admin lookup clears setup and reopens the wizard |
| BUG-04 | Critical | Item privacy | Public `SELECT` returns phone, Line, and email |
| BUG-05 | High | Login | Student id `11111` is promoted to admin on every password login |
| BUG-06 | High | Bans | Ban is enforced in the UI only; APIs still accept the session |
| BUG-07 | High | Matching | An AI error or “not a match” deletes a good heuristic pair |
| BUG-08 | High | Auth surface | `/api/match` is public, can spend AI, and returns full rows |
| BUG-09 | High | Storage | Any logged-in user can delete any `found-items/` photo |
| BUG-10 | High | AI routes | Vision and NER trust a client-supplied `userId` |
| BUG-11 | High | Passkeys | Challenges live in process memory and fail across instances |
| BUG-12 | High | Login / PIN | Rate limit is an in-memory `Map` and resets per isolate |
| BUG-13 | High | Registration | Lookup returns name and a signup token with a weak limiter |
| BUG-14 | High | Agent search | Location words and status `searching` hide real items |
| BUG-15 | Medium | Agent | Hallucinated tracking codes are only logged, and only on the request |
| BUG-16 | Medium | Agent tools | The first tool call disables every later tool in that turn |
| BUG-17 | Medium | Timezone | Clock times are interpreted in the server zone (UTC on Vercel) |
| BUG-18 | Medium | Images | `next/image` allows only one hardcoded Supabase host |
| BUG-19 | Medium | Audit log | Any authenticated user can insert fake activity rows |
| BUG-20 | Medium | Discord | Two people can race the same verification link |
| BUG-21 | Medium | NFC | A tag can be linked to another student’s lost item |
| BUG-22 | Medium | Admin check | `isAdminUser` ignores `linked_uid` |
| BUG-23 | Low | PIN | Setup replaces the PIN with no current-PIN check and no rate limit |

---

## BUG-01 — `accounts` never enables row-level security

**Severity:** critical  
**Impact:** A logged-in student can become admin, clear a ban, disable other people, and overwrite password hashes, PIN hashes, and passkey credentials.

**Root cause.** `public.accounts` is created in `supabase/migrations/20260616152000_create_unified_accounts.sql` and never receives `ENABLE ROW LEVEL SECURITY`. Later migrations add policies (`accounts_update_own`, `accounts_select_linked`, `accounts_update_admin`) and grant `UPDATE` to `authenticated` (`20260616152631_fix_accounts_service_role_grants.sql` lines 5–20). In Postgres, policies are ignored while row-level security is off. The own-row policy also does not freeze privileged columns: `WITH CHECK` is only `id = auth.uid()`. The older `profiles_update` policy did require `role` and `student_id` to stay unchanged (`20260612172624_rls_policies_and_realtime.sql` lines 35–39). That protection was not copied onto `accounts`.

**How it fails.** With a normal student JWT:

```http
PATCH /rest/v1/accounts?id=eq.<own-user-id>
{ "role": "admin" }
```

If the project’s default privileges also granted `SELECT` to `anon` or `authenticated` (common on older Supabase projects; this repo does not grant it explicitly), the same key can read `current_password_hash`, `pin_hash`, and `passkey_credentials` for every row. `user_id` values needed to target other rows are already public on lost and found items (BUG-04).

**Fix.** `ALTER TABLE public.accounts ENABLE ROW LEVEL SECURITY`. Revoke table-wide `UPDATE` from `authenticated` if the app only needs a narrow profile update. Add a `WITH CHECK` or a trigger so `role`, `ban_status`, `status`, `student_id`, `pin_hash`, `current_password_hash`, `school_password_hash`, and `passkey_credentials` cannot change unless the caller is `service_role`. Confirm with the query at the top of this report.

---

## BUG-02 — Any logged-in user can confirm or undo matches

**Severity:** critical  
**Impact:** A student can pair or unpair any lost and found items and change their statuses, skipping the admin review queue.

**Root cause.** `confirm_item_match` and `unmatch_item_match` are `SECURITY DEFINER`, so they bypass row-level security. The functions do not call `is_admin()`. `20260723030000_matching_core.sql` lines 162–165 grant `EXECUTE` to `authenticated` as well as `service_role`. The Next.js routes check admin; PostgREST does not.

**How it fails.** `supabase.rpc('confirm_item_match', { p_lost_id, p_found_id })` from any signed-in browser session.

**Fix.** `REVOKE EXECUTE ON FUNCTION public.confirm_item_match(uuid, uuid) FROM authenticated, PUBLIC` and the same for `unmatch_item_match`. Keep `service_role` only, or raise inside the function when `NOT public.is_admin()`.

The row locks inside the functions (`FOR UPDATE`, consistent lock order) are fine. The hole is the grant, not a race between two admins.

---

## BUG-03 — A transient database error resets setup and reopens the wizard

**Severity:** critical  
**Impact:** The whole school is redirected to `/setup`. Branding and AI settings can be overwritten. A second admin can be created.

**Root cause.** `hasAdminAccount()` returns `false` on any error, including timeouts, not only when the query succeeds and finds zero admins (`lib/setup/setup-status-server.ts` lines 15–31). `fetchSetupStatusAnon` then calls `repairStaleSetupComplete()`, which upserts `is_completed: false` (lines 35–50 and 115–119). Middleware runs this probe whenever `fu_setup_ok` is missing, and that cookie lives for 60 seconds (`lib/setup/constants.ts` line 6). `GET /api/setup/status` can then mint the setup-action cookie while setup looks incomplete.

**How it fails.** Service-role blip or cold-start timeout → “no admin” → setup flag cleared → next request goes to `/setup` → wizard completion creates another admin.

**Fix.** Reset setup only when the admin query succeeds and the count is 0. On error, keep `is_completed` as stored and fail the request. Do not mint the setup-action cookie from a public GET. Lengthen the setup-ok cookie after completion (see OPT-06).

---

## BUG-04 — Lost and found contacts are world-readable

**Severity:** critical  
**Impact:** Phone, Line, email, and other contact fields for every report are readable with the public anon key. The tracking page hides contacts in the UI (`app/(app)/tracking/page.tsx`); the row is already in the response.

**Root cause.** `lost_items_select` and `found_items_select` are `FOR SELECT USING (true)` (`20260612172624_rls_policies_and_realtime.sql` lines 56–67). The same migration grants `SELECT` on all tables that existed then to `anon` and `authenticated`. Client helpers select `*` (`lib/database.ts` around the lost and found getters).

**How it fails.** `GET /rest/v1/lost_items?select=*` with `apikey` set to the anon key, or the network response on `/tracking`.

**Fix.** Public read must omit `contacts`, `finder_contacts`, and `user_id` (a view, column privileges, or an RPC). Owners and admins read the full row through a separate policy. `/api/match` must use that same public shape (BUG-08).

---

## BUG-05 — Student id `11111` becomes admin on password login

**Severity:** high  
**Impact:** Whoever can register or log in as `11111` is promoted to admin.

**Root cause.** `BOOTSTRAP_ADMIN_STUDENT_IDS` is a hardcoded set containing `"11111"` (`lib/student-auth-server.ts` line 21). After a successful password login, lines 746–756 call `promoteAdminUser` for that id. A migration also deletes one legacy auth user for `11111@students.foundu.bodin2.ac.th` (`20260616171804_accounts_select_linked_and_remove_duplicate_admin_auth.sql`), which shows this id was a real bootstrap account, not a comment.

**How it fails.** The roster contains `11111`, or someone registers it, then logs in with a password.

**Fix.** Remove runtime promotion. Create the first admin only inside the setup wizard or `create:admin`.

---

## BUG-06 — A ban does not stop login or API use

**Severity:** high  
**Impact:** A banned or timed-out student still receives a JWT and can report items, call the agent, register NFC tags, and upload files. Discord verification does check `ban_status`. The website does not.

**Root cause.** `verifyStudentPassword` and PIN login reject only `status === "disabled"` (`lib/student-auth-server.ts` lines 635 and 797). `lib/auth-eligibility.ts` does the same. `AuthGuard` redirects the browser to `/banned`, which a direct API call never hits. A search of `app/api` shows `ban_status` on the Discord routes only.

**How it fails.** Banned user calls `POST /api/auth/login`, then `POST /api/agent/chat` or `POST /api/nfc/register` with the tokens.

**Fix.** Reject `ban_status` of `banned` or an unexpired `timeout` in password login, PIN login, and passkey login. Repeat the check in one shared helper used by mutating API routes, because an existing JWT stays valid until it expires.

---

## BUG-07 — AI matching drops heuristic matches on failure

**Severity:** high  
**Impact:** The review queue goes empty when Gemini is down, rate-limited, or returns `isMatch: false`. Admins think matching is broken. The same path can spend hundreds of free-tier calls (OPT-10).

**Root cause.** `findMatchesForLostItemAI` and `findMatchesForFoundItemAI` return `null` when `!aiResult || !aiResult.isMatch` (`lib/matching.ts` lines 667–668 and 705–706). A timeout, a 429, and a parse failure all look like “not a match.”

**Fix.** If the model returns nothing, keep the heuristic score. If it returns `isMatch: false`, lower the score or attach the reason; do not delete the pair. Cap AI to a small global number of calls per request.

---

## BUG-08 — `/api/match` does not require a session

**Severity:** high  
**Impact:** Anyone who knows or guesses an item UUID receives both sides of the suggestion, including contacts, via the service role. `useAI: true` spends Gemini quota. Every POST also runs handover expiry.

**Root cause.** `optionalMatchAuth` is called and then discarded (`void authUser`) in `app/api/match/route.ts` lines 34–38. The comment says item fields are already public via RLS, which is BUG-04, not a reason to add an unauthenticated AI path. `serializeMatchForJson` embeds the full lost and found objects (`lib/match-service.ts`).

**How it fails.** `POST /api/match` with `{ "type": "lost", "itemId": "<uuid>", "useAI": true }` and no cookie.

**Fix.** Require a session. Allow `useAI` only for admins. Serialize with the public field list from BUG-04. Do not expire items on this request (OPT-07).

---

## BUG-09 — Found-item photos can be deleted by any logged-in user

**Severity:** high  
**Impact:** Any student can remove another student’s found-item image, or any object whose key starts with `found-items/`.

**Root cause.** `assertDeleteAuthorized` returns immediately for every path under `found-items/` (`app/api/storage/delete/route.ts` lines 78–81). It checks ownership only for `avatars/${userId}/`. Upload validates the `itemId` character set, not that the caller owns the item (`app/api/storage/upload/route.ts`).

**How it fails.** `POST /api/storage/delete` with `{ "path": "found-items/<victim-item>/photo.jpg" }` while signed in as someone else.

**Fix.** Load the item and require `user_id = auth.uid()` or admin. Store keys as `found-items/{userId}/{itemId}/...` and check that prefix.

---

## BUG-10 — Vision and NER trust the body for identity

**Severity:** high  
**Impact:** Anonymous callers spend the Gemini quota. `testMode: true` plus any admin UUID skips the rate limit and can return model debug output. See also OPT-08.

**Root cause.** Neither route calls `getUser()`. `app/api/vision/route.ts` lines 32–47 and 75–78 and `app/api/ner/route.ts` lines 18–46 rate-limit only when `userId` is present. Admin detection uses that client-supplied id (`isAdminUser(userId)`).

**How it fails.** `POST /api/ner` with text and no `userId`. Or `POST /api/vision` with `{ "testMode": true, "userId": "<admin uuid copied from a public item>" }`.

**Fix.** Require a session. Derive the user id and the admin flag from it. Cap text length and image bytes.

---

## BUG-11 — Passkey challenges are stored in the function instance

**Severity:** high  
**Impact:** Passkey login and registration fail with an expired-challenge error whenever the verify request hits a different Vercel isolate from the one that issued the options. The same class of bug affects login rate limits (BUG-12).

**Root cause.** `lib/passkey-challenge-store.ts` lines 3–20 keep challenges in a module-level `Map` with a five-minute TTL. Serverless instances do not share memory.

**How it fails.** `POST` options on isolate A, verify on isolate B, `consumeChallenge` returns null.

**Fix.** Store the challenge in Postgres or another shared store, keyed and expired server-side. Do not put the raw challenge in a cookie the client can rewrite without a signature.

---

## BUG-12 — Login, PIN, and registration limits do not survive serverless

**Severity:** high  
**Impact:** A six-digit PIN and student passwords can be guessed by spreading attempts across instances. Student ids can be enumerated the same way.

**Root cause.** `rateLimitStore` is a process-local `Map`, five attempts per 60 seconds per key (`lib/student-auth-server.ts` lines 24–27). It is used for password login, PIN login, and `GET /api/auth/register/lookup`. Setup’s AI-key test uses the same pattern (`lib/setup/rate-limit.ts`). Parallel requests land on different isolates, each with a fresh counter.

**Fix.** A shared counter (one Postgres function or a small key-value store) keyed by IP and by student id. Apply it to `verify-pin` and `verify-password` as well; those routes currently have no limit (BUG-23).

---

## BUG-13 — Registration lookup returns a name and a token

**Severity:** high  
**Impact:** A script can walk `00000`–`99999`, learn which ids exist, and receive the student’s name plus a 15-minute registration token. The limiter in front of it is BUG-12.

**Root cause.** `app/api/auth/register/lookup/route.ts` is unauthenticated and returns profile fields plus `createRegistrationToken`. If `REGISTRATION_TOKEN_SECRET` and `SUPABASE_SERVICE_ROLE_KEY` are both unset, the HMAC key falls back to the literal `foundu-registration-dev-secret` (`lib/registration-token.ts` lines 11–16). Using the service-role key as the HMAC secret also means anyone who can read that env value can forge tokens.

**Fix.** Return only `canRegister` until a later step. Rate-limit by IP in shared storage. In production, refuse to start if `REGISTRATION_TOKEN_SECRET` is missing. Do not reuse the service-role key as the HMAC secret.

---

## BUG-14 — Agent search drops real items

**Severity:** high  
**Impact:** The assistant says nothing was found when the catalog has the item.

**Root cause.** Two filters stack.

1. `parseSearchQuery` treats the first of `ใน`, `ที่`, `หน้า`, `ชั้น`, and similar words as a location split (`lib/search/relevance.ts` lines 3–48). `"กุญแจในกระเป๋า"` becomes item `กุญแจ` and location `กระเป๋า`. `filterSearchResultsByRelevance` then removes items whose place name does not contain `กระเป๋า` (lines 101–118). Agent mode always runs this filter.
2. The `searchItems` tool defaults `status` to `"searching"` (`lib/agent/tools/index.ts` line 80). Found items are never in status `searching` (`pending_room_confirm` or `found`), so a found-item search comes back empty unless the model passes another status. Non-admins are also forced off `type: "found"` (line 79), which is intentional for privacy but means the model cannot search the found catalog at all.

**Related.** `getLostItemByTrackingCodeServer` queries only `lost_items` (`lib/agent/item-queries-server.ts` lines 26–35). A `FOUND-…` code never resolves.

**Fix.** Split on explicit place phrases (`แถว`, `บริเวณ`, `หน้า`, `หลัง`) only when there is an item phrase before them. Do not treat `ใน` inside an object name as a place. Default found-item status to the statuses found items actually use, or omit the status filter when the user did not name one. Look up `FOUND-` codes on `found_items`.

---

## BUG-15 — The hallucination guard does not see the reply it should check

**Severity:** medium  
**Impact:** The model can show a fake `LOST-` or `FOUND-` code. The student goes to tracking and finds nothing. The guard only writes a server log.

**Root cause.** `warnHallucinatedTrackingCodes` is log-only (`lib/agent/hallucination-guard.ts` lines 24–36). The chat route calls it on the pruned inbound messages before the model runs (`app/api/agent/chat/route.ts` line 70). The new assistant message is not checked in `onEnd`.

**Fix.** After the stream finishes, if the assistant text contains a tracking code and that turn has no successful `reportLostItem` or `reportFoundItem`, remove or replace the code before it is stored and shown.

---

## BUG-16 — One tool call ends the tool loop

**Severity:** medium  
**Impact:** “Search, then report” or “report, then find matches” cannot happen in one turn. The student has to send another message. Extra `agentMaxSteps` (minimum 3) only buys more synthesis tokens, not more tools. This also wastes the free model quota (OPT-09).

**Root cause.** `prepareStep` sets `toolChoice: "none"` and `activeTools: []` as soon as any previous step had a tool call (`lib/agent/create-agent.ts` lines 54–68).

**Fix.** Allow a short allowlist after the first tool (for example one report after a search), or stop tools only after a successful report.

---

## BUG-17 — “Lost at 14:30” is stored in UTC on Vercel

**Severity:** medium  
**Impact:** A time spoken in the assistant is saved seven hours off for a Thailand school. Matching windows and the time shown on the item move with it. Handover expiry itself uses `Date.now()` plus a duration, so that path is not affected.

**Root cause.** `parseItemDate` uses `date.setHours(...)` on a `new Date()` (`lib/agent/item-actions-server.ts` lines 48–60). On Vercel that clock is UTC. `formatThaiDate` / `formatTime` in `lib/utils.ts` do not pass `timeZone: "Asia/Bangkok"`.

**How it fails.** The student says the item was lost at 14:30. The row stores 14:30 UTC, which is 21:30 in Bangkok.

**Fix.** Interpret clock times in `Asia/Bangkok` and pass that time zone into `toLocaleString` / `toLocaleTimeString`.

---

## BUG-18 — Image config is hardcoded to one Supabase project

**Severity:** medium  
**Impact:** `next/image` refuses storage URLs from any other project, including a new school created from this repo. Item UIs that set `unoptimized` still render. Optimized images on a new host do not.

**Root cause.** `next.config.ts` lines 4–11 list only `qfqptklywqbvpjjbmswy.supabase.co`.

**Fix.** Derive the hostname from `NEXT_PUBLIC_SUPABASE_URL` and add `R2_PUBLIC_BASE_URL` when it is set.

---

## BUG-19 — Anyone signed in can forge an activity log row

**Severity:** medium  
**Impact:** The admin audit trail can contain rows the school did not perform. Combined with no retention (OPT-12), this is also a way to fill the free database.

**Root cause.** `activity_logs_insert` is `WITH CHECK (true)` for `authenticated` (`20260612172624_rls_policies_and_realtime.sql` lines 91–92). Select is admin-only, so students cannot read the log back, but they can insert.

**Fix.** `WITH CHECK (user_id = auth.uid())` and restrict `action_type` to a small allowlist. Admin-only actions should be inserted with the service role.

---

## BUG-20 — Discord verification can bind the wrong account

**Severity:** medium  
**Confidence:** medium. The race is visible in the route; it needs two overlapping requests to show up.

**Impact:** Two people opening the same pending link can interleave. The Discord link row and the session row can end up pointing at different Found-U users.

**Root cause.** `app/api/discord/verify/route.ts` reads a pending session, then upserts `discord_links`, then updates the session. Those are separate statements. The conditional update is not the first write.

**Fix.** In one transaction, `UPDATE ... SET status = 'verified' WHERE id = ? AND status = 'pending' RETURNING *`. If no row returns, stop. Then upsert the link for the account that won the update.

---

## BUG-21 — An NFC tag can point at someone else’s lost item

**Severity:** medium  
**Impact:** The tag owner or an admin can store another student’s `lost_item_id` on the tag. Later “mark returned” updates that lost row when the user ids happen to match, or leaves a wrong link when they do not.

**Root cause.** `lib/nfc-server.ts` (the link path around lines 256–297) accepts the lost item id without checking `lost_items.user_id = tag.owner_id`.

**Fix.** Reject the link unless the lost item belongs to the tag owner, or the caller is an admin doing an explicit override that is written to the audit log.

---

## BUG-22 — Admin checks miss `linked_uid`

**Severity:** medium  
**Impact:** Legacy rows where `auth.uid()` is `accounts.linked_uid` and not `accounts.id` lose admin on every `requireAdmin` path. SQL `is_admin()` has the same shape.

**Root cause.** `isAdminUser` in `lib/nfc-server.ts` lines 34–38 selects `accounts` with `id = userId` only. `20260616153450_fix_is_admin_use_accounts.sql` lines 9–14 do the same.

**Fix.** Treat a row as the caller when `id = auth.uid() OR linked_uid = auth.uid()`, in both the helper and `is_admin()`.

---

## BUG-23 — PIN setup and step-up checks are unlimited

**Severity:** low  
**Impact:** A stolen session can replace the PIN with no knowledge of the current PIN (`app/api/auth/pin/setup/route.ts`). `verify-pin` and `verify-password` allow online guessing against a live session because they are outside the login limiter.

**Fix.** Require the current PIN or password before a change. Apply the shared limiter from BUG-12.

---

## Other routes that should not stay public

| Route | What goes wrong | Fix |
| --- | --- | --- |
| `POST /api/found/expire-overdue` | No auth. Today it only updates rows already past the deadline, but it is an unauthenticated write and an easy way to invoke the function repeatedly (OPT-07). | Cron secret or admin session. |
| `POST /api/revalidate-og` | No auth. Anyone can bust the Open Graph cache (`app/api/revalidate-og/route.ts`). | Same secret or an admin session. |
| NFC found-report rate limit | On a database error the limiter allows the report (`lib/nfc-server.ts` around lines 62–64). Spam then notifies the owner without a cap. | Fail closed. |
| Geocode spacing | The 1 request/second Nominatim gap is in memory (`app/api/geocode/search/route.ts`). Several instances can exceed OpenStreetMap’s limit and get the school blocked. The route is admin-only. | Shared timestamp, or cache identical queries for a day. |

---

## Checked, and not reported as bugs

| Area | Result |
| --- | --- |
| Password and PIN comparison | `scrypt` and `timingSafeEqual`, with a length check, in `lib/student-auth-server.ts`. Hashes are stored, not plaintext. |
| Agent report tools | `reportLostItem` / `reportFoundItem` use the chat session user id, not a body field. |
| `ILIKE` construction | `escapeIlike` strips `%`, `_`, `\`, and commas. This is not SQL injection. Leading-wildcard `ILIKE` is a cost issue (OPT-17), not an injection. |
| Middleware redirect loop | `/setup` is exempt, and missing Supabase env skips `updateSession`. No loop in the current matcher. |
| Discord bot secret | Compared with `timingSafeEqual` and a length check. Used tokens fail because status is no longer `pending`, apart from the race in BUG-20. |
| Coming soon | Default is off. It disables the landing call to action. It does not lock `/auth` or the APIs. The lockout bug is the opposite: bans do not stick (BUG-06). |
| Match confirm races between two admins | The RPCs lock rows in a consistent order. The production hole is BUG-02, not a double-confirm race. |
