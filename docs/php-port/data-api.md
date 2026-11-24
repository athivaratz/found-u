# Data API (P5)

This is the surface P6 should call instead of `lib/database.ts` and the Supabase client. Slim is mounted at `/api`, so a page calls `/api/lost-items` and the route inside PHP is `/lost-items`. JSON is camelCase. Timestamps are ISO-8601 with a `Z` and three millisecond digits. Dates the client sends are the same shape, not a unix number.

Every write in this phase updates `change_feed` in the same transaction as the row. The triggers from P2 do that too. A rolled-back write does not leave a new stamp. Do not bump `change_feed` from the browser.

## Polling

`GET /api/changes?tables=lost_items,found_items` returns `{ tables: { lost_items: "2026-…Z", … } }`. Omit `tables` to get every name the feed knows. Unknown names are 400. At most 20 names.

Send the previous `ETag` as `If-None-Match`. A match is 304 with an empty body. Keep the ETag in memory. This response is `Cache-Control: private, no-store`, so Cloudflare will not store it and the browser will not either. The client has to remember the header itself.

This request does not read the session cookie and does not send `Set-Cookie`. Do not expect the session to slide because a tab is polling. The IP rate-limit row is still written, the same as any other request. Stop the timer when the tab is hidden.

## Cache

These reads send `Cache-Control: public, s-maxage=60, max-age=0` and an `ETag`:

- `GET /api/settings` when the document loads
- `GET /api/public-settings`
- `GET /api/public-images`
- `GET /api/categories`, `/locations`, `/contact-types`, `/drop-off-locations`
- `GET /api/stats`

A database error on `GET /api/settings` is still 200, with `loadError: true` and the defaults, and that response is `private, no-store` so a blip is not cached. `GET /api/public-settings` on failure returns `{ comingSoonEnabled: false, comingSoonMessage: "พบกันเร็วๆนี้" }` and still uses the public cache, which matches the current route.

Everything else, including item lists, is `private, no-store`. Item rows are public to read and they still contain contacts. That is the current product. Do not cache those responses at the edge.

## Lists

Query `limit` and either `cursor` or `offset`, not both. Offset stops at 100. A cursor is opaque. Pass `nextCursor` back as `cursor`. When `nextCursor` is null, that was the last page.

| List | Default | Max |
|---|---|---|
| lost and found items | 50 | 100 |
| latest lost or found | 5 | 20 |
| admin users | 100 | 100 |
| activity and error logs | 50 | 200 |
| catalogs | all, ordered by `order` then `value`, hard stop 200 | 200 |

`getAllUsers` has to follow `nextCursor`. One hundred rows is the whole page.

## Auth

A guest is 401. A signed-in user who is short of the role is 403. A missing row on a route the caller is allowed to know about is 404. `GET /api/users/{id}` returns 404 for another student and for a missing id, so the caller cannot tell them apart. A guest on that route is 401 and the row is not loaded.

Cookie mutations need `X-CSRF-Token` copied from `foundu_csrf` (or `__Host-foundu-csrf` on HTTPS). A request with no cookie skips CSRF. There is no bearer shortcut. `X-Requested-With: foundu` is what the Cloudflare rule looks for. PHP does not check it. The browser client sends it on every call.

## Items

`POST /api/lost-items` is a student route. The status has to be `searching` when it is sent, and the default is `searching`. `userId` and `studentId`, if sent, have to be the caller. The server writes the caller's ids even when the body omits them. An admin may set another `userId`, a 5-digit `studentId` that exists, and any status.

`POST /api/found-items` is the same idea with status `pending_room_confirm`. The handover deadline is computed from settings. The client cannot set it on create. An admin can patch `handoverDeadlineAt` later.

Unknown JSON keys are 400. `matchedFoundId` and `matchedLostId` are not accepted. Confirm and unmatch are a later phase.

Create answers 201 `{ id, item }`. A single read is `{ item }`. A list is `{ items, nextCursor }`. A missing id is 404, which P6 should turn into `null` for `getLostItem` and `getFoundItem`.

Tracking codes are `LOST-` or `FOUND-` plus 6 characters from `ABCDEFGHJKLMNPQRSTUVWXYZ23456789`. A client code matching `/^(LOST|FOUND)-[A-Z0-9]{4,12}$/` is kept when the prefix matches the table. Lookup is exact: `GET /api/lost-items/by-code/{code}` and the found twin. Latest searching lost reports are `GET /api/lost-items/latest`. Latest found or claimed reports are `GET /api/found-items/latest`.

A student cannot patch or delete an item, including their own. Admin patch and delete can. `POST /api/found-items/{id}/handover` is admin, has no body, and only succeeds while the row is `pending_room_confirm`. Anything else that still exists is 409.

`GET /api/stats` is `{ searching, found, claimed, pendingRoomConfirm }`. Expired rows are not in those four numbers.

`POST /api/found/expire-overdue` is public and returns `{ expired }`. It is also limited to 10 calls a minute per IP, on top of the normal API limit. Creating an item is 30 an hour per student and 200 an hour per admin.

## Catalogs and settings

Categories, locations, contact types, and drop-off locations are public reads and admin writes. The list keys are `categories`, `locations`, `contactTypes`, and `dropOffLocations`. Create is 201 `{ id, category }` (or `location`, `contactType`, `dropOffLocation`). `order` in JSON is `sort_order` in the table. `value` is lowercase letters, digits, and underscore.

`GET /api/settings` is `{ settings, loadError }`. `PATCH /api/admin/settings` merges the body onto the stored document. Unknown keys and anything that looks like a provider secret are 400. AI keys stay in `ai_credentials`. `schoolName` and `logoUrl` are allowed.

`GET /api/public-settings` returns only `comingSoonEnabled` and `comingSoonMessage`.

`GET /api/public-images?folder=img` or `folder=img/mobile_responsive` reads `public/` next to the `foundu/` directory. Anything else, including `..`, is treated as `img`. The body is `{ images: [{ fileName, label, url, width, height }] }`. SVG sizes fall back to 1080×1920. A missing directory is `{ images: [] }`.

`POST /api/revalidate-og` is `{ revalidated: true }` and does no work.

## People

`GET /api/users/me` and `GET /api/users/{id}` return `{ user }` in the `AppUser` shape: `uid`, not `id`. Password, PIN, and passkey material are not selected. `photoURL` on a `googleusercontent` host is null.

`PATCH /api/users/me` accepts `displayName`, `photoURL`, `nickname`, `shownName`, and `hasSeenTutorial`. `role` and every locked column are 400.

`PATCH /api/user/profile` accepts `{ shownName }` up to 40 characters. Missing or blank becomes null. Success is `{ ok: true, shownName }`. A guest is 401 `{ error: "Unauthorized" }` with that capital U, because the current Next route checks that string. Other routes use the lowercase `unauthorized` code.

`GET /api/admin/users` is `{ users, nextCursor }`.

`POST /api/admin/users/{id}/ban` with `{ reason }` and `POST /api/admin/users/{id}/timeout` with `{ reason, durationMinutes }` go through `AccountWriter::setBan`. Timeout answers with `timeoutUntil`. `POST /api/admin/users/{id}/unban` has an empty object body. Ban and timeout revoke that account's sessions. They do not clear the admin's cookies.

`PATCH /api/admin/users/{id}/role` with `{ role: "user" | "admin" }` uses `AccountWriter::setRole`. Sessions stay valid. The caller cannot demote themselves. The next `GET /api/auth/session-status` sees the new role without a new login.

## Logs and dismissals

`POST /api/activity-logs` is any signed-in user. `userId` has to be omitted or equal the caller. `userEmail` in the body is ignored. The stored email comes from the session. `GET /api/admin/activity-logs` is admin. There is no update or delete.

`POST /api/error-logs` is any signed-in user. `resolved` is forced off. `GET /api/admin/error-logs` and `PATCH /api/admin/error-logs/{id}` with `{ resolved: true | false }` are admin.

`match_dismissals` are admin for list, create, and delete. Create is `{ lostId, foundId }`. A repeat of the same pair is 200 and the existing row. A missing item is 404. The list is `{ dismissals, nextCursor }`.

## Errors

The body is `{ error }` plus `field` when the input names one. 409 is a unique-key conflict. 429 includes `Retry-After`. Local `APP_ENV` adds `detail` for unexpected exceptions, not for `HttpError`. There is no stack in the JSON.

## Usage and CMS reads

`POST /api/ai-usage` with `{ endpoint, userId? }` inserts a row for the signed-in account. A `userId` that is not that account is 403. `GET /api/admin/ai-usage` is `{ records, nextCursor }` and is admin. Deletes stay on cron.

`GET /api/articles` lists published rows. `GET /api/articles/{slug}` is one published row, or 404. `GET /api/admin/articles` and `GET /api/admin/articles/{id}` are the editor list. Writes on `/api/admin/articles` and the help-page write routes are 501 after authz, so a guest is 401 and a student is 403. `GET /api/help/{slug}` is the public page plus its sections. These CMS bodies still use the column names the current mappers expect (`cover_image_url`, `updated_at`). P10 can rename them when the editor is real.
