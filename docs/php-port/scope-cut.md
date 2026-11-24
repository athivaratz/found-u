# Scope cut

Remove these in P6 (and the Discord/setup bits they depend on), not in P0. A few modules under `lib/setup/` are still imported by storage, AI credentials, and `lib/database.ts`. Deleting the folder before those call sites move will break the Next app. The list is the target, not a patch for this branch.

## Discord

Directories:

- `discord-bot/`
- `app/api/discord/`
- `app/discord/`
- `lib/discord/`

Files:

- `app/api/discord/verify/route.ts`
- `app/api/discord/bot/members/[discordUserId]/route.ts`
- `app/api/discord/bot/verification-sessions/route.ts`
- `app/api/discord/bot/verification-sessions/[sessionId]/result/route.ts`
- `app/discord/verify/page.tsx`
- `app/discord/verify/verification-panel.tsx`
- `discord-bot/index.mjs`
- `lib/discord/verification.ts`

Package script `discord:bot`. Dependency `discord.js`.

Tables: `discord_links`, `discord_verification_sessions`.

Env (site and bot):

- `DISCORD_BOT_TOKEN`
- `DISCORD_APPLICATION_ID`
- `DISCORD_GUILD_ID`
- `DISCORD_BOT_API_SECRET`
- `DISCORD_VERIFICATION_TOKEN_SECRET`
- `DISCORD_VERIFIED_ROLE_ID`
- `DISCORD_ADMIN_ROLE_ID`
- `DISCORD_ROLE_RULES_JSON`
- `DISCORD_SYNC_INTERVAL_MS`
- `FOUNDU_BASE_URL` (bot only; the site uses `NEXT_PUBLIC_APP_URL` today and `APP_URL` on PHP)

## Setup wizard

Directories:

- `app/setup/` (page, layout, actions, wizard components)
- `lib/setup/`

Also:

- `components/providers/setup-aware-providers.tsx`
- `app/api/setup/status/route.ts`
- `middleware.ts` setup guard (`lib/setup/middleware-guard.ts`). The whole `middleware.ts` goes away in P6, including the Supabase session refresh
- `.env.setup.example`

Table: `system_config`, at least the `setup_status` row and the wizard's use of it. AI credentials currently sit in `system_config` too (`lib/setup/wizard-db.ts`, `app/api/admin/ai-credentials/route.ts`). P2 does not create `system_config`. The encrypted keys go in `ai_credentials` (ciphertext and a 24-byte nonce per key). That table is not readable by students. `app_settings` is still the public settings document and must not hold the keys. There is no old ciphertext to copy, because this port does not migrate data.

Env that exists only for the wizard:

- `SETUP_SECRETS_KEY`
- `POSTGRES_URL`
- `POSTGRES_URL_NON_POOLING`

`hasSupabaseClientEnv` in `lib/setup/db-url.ts` is imported by `lib/database.ts`, `contexts/auth-context.tsx`, blog/help data loaders, and `lib/app-domains.ts`. Replace those checks when the adapter lands. Then delete the file.

Storage helpers in `lib/setup/wizard-db.ts` and bucket constants are used by:

- `app/api/storage/upload/route.ts`
- `app/api/storage/delete/route.ts`
- `app/api/admin/blog/upload/route.ts`
- `app/api/admin/help/upload/route.ts`

Those routes stay. The Supabase bucket fallback inside them does not. P7 writes R2 only.

`lib/setup/credentials-crypto.ts` is used by the AI credentials route and `lib/ai/credentials-resolver.ts`. Replace with `sodium_crypto_secretbox` and `APP_KEY` before deleting it.

## Supabase-only route

- `app/auth/callback/route.ts`

## Scripts tied to Supabase, Postgres, or the wizard

Remove:

- `scripts/convert-help-to-articles.ts` (the old supabase javascript client)
- `scripts/reset-setup-sandbox.ts` (`postgres` and Supabase storage)
- `scripts/dev-setup-sandbox.ts` (local Supabase sandbox)
- `scripts/create-admin.ts` (creates a Supabase auth user through `createBootstrapAdminAccount`)
- `scripts/import-students-csv.ts` (writes through `lib/student-auth-server`)
- `scripts/test-student-login.ts` (hits the current login route; replace with the contract tests)

CSV generators do not open a database. They can stay until someone wants them: `scripts/generate-roster-csv.ts`, `scripts/generate-students-csv.ts`.

`scripts/test-openrouter-response.ts` is a Node script that calls `streamText`. It is not part of the site. It does not run on the host. Leave it out of the PHP tree.

Package scripts to drop with the above: `db:push`, `dev:setup`, `setup:reset`, `create:admin`, `import:students`, `discord:bot`.

## Dependencies the PHP host never runs

Remove from the frontend once the adapter no longer imports them (P6):

- the supabase javascript client and the supabase SSR helper
- `postgres`
- `discord.js`
- `supabase` (the CLI package)

Node stays on the build machine. It does not run on VisperHost. The static export still needs `next`, `react`, and the UI libraries at build time.

## Runtime features to drop even though the files are not all in the folders above

These are specified in `contract.md` and `findings.md`. Short version:

- Realtime subscriptions
- The agent SSE response (replaced by one JSON body, not deleted)
- Next middleware, server actions, `revalidateTag`, edge `ImageResponse`
- `next/image` optimization
- In-memory rate limits and passkey challenges

## Env the PHP app uses instead

From PLAN §4, plus the owner overrides. Names live in `~/foundu/config/.env.php`. Do not hardcode a domain.

- `APP_URL`
- `APP_KEY`
- `DB_*`
- `SCHOOL_AUTH_DOMAIN`
- `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME`, `R2_PUBLIC_BASE_URL`
- `GEMINI_API_KEY` (the Next app calls this `GEMMA_API_KEY`; PHP should accept one name, `GEMINI_API_KEY`, and not require both)
- `OPENROUTER_API_KEY`, `OPENROUTER_MODEL`
- `TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET`
- `AI_MAX_CONCURRENCY`
- rate-limit and search thresholds (`RATE_LIMIT_MAX`, `RATE_LIMIT_WINDOW_MS`, `SEARCH_SIMILARITY_THRESHOLD`, `AGENT_SEARCH_SIMILARITY_THRESHOLD`)

`NEXT_PUBLIC_*` and `SUPABASE_*` and `VERCEL_URL` go away with the static export.

Ambiguity: the plan's env block says `GEMINI_API_KEY`. The current code reads `GEMMA_API_KEY`. One name on PHP is enough. Use `GEMINI_API_KEY`.
