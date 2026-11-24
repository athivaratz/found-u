# Storage

P7 signs Cloudflare R2 URLs in PHP. The browser uploads and deletes the bytes. PHP does not read the file, so a 10MB photo never sits in a shared-hosting worker.

There is no `aws-sdk-php`. `Foundu\Storage\SigV4` is the query-string form of Signature Version 4, checked against the published S3 GET examples. The payload line is `UNSIGNED-PAYLOAD`. `content-type` and `content-length` are signed on PUT, so the browser cannot swap the type or the size after the URL is issued. A script cannot set `Content-Length` itself; the browser sets it from the body, and that value has to match what was signed.

## Routes

| Method | Path | Who | Body | Result |
|---|---|---|---|---|
| POST | `/api/storage/upload` | signed-in user | `{ purpose, contentType, contentLength }` | presigned PUT |
| POST | `/api/storage/delete` | owner or admin | `{ path }` or `{ url }` | `{ success, deleteUrl, path }` |
| POST | `/api/admin/blog/upload` | admin | `{ contentType, contentLength }` | same presign shape |
| POST | `/api/admin/help/upload` | admin | `{ contentType, contentLength }` | same presign shape |

`purpose` on `/api/storage/upload` is `avatar`, `found`, or `branding`. `blog` and `help` are only the two admin routes. A guest is 401. A student asking for branding, blog, or help is 403. A missing or bad CSRF token is 403 `csrf`.

The old multipart body is rejected by the JSON middleware (`415`). The editors and `lib/storage.ts` ask for a URL, then `PUT` the file to R2 with `credentials: "omit"`. Delete does the same with the `deleteUrl` from the API. That URL is a `DELETE`. Using it as a GET fails the signature.

`backend` is always `r2`. A bucket that is not configured, a bad name, or an `http://` API host when `APP_ENV` is not `local` is 503 `storage_unconfigured`. The message does not say which setting is missing.

## Keys and ownership

The client does not choose the object name. PHP builds:

```text
{prefix}/{accountId}/{32 hex}.{ext}
```

| Purpose | Prefix | Who may ask | Size |
|---|---|---|---|
| `avatar` | `avatars/` | that account | 10MB |
| `found` | `found-items/` | that account | 10MB |
| `branding` | `branding/` | admin | 10MB |
| `blog` | `blog/` | admin | 5MB |
| `help` | `help/` | admin | 5MB |

The extension comes from the type: jpeg, png, webp, gif. SVG and anything else is 400. The old found-item folder was a tracking code the browser picked, and the item row does not exist yet when the photo is uploaded. The folder is now the account id.

Ownership is that account id in the key, and the same id in `storage_objects`. Delete loads the row, checks the two ids match, then allows the owner or an admin. A path with `..`, a URL on another host, or a key we never issued is refused. The row stays after the URL is issued, so a failed browser DELETE can be retried until the URL expires (120 seconds). The PUT URL lasts 300 seconds.

`storage_objects` is not in `change_feed` and `Authz::permits` denies it. The route writes the row after its own check.

Presigns count on `Buckets::presign($config)`, which is `account_presign`, default 20 per hour per account (`RATE_LIMIT_PRESIGN_PER_HOUR`). The account id is the limiter subject. One account hitting the cap does not block another. Deletes do not use that bucket. The IP limit still applies.

## Anonymous uploads

None. A guest is 401 before a URL exists, including when the body carries `turnstileToken`. Turnstile is not called. A later route that lets a guest upload has to verify Turnstile before it signs anything.

A signed-in upload does not ask for Turnstile. Login and register still do.

## Env

`foundu/config/.env.php.example` (empty values, chmod 600 on the host):

| Key | What |
|---|---|
| `R2_ACCOUNT_ID` | Cloudflare account id. Used only when `R2_ENDPOINT` is empty |
| `R2_ACCESS_KEY_ID` | R2 S3 access key |
| `R2_SECRET_ACCESS_KEY` | R2 S3 secret |
| `R2_BUCKET_NAME` | Bucket, DNS-style name |
| `R2_PUBLIC_BASE_URL` | Origin of the public object URL, no path and no trailing slash. `https://` in production |
| `R2_ENDPOINT` | Optional. Empty means `https://<account id>.r2.cloudflarestorage.com`. Local MinIO sets `http://minio:9000` |
| `R2_REGION` | Optional. Empty means `auto`, which is what R2 expects. MinIO uses `us-east-1` |

The public URL is `{R2_PUBLIC_BASE_URL}/{key}`. The signed URL is the API host plus `/{bucket}/{key}`. Those hosts are different on Cloudflare: the API host is `*.r2.cloudflarestorage.com`, and the public host is the r2.dev domain or a custom domain. Do not put the bucket name in the public base.

## CORS on the bucket

The browser sends the PUT and the DELETE to the **API** host, not to the public base. Add the real site origin (the `APP_URL` host) before go-live. Local browser tests against R2 also need the dev origins. Methods are PUT, GET, HEAD, DELETE. `Content-Type` has to be allowed or the preflight fails. `Content-Length` is listed too; some browsers omit it from the preflight because script code cannot set it.

```json
[
  {
    "AllowedOrigins": ["https://YOUR_DOMAIN"],
    "AllowedMethods": ["PUT", "GET", "HEAD", "DELETE"],
    "AllowedHeaders": ["content-type", "content-length"],
    "ExposeHeaders": ["ETag"],
    "MaxAgeSeconds": 3600
  }
]
```

R2 dashboard: bucket, Settings, CORS policy. Paste the JSON. Add `http://localhost:3000` only on a bucket you use for development.

MinIO in compose is profile `minio` (`make test-minio`). It is not part of `docker compose up`. The test signs a PUT, writes four bytes, reads them back, then DELETEs. Credentials in that compose file are the local root user, not a production key.

## What P11 and P12 still have to do

- P11: `img-src` in the CSP is `https:` until the public host is known. Tighten it to `R2_PUBLIC_BASE_URL` when the domain exists. The upload UI does not add a widget; there is no anonymous upload.
- P12: create the bucket CORS rule above for the real origin, and put the six R2 values in `~/foundu/config/.env.php` (mode 600). Leave `R2_ENDPOINT` and `R2_REGION` empty for Cloudflare. Confirm the host allows outbound HTTPS only if you later add a server-side copy; this phase does not call R2 from PHP.
- Objects whose browser PUT never happened stay as rows. A daily cleanup can drop old rows and, if you add a server-side delete later, the matching R2 keys. Deleting an account drops the row (foreign key) and leaves the object until that cleanup.
- `lib/storage.ts` still takes a path string so the existing screens do not change shape. Only the prefix is read. The filename in that path is ignored.
