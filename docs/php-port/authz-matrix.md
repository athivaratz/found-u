# Authz matrix

What the PHP layer must enforce, taken from the RLS policies that remain after every file in `supabase/migrations/` is applied in name order. Later `DROP POLICY` / `CREATE POLICY` wins.

This is not a suggestion to copy Postgres. There is no `service_role` and no RLS on MariaDB. The single DB user can read every row. Each PHP route checks the cell below before it queries.

Roles:

| Role | Who |
|---|---|
| anon | no session |
| owner | session user, and the row is theirs (`id`, `user_id`, `owner_id`, or `finder_user_id` as the cell says) |
| other | session user, row is someone else's |
| admin | `accounts.role = 'admin'` for `accounts.id = session user`. This is `is_admin()` in `20260616153450_fix_is_admin_use_accounts.sql`. Whitelist alone is not admin |
| server | PHP after the route's own check. Replaces Supabase `service_role`, which bypasses RLS on the hosted project. Server is not a free pass. The route still has to match a cell |

`Y` allow, `N` deny, `own` allow only when the condition in the notes holds. `ALL` policies are expanded into select / insert / update / delete.

Policy count: **70** surviving names. 62 on `public`, 8 on `storage.objects`. The plan's "65" is the same set minus a few service-role and storage policies. Enforce these 70, not the round number.

`is_admin()` is `SECURITY DEFINER` and reads `accounts`. On the broken `accounts` grants (see findings) that function is also the thing student updates can corrupt. PHP checks role in the session row it loaded at login, and re-reads it when the session is old.

## P2 schema

MariaDB has one app user. It can read every row, so these cells are PHP's job, not a policy on the table. The schema does not recreate `profiles`, `student_accounts`, `system_config`, `discord_links`, or `discord_verification_sessions`.

`accounts` is the user table. A trigger rejects inserts, deletes, and changes to the locked columns below unless the same connection has run `SET @foundu_allow_privileged = 1`. The PDO connection is not persistent. A route sets the flag for a real password, PIN, ban, or role write, then clears it before the request ends. The trigger is the backstop. The route still must not copy a request body onto those columns.

Locked columns: `role`, `pin_hash`, `current_password_hash`, `school_password_hash`, `student_id`, `is_student_verified`, `ban_status`, `ban_reason`, `banned_at`, `banned_by`, `timeout_until`, `status`, `passkey_credentials`, `email`, `linked_uid`, `grade_level`, `room_number`, `import_batch_id`, `is_registered`, `has_logged_in_once`, `must_change_password`, `auth_methods`, `first_name`, `last_name`, `created_at`.

A student session may update `display_name`, `photo_url`, `nickname`, `shown_name`, and `has_seen_tutorial`.

Select: anon never reads `accounts`. The owner reads the row where `id` is the session account or `linked_uid` is the session account. Another student does not. An admin reads any row. New accounts set `linked_uid` to their own `id` so both checks match.

`sessions`, `rate_limits`, `login_attempts`, `ai_slots`, `ai_credentials`, `change_feed`, and `schema_migrations` are server-only. `ai_credentials` is the encrypted key store. It replaces the wizard rows that used to sit in `system_config`. `app_settings` stays readable by the public settings route and must not hold those keys.

`GET /api/changes` reads `change_feed` (`table_name`, `updated_at`). Triggers bump that row on insert, update, and delete. `MAX(updated_at)` on the source table misses deletes.

## Identity tables

### `accounts` (the live user table)

Policies: `accounts_select_linked`, `accounts_select_admin`, `accounts_update_own`, `accounts_update_admin`. **No `ENABLE ROW LEVEL SECURITY` in the migrations.** The cells are the policy text. Today they are not enforced. PHP enforces them, with the column limits in the notes. That limit is a fix, not a new product rule: a student must not be able to write `role`.

| Op | anon | owner (`id = me`) | other | admin |
|---|---|---|---|---|
| select | N | Y if `linked_uid = me` | N | Y |
| insert | N | N | N | N (server creates accounts) |
| update | N | Y, but only profile fields | N | Y |
| delete | N | N | N | N |

There is no policy for `id = me` when `linked_uid` is null. `getUser` asks for both. PHP select-for-self allows `id = me OR linked_uid = me`. The old `WITH CHECK (id = auth.uid())` would let that same user set `role`. P2 does not. The locked column list is in the P2 section above, and `accounts_bu_guard` enforces it in MariaDB. See findings.

### `profiles` (legacy, do not recreate)

RLS on. `profiles_select` is `USING (true)` with no `TO`, so it applies to every role including anon.

| Op | anon | owner | other | admin |
|---|---|---|---|---|
| select | Y | Y | Y | Y |
| insert | N | Y only if `id = me` and `role = 'user'` and `is_student_verified = false` | N | N |
| update | N | Y only if role, `is_student_verified`, and `student_id` stay the same | N | Y |
| delete | N | N | N | Y |

PHP uses `accounts` instead. Do not publish a `profiles` table.

### `student_accounts` (legacy, do not recreate)

RLS on. Only `service_role_all_student_accounts`. Anon, student, and admin are denied. Runtime code uses `accounts`.

### `passkey_lookup`

RLS on. Only `service_role_all_passkey_lookup`. Clients cannot read it. PHP keeps it server-only: credential id → student id. No student select.

### `admin_whitelist`

`admin_whitelist_all` is `FOR ALL TO authenticated` with `is_admin()` on both sides. Plus `service_role_all_admin_whitelist`.

| Op | anon | student | admin |
|---|---|---|---|
| select / insert / update / delete | N | N | Y |

## Items

### `lost_items`

| Op | anon | owner (`user_id = me`) | other | admin |
|---|---|---|---|---|
| select | Y | Y | Y | Y |
| insert | N | Y if `status = 'searching'` and `user_id = me` | N | Y as server |
| update | N | N | N | Y |
| delete | N | N | N | Y |

### `found_items`

| Op | anon | owner | other | admin |
|---|---|---|---|---|
| select | Y | Y | Y | Y |
| insert | N | Y if `status = 'pending_room_confirm'` and `user_id = me` | N | Y as server |
| update | N | N | N | Y |
| delete | N | N | N | Y |

Public select includes contact JSON. That is what the policy says. Hiding contacts is a product change and is listed in findings; do not do it quietly inside P5 if the pages still read those fields.

`confirm_item_match` / `unmatch_item_match` ignore this matrix because they are `SECURITY DEFINER` and granted to every authenticated user. PHP does not grant that. Only the admin match routes may link or unlink rows, inside a transaction.

## Config

`categories`, `locations`, `contact_types`, `drop_off_locations` share one pattern. Select policy has no `TO` (`USING (true)`). Write policy is `FOR ALL TO authenticated` and `is_admin()`.

| Op | anon | student | admin |
|---|---|---|---|
| select | Y | Y | Y |
| insert / update / delete | N | N | Y |

`app_settings` is the same, plus `service_role_all_app_settings`. The public select is the whole `settings` JSON. `GET /api/public-settings` must keep returning only `comingSoonEnabled` and `comingSoonMessage`.

## Logs and AI usage

### `activity_logs`

| Op | anon | student | admin |
|---|---|---|---|
| select | N | N | Y |
| insert | N | Y (`WITH CHECK (true)`) | Y |
| update / delete | N | N | N |

No update or delete policy. Cleanup is a server job.

### `error_logs`

| Op | anon | student | admin |
|---|---|---|---|
| select | N | N | Y |
| insert | N | Y | Y |
| update | N | N | Y |
| delete | N | N | N |

### `ai_usage`

| Op | anon | owner (`user_id = me`) | other | admin |
|---|---|---|---|---|
| select | N | Y | N | Y |
| insert | N | Y if `user_id = me` | N | N |
| update / delete | N | N | N | N |

`cleanupOldAIUsage` deletes as the user JWT and will fail under these policies. PHP cron deletes as the server, not as the student.

### `agent_chat_logs`

`agent_chat_logs_admin_select`: `SELECT TO authenticated` where the caller is an admin. No insert/update/delete policy. Grants: `service_role` select/insert/delete, `authenticated` select.

| Op | anon | student | admin |
|---|---|---|---|
| select | N | N | Y |
| insert | N | N | N (server writes the log for the signed-in user) |
| update | N | N | N |
| delete | N | N | server, from `DELETE /api/admin/agent-logs` |

A student may read their own row only through `GET /api/agent/chat/sync`, which filters `user_id`. That filter is application code, not an RLS policy. Keep the filter.

### `match_dismissals`

`match_dismissals_admin_all`: all operations for admin. Everyone else N. No student insert.

## NFC

### `nfc_tags`

Also `service_role_all_nfc_tags`.

| Op | anon | owner (`owner_id = me`) | other | admin |
|---|---|---|---|---|
| select | N | Y | N | Y |
| insert | N | Y if `owner_id = me` | N | N |
| update | N | Y | N | Y |
| delete | N | N | N | Y |

`GET /api/nfc/resolve` is server-side and returns a smaller object. Do not add a public select policy that returns `contacts`.

### `nfc_found_reports`

Also `service_role_all_nfc_found_reports`.

| Op | anon | owner (`owner_id`) | finder (`finder_user_id`) | other | admin |
|---|---|---|---|---|---|
| select | N | Y | Y | N | Y |
| insert | N | N | Y if `finder_user_id = me` | N | N |
| update | N | Y | N | N | Y |
| delete | N | N | N | N | Y |

## CMS

### `help_pages`, `help_sections`

Select `USING (true)` for every role, including anon, including `audience = 'admin'`. Write is admin only.

| Op | anon | student | admin |
|---|---|---|---|
| select | Y | Y | Y |
| insert / update / delete | N | N | Y |

### `articles`

`articles_select_published`: `SELECT TO anon, authenticated` where `status = 'published'`. `articles_admin_all`: all operations for admin, so admins also see drafts.

| Op | anon | student | admin |
|---|---|---|---|
| select published | Y | Y | Y |
| select draft | N | N | Y |
| insert / update / delete | N | N | Y |

## Setup and Discord (cut)

### `system_config`

`system_config_setup_status_public_read`: `SELECT TO anon, authenticated` where `id = 'setup_status'`. `system_config_service_role_all`: everything for service role. AI keys live in other ids of this table and are not covered by the public policy.

PHP does not need the wizard row. If a credentials row remains, only the admin AI routes may read it, and only the masked shape from the contract. Students and anon get nothing.

### `discord_links`, `discord_verification_sessions`

RLS on. Only `service_role_all_*`. No client access. Drop both tables.

## Storage (`storage.objects`)

Eight policies. PHP does not implement Supabase Storage. The equivalent is R2: public read of the object URL, write and delete only for the server on behalf of the owner or an admin.

| Policy | Op | Who | Condition |
|---|---|---|---|
| `school_branding_public_read` | select | public | `bucket_id = 'school-branding'` |
| `school_branding_service_write` | all | service | same bucket |
| `item_uploads_public_read` | select | public | `bucket_id = 'item-uploads'` |
| `item_uploads_service_write` | all | service | same bucket |
| `help_assets_public_read` | select | public | `bucket_id = 'help-assets'` |
| `help_assets_service_write` | all | service | same bucket |
| `blog_assets_public_read` | select | public | `bucket_id = 'blog-assets'` |
| `blog_assets_service_write` | all | service | same bucket |

Branding uploads move to the admin settings flow. Item uploads stay owner-or-admin. Help and blog uploads stay admin.

P7 stores that in `storage_objects` (account id, key, purpose). The same account id is the second segment of the key. `Authz::permits` denies the table. The upload route checks the actor, then inserts. Delete allows that account or an admin. Guests do not upload.

## Service-role policies

These are `FOR ALL TO service_role USING (true) WITH CHECK (true)`. On Supabase they are mostly redundant because that role bypasses RLS. They are listed so the count matches the SQL.

`service_role_all_student_accounts`, `service_role_all_profiles`, `service_role_all_app_settings`, `service_role_all_admin_whitelist`, `service_role_all_passkey_lookup`, `service_role_all_nfc_tags`, `service_role_all_nfc_found_reports`, `service_role_all_activity_logs`, `service_role_all_discord_links`, `service_role_all_discord_verification_sessions`, plus `system_config_service_role_all`.

## Tables

25 public tables in the Supabase migrations: `profiles`, `student_accounts`, `passkey_lookup`, `admin_whitelist`, `app_settings`, `lost_items`, `found_items`, `categories`, `locations`, `contact_types`, `drop_off_locations`, `activity_logs`, `error_logs`, `ai_usage`, `nfc_tags`, `nfc_found_reports`, `accounts`, `agent_chat_logs`, `system_config`, `help_pages`, `help_sections`, `articles`, `match_dismissals`, `discord_links`, `discord_verification_sessions`.

P2 keeps 20 of those (`accounts` instead of `profiles` and `student_accounts`, and no `system_config` or `discord_*`) and adds `sessions`, `rate_limits`, `login_attempts`, `ai_slots`, `ai_credentials`, `change_feed`, `schema_migrations`. The added tables are server-only.
