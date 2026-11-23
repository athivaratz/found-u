# Visual baseline

P11 compares the static export to screenshots of the current app. This folder is where those images go. It is empty on purpose.

## Why there are no images

This environment has no Supabase project and no Docker Postgres. `middleware.ts` sends every page except `/setup` to `/setup?reason=missing_env` when `NEXT_PUBLIC_SUPABASE_URL` and the anon key are missing. A screenshot of that redirect is the wizard, which the port deletes. It is not a baseline for the student or admin UI.

Playwright was not run. Saving a picture of the setup page would make the later diff lie.

## What to capture when a seeded app is available

Same seed as the API tests. Disable motion. Viewports 1440 and 390. Light and dark. Skip `/setup` and `/discord/verify`.

User: `/`, `/auth/login`, `/auth/register`, `/home`, `/lost`, `/found`, `/tracking`, `/assistant`, `/settings`, `/nfc`, `/blog`, `/help`, `/banned`.

Admin: `/admin`, `/admin/items`, `/admin/moderation`, `/admin/matching`, `/admin/students`, `/admin/users`, `/admin/categories`, `/admin/logs`, `/admin/settings`, `/admin/blog`, `/admin/ai`.

Name files `{route}-{viewport}-{theme}.png`, with the route slashes turned into `__`.

The dynamic pages (`/blog/[slug]`, `/help/[slug]`, `/nfc/t/[tagId]`, `/admin/blog/[id]`) need one real slug from the seed. Do not screenshot the `_` placeholder.
