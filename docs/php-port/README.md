# PHP port notes (P0)

Planning source: `PLAN.md` (not in this repo; the approved copy is the one the owner attached). This directory is the contract for the port onto VisperHost Web Hosting M: static Next export, PHP 8.2 (Slim 4 + PDO), MariaDB, `.htaccess`, Cloudflare Free. No Node, no daemon, no Redis, no SSH on the host.

Branch for the port is `php-dev`. Do not merge this into `main` from these notes.

## Documents

| File | What it is |
|---|---|
| [contract.md](contract.md) | Every `app/api` handler (71) and all 65 `lib/database.ts` exports. Includes the host limits and what replaces them |
| [authz-matrix.md](authz-matrix.md) | RLS policies translated into table × role × operation. 70 policies, 25 tables |
| [scope-cut.md](scope-cut.md) | Files, tables, and env that left with Discord, the setup wizard, and the Supabase client |
| [findings.md](findings.md) | Security holes, authz gaps, host incompatibilities, and a few obvious cleanups |
| [core.md](core.md) | P3 shared layer: request order, cookies, CSRF, limits, cron |
| [auth.md](auth.md) | P4 auth routes: login, register, passkeys, ban, sessions |
| [data-api.md](data-api.md) | P5 data routes. P6 rewrites `lib/database.ts` against this |
| [storage.md](storage.md) | P7 R2 presign, keys, limits, and the bucket CORS rule |
| [ai.md](ai.md) | P8 search, matching, and the AI pipeline |
| [cms.md](cms.md) | P10 articles, help, NFC, geocode, cron, and what P11 must keep for meta tags |
| [baseline/](baseline/) | Visual baseline for P11. No screenshots yet. The reason is in that folder |

## Status

P0 is the inventory. P1 is the local Apache and MariaDB stack. P2 is the schema. P3 is the shared PHP core. P4 is auth. P5 is the data API. P6 is the browser adapter: `lib/database.ts` and `lib/api-client.ts` talk to `/api`, the session is only a cookie, and the setup wizard, Discord, and the Supabase client are gone. `next dev` proxies `/api` when `FOUNDU_API_ORIGIN` is set. P7 signs R2 uploads in PHP; the browser PUTs the file. P8 is search, matching, and the AI calls. P10 adds article and help writes, NFC, the Nominatim proxy, the meta-tag front for `/blog` and `/help`, and the rest of `bin/cron.php`. P11 still owns the static export and has to keep the rewrites described in `cms.md`.

| Piece | State |
|---|---|
| Contract, matrix, cut list, findings | Written from the tree at `0bfec91` |
| Contract tests | `npm run test:contract` (`node --test tests/contract`). The HTTP cases call `BASE_URL` and skip when it is unset |
| Live HTTP against this app | PHPUnit covers the API. The Next app calls it through the dev proxy |
| Screenshots | `docs/php-port/screenshots/p6/`. The P0 folder still has no pictures, because the old middleware only showed `/setup` |

Counts, for the plan's round numbers: 56 files under `app/api` plus `app/auth/callback` (the plan's 57), 71 handlers, 65 database exports, 25 tables, 70 RLS policies (the plan said 65).

## Owner decisions that override PLAN §12 and §13

- Own domain, set later. `APP_URL`. Do not hardcode a host.
- Turnstile, managed, on login and register.
- Keep the AI agent. It returns one JSON body, not a stream.
- Challenge visitors from outside Thailand at Cloudflare.
- Cloudflare Free only.
- No data migration. New schema and seed.
- Discord and the setup wizard are cut.

## Host replacements (short)

Realtime becomes polling. The agent stream becomes one JSON response. Middleware, server actions, ISR, and the edge OG image go away. Uploads are presigned in PHP. Rate limits and passkey challenges move to MariaDB. Cron is a DirectAdmin panel job, `php ~/foundu/bin/cron.php`. Details are in `contract.md` and `findings.md`.

## Tests

```bash
npm run test:contract
make test
```

`make test` applies `foundu/migrations` to an empty MariaDB, applies it again, imports `all.sql` twice, runs the P1 smoke checks, migrates the dev database, then runs PHPUnit (`foundu/bin/phpunit.sh`) against `foundu_phpunit`. `make migrate` and `make seed` are the local schema and the starter categories.

With a running server that is past the setup guard:

```bash
BASE_URL=http://127.0.0.1:3000 npm run test:contract
```

Unauthenticated probes expect 401 or 400. Routes whose status depends on the database are skipped unless `CONTRACT_DB=1`. A skipped HTTP file is not a pass against PHP. It means this environment could not call the app.
