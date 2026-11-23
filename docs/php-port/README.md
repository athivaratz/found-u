# PHP port notes (P0)

Planning source: `PLAN.md` (not in this repo; the approved copy is the one the owner attached). This directory is the contract for the port onto VisperHost Web Hosting M: static Next export, PHP 8.2 (Slim 4 + PDO), MariaDB, `.htaccess`, Cloudflare Free. No Node, no daemon, no Redis, no SSH on the host.

Branch for the port is `php-dev`. Do not merge this into `main` from these notes.

## Documents

| File | What it is |
|---|---|
| [contract.md](contract.md) | Every `app/api` handler (71) and all 65 `lib/database.ts` exports. Includes the host limits and what replaces them |
| [authz-matrix.md](authz-matrix.md) | RLS policies translated into table × role × operation. 70 policies, 25 tables |
| [scope-cut.md](scope-cut.md) | Files, tables, and env to remove (Discord, setup wizard, Supabase scripts). Not deleted yet |
| [findings.md](findings.md) | Security holes, authz gaps, host incompatibilities, and a few obvious cleanups |
| [baseline/](baseline/) | Visual baseline for P11. No screenshots yet. The reason is in that folder |

## Status

P0 is the inventory and the test scaffold. It does not change how the Next app behaves.

| Piece | State |
|---|---|
| Contract, matrix, cut list, findings | Written from the tree at `0bfec91` |
| Contract tests | `npm run test:contract` (`node --test tests/contract`). The HTTP cases call `BASE_URL` and skip when it is unset |
| Live HTTP against this app | Not run. No Supabase project in this environment. Middleware also redirects every non-setup URL to `/setup` when Supabase env is missing, so a bare `next dev` does not expose the API |
| Playwright screenshots | Not captured. Same reason. P11 should not treat a `/setup` redirect as the UI |

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
```

With a running server that is past the setup guard:

```bash
BASE_URL=http://127.0.0.1:3000 npm run test:contract
```

Unauthenticated probes expect 401 or 400. Routes whose status depends on the database are skipped unless `CONTRACT_DB=1`. A skipped HTTP file is not a pass against PHP. It means this environment could not call the app.
