# Auth

P4 mounts the auth routes on the kernel from `core.md`. The shapes are the ones in `contract.md`. `app/auth/callback` and `verifyOtp` are not routes. There is no email.

## Cookie and bearer

The session cookie is `foundu` on HTTP and `__Host-foundu` on HTTPS. Login, PIN login, passkey login, register complete, and a successful password reset set that cookie and also return `access_token` and `refresh_token`. Both tokens are the same rotated session secret. The current Next client in `lib/student-auth-api.ts` refuses a body that is missing either key. P6 should stop echoing the secret and keep the cookie.

`Authorization: Bearer <token>` is accepted only when the cookie is absent. A bearer request skips CSRF, because the caller already has the secret. If the cookie is present, CSRF still applies, even when a bearer header is also sent.

`SessionService::rotate` runs on login and on a privilege change (password, PIN setup, whitelist promotion). Other browser sessions of that account are revoked. A password reset and an admin account reset revoke every session of the target, including passkey challenges, and the reset response then issues a fresh one.

## What each route does

Public, and they want a Turnstile token when `TURNSTILE_ENABLED=1`:

- `POST /auth/login` and `POST /auth/pin/login`
- `GET /auth/register/lookup` and `POST /auth/register/complete`
- `POST /auth/reset-password` and `POST /auth/reset-password-with-pin`
- `POST /auth/passkey/login`

Password and PIN failures go through `LoginLockout`: 5 per student id per 15 minutes, 20 per IP per hour. The 429 body is the Thai sentence plus `retryAfterMs`, and the response has `Retry-After`. A correct password on a banned or disabled account does not count as a failure. It revokes that account's sessions and answers with the same sentence as a wrong password, so the id cannot be told apart from a miss. The one exception is `needsRegistration`, kept because the login page uses it. See `findings.md`.

PIN login also requires `has_logged_in_once`. Passkey login requires the same, and a credential in `passkey_lookup`.

`GET /auth/device-profile` is public and rate limited to 5 per student id per minute. `GET /auth/register/lookup` uses the same extra window.

Signed-in routes (cookie or bearer): change password, verify password, verify PIN, PIN setup, session status, eligibility, banned, logout, passkey register, passkey sync. Logout sets `revoked_at` on that session row and clears the cookies.

Admin routes: whitelist, create student, import, reset account. A guest is 401. A student is 403. Create and import write through `AccountWriter` with an explicit column list. The request body is never copied onto `role` except the optional `role` field on create, which only accepts `user` or `admin`.

`GET /auth/session-status` is what turns a whitelisted email into `role = admin`. The whitelist row alone is not enough. That promotion rotates the session.

## Passkeys

`web-auth/webauthn-lib` 5.3.15 (`>=5.3.15 <5.4.0`). RP id and origin come from `APP_URL`, including the port, so `http://localhost:8080` works and the origin check is not host-only. The options JSON is written by hand so `@simplewebauthn/browser` sees `rp`, a base64url user id (the raw 5-digit student id), challenge, `pubKeyCredParams` -7 and -257, and `residentKey: required`. The challenge sits on a `sessions` row for 5 minutes and is single use.

Stored credentials match the old app: `credentialId`, `publicKey` (base64url COSE), `counter`, `transports`, plus aaguid and the backup flags. `passkey_lookup` maps the credential id to the student id. Algorithms are ES256 and RS256. Attestation formats accepted are none, packed, apple, android-key, fido-u2f, and tpm.

## What P5 and P6 should call

P5 bans through `AccountWriter::setBan`. That writes the ban columns and revokes every session unless the new status is `none`. Do not update `ban_status` with a normal query. An expired `timeout_until` is treated as active and is not cleared on the request path. The last argument, `$clearCookies`, is true only when the account being banned is the browser that sent the request. An admin ban of someone else leaves the admin's cookies alone. `SessionService::revokeAccount` has the same flag, and the admin reset of another student uses it the same way.

Role changes go through `AccountWriter::setRole`. That is a privileged update of `role` only (`user` or `admin`). It does not revoke sessions. The next request loads `accounts.role` again. `PATCH /admin/users/{id}/role` refuses to demote the caller.

P6 owns the browser. Drop the JSON session secret, drop the bearer fallback, and decide whether `needsRegistration` and the public device-profile names are still worth the enumeration. The PHP routes already set the cookie those screens should use.
