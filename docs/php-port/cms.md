# CMS, NFC, geocode, and cron (P10)

Articles and help pages are writable by an admin. NFC tags and found reports follow the old routes. Place search proxies Nominatim. `bin/cron.php` is still the only cron entry.

## Articles and help

Public reads are unchanged: `GET /api/articles`, `GET /api/articles/{slug}`, `GET /api/help/{slug}`. Article JSON is snake_case (`content_json`, `cover_image_url`, `published_at`) because `lib/blog/map.ts` reads those names.

Admin writes:

| Method | Path | Success |
|---|---|---|
| POST | `/api/admin/articles` | 201 `{ article }` |
| PATCH | `/api/admin/articles/{id}` | 200 `{ article }` |
| DELETE | `/api/admin/articles/{id}` | 200 `{ ok: true }` |
| POST | `/api/admin/help-pages` | 201 `{ page }` |
| PATCH | `/api/admin/help-pages/{slug}` | 200 `{ page }` |
| POST | `/api/admin/help-sections` | 201 `{ section }` |
| PATCH | `/api/admin/help-sections/{id}` | 200 `{ section }` |
| DELETE | `/api/admin/help-sections/{id}` | 200 `{ ok: true }` |

A guest is 401 and a student is 403 before any row is written. Slugs are lowercase letters, digits, Thai, and single hyphens. Two articles cannot share a slug (409, `field: slug`). Publishing with no `published_at` stamps the current time. A draft clears that column.

`content_json` is TipTap. Nodes the editor does not render are dropped. Link and image URLs have to be `http`, `https`, `mailto`, or a site path. `javascript:` and `data:` are removed. Help `intro`, `description`, and section `body` go through an allowlist (`p`, `br`, `strong`, `em`, `a`, lists, headings, `code`, `pre`, `blockquote`). `script`, `svg`, event handlers, and other tags are removed. A sentence that only contains `<` is stored as typed.

`change_feed` moves in the same transaction as the write. The triggers from P2 do that as well.

The blog list sends the new article id to `/admin/blog/{id}` after a successful create.

## Meta tags for the static export

`public_html/meta.php` reads the exported shell and fills `<title>`, the description, the canonical URL, and the Open Graph and Twitter tags from the published article or the help page. A missing page is 404 with `noindex`, and the shell is still returned so the client app can show its own empty state.

`public_html/og.php` draws a 1200×630 PNG with GD and Sarabun (`foundu/resources/fonts/`, SIL OFL). The file is cached under `foundu/storage/cache/og/`. Without GD the response is a tiny fallback PNG. This replaces `app/blog/[slug]/opengraph-image`.

The rewrites are already in `public_html/.htaccess`. A request for `/blog/some-slug` never exposes `meta.php` in the browser URL. Direct requests to `*.php` other than `/api/index.php` stay forbidden.

## What P11 has to keep

1. Build the static export with `trailingSlash: true` and write the placeholder documents to `public_html/blog/_/index.html` and `public_html/help/_/index.html`. `meta.php` reads those files. If they are missing it serves a small HTML document that still has the right tags, and the client app will not hydrate.
2. Leave these rules above any catch-all that serves `index.html`, in this order: opengraph-image, `/og/{blog|help}/{slug}.png`, then `/blog/{slug}` and `/help/{slug}` to `meta.php`. A later rule that maps every path to a static file will skip the tags.
3. Do not delete `meta.php` or `og.php`, and do not add them to a public directory listing. The forbid rule for `*.php` must keep allowing only an internal rewrite, not a direct URL.
4. Point `APP_URL` at the public origin. Canonical and `og:url` are built from it. The image URL is `{APP_URL}/og/{kind}/{slug}.png`.
5. Cache HTML at the edge for a short time if you want (`Cache-Control` is already `public, s-maxage=60`). Purge that URL when an article is published. `/api/revalidate-og` is still a no-op.
6. The Cloudflare `Require ip` block stays between `# BEGIN foundu-cloudflare-ips` and `# END foundu-cloudflare-ips`. Cron will not touch a file that lost the markers. Do not add another `Require ip` outside that block.

Admin blog and help placeholders (`/admin/blog/_/`, `/admin/help/_/`, `/nfc/t/_/`) are unchanged. Those pages are behind login and do not need the meta injection.

## NFC

| Method | Path | Who | Body |
|---|---|---|---|
| GET | `/api/nfc/resolve?tag=` | public | 200 tag summary, no contacts. `ownerId` only when the session is the owner |
| GET | `/api/nfc/my-tags` | user | `{ tags, reports }` camelCase |
| POST | `/api/nfc/register` | user | `{ tagId, tagUrl }` |
| POST | `/api/nfc/found` | user | `{ reportId, success: true }` |
| PATCH | `/api/nfc/tags/{id}` | owner or admin | `{ success: true }` |
| PATCH | `/api/nfc/reports/{id}` | tag owner or admin | `{ ok: true }` |
| GET | `/api/nfc/tags?ownerId=` | that owner or admin | `{ items }` |
| GET | `/api/nfc/tags?limit=` | admin | `{ items }` |
| GET | `/api/nfc/tags/{id}` | owner or admin | `{ tag }` |
| POST | `/api/nfc/found-reports` | user | `{ id }` |
| GET | `/api/nfc/found-reports?ownerId=` or `?tagId=` | owner, finder, or admin, filtered | `{ items }` |
| PATCH | `/api/nfc/found-reports/{id}` | tag owner or admin | `{ ok: true }` |

`ownerId` in a found-report body is ignored. `finderUserId` must be the caller. A student cannot update someone else's tag (403). Reporting your own tag is 403 `cannot_report_own_tag`. A disabled tag is 403 `tag_disabled`. A duplicate hardware id is 409 `tag_uid_taken`. Found reports are limited to 20 per account per hour (`rate_limit_exceeded`). Registering is 30 per hour. Turning `nfcEnabled` off blocks register and found with `nfc_disabled`. Resolve still works so a sticker that is already in the wild can be opened.

`lib/nfc-api.ts` and the NFC helpers in `lib/database.ts` already call these paths.

## Geocode

`GET /api/geocode/search?q=` is admin only. Queries shorter than 2 characters return `{ results: [] }`. The upstream call is Nominatim with `countrycodes=th`, an 8 second timeout, and no redirects. The contact string is `GEOCODE_USER_AGENT` in `.env.php` (the app URL is used when that is empty). `GEOCODE_API_KEY` is sent only when `GEOCODE_ENDPOINT` is a different https host. Results are cached in `geocode_cache` for 7 days. One upstream call is allowed every 2 seconds for the whole site, and 30 a minute per admin. The 429 body is `{ error: "Too many requests. Please wait a moment." }`. A dead upstream with a stale cache row returns the stale row. With no cache it is 502.

## Cron

`*/5 * * * * php ~/foundu/bin/cron.php` still takes `cron_lock` and exits 0 when the lock is held.

After the existing session and rate-limit cleanup, each job gives up when its budget is gone:

| Job | Budget | When |
|---|---|---|
| Expire overdue found items | 10s | every run |
| Delete `agent_chat_logs` older than 7 days, 500 rows | 15s | every run |
| Delete geocode cache older than 30 days | 5s | every run |
| Delete OG PNGs older than 14 days, 50 files | 5s | every run |
| Refresh Cloudflare IP ranges | 20s | when `storage/cache/cf-ips-refreshed` is older than 7 days |
| Gzip SQL dump and PUT it to R2 | 60s | when R2 keys are set and the last success is older than 20 hours |

The dump does not call `mysqldump` or `exec`. It streams `INSERT` statements through `gzwrite`. The object key is `backups/foundu-YYYYmmddTHHMMSSZ.sql.gz`. If `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, or `R2_BUCKET_NAME` is empty, the dump is skipped and nothing is uploaded.

The PUT is `Foundu\Storage\R2Put`. It signs with `Foundu\Storage\SigV4::authorization`, the same signer P7 uses for presigned uploads. The region is `R2_REGION`, or `auto` when that is empty. `Foundu\Storage\ObjectPut` is the small interface the cron calls.

The Cloudflare job downloads `ips-v4` and `ips-v6`, checks that every line is a plausible CIDR, writes `foundu/config/cloudflare-ips.php`, and replaces only the marked block in `.htaccess`. Both files are parsed again before the old copy is removed. A short or invalid list leaves the previous files in place. `ClientIp` reads the PHP file on the next request (`opcache_invalidate` is called when the extension is present).

## Tests

`foundu/tests/P10HttpTest.php` covers CMS and NFC authz, the sanitizer on a real write, and the geocode cache. `P10UnitTest.php` covers the allowlist, meta injection, the PNG, the Cloudflare file swap, and the R2 signature. `CronTasksTest.php` expires a row, purges a chat log, and dumps the docker database to gzip and restores it.
