# Load, on a 1 CPU / 1 GB container

Measured against the docker web container with `cpus: 1` and `mem_limit: 1g` (`docker-compose.limits.yml`). The client was PHP on the same machine, talking to `127.0.0.1:8080`. That is a loopback number. It is not a VisperHost number.

The flood is `tools/load.php` (8 seconds, 4 concurrent requests, login at 2). A second pass, after restarting PHP so APCu forgot the previous denials, sent requests one at a time and stopped before the rate limit. Both are below.

## One request at a time

| Target | n | result | p50 | p95 |
|---|---:|---|---:|---:|
| `GET /` | 40 | 200 | 0.4 ms | 1.0 ms |
| `GET /api/changes` with `If-None-Match` | 20 | 304 | 2.9 ms | 4.8 ms |
| `GET /api/search?type=lost&q=กระเป๋า` | 20 | 200 | 3.3 ms | 4.2 ms |
| `GET /api/lost-items/{id}` | 20 | 200 | 3.0 ms | 3.3 ms |
| `POST /api/auth/login` (right password) | 4 | 200 | 141 ms | 149 ms |

Login is the slow one because Argon2id asks for 64 MB. Everything else is a small query. The database had one lost item and the schema, not a year of reports.

## Eight seconds, four at a time

| Target | requests | rps | p50 | p95 | what came back |
|---|---:|---:|---:|---:|---|
| `GET /` | 42680 | 5328 | 0.3 ms | 0.6 ms | 200 for all of them |
| `GET /api/changes` (ETag) | 5204 | 650 | 2.2 ms | 61 ms | 304 × 119, then 429 |
| `GET /api/search` | 5231 | 654 | 2.2 ms | 62 ms | 429 for all of them. The bucket was already full |
| `GET /api/lost-items/{id}` | 5186 | 648 | 2.2 ms | 62 ms | 200 × 120, then 429 |
| `POST /api/auth/login` | 4271 | 534 | 1.8 ms | 2.9 ms | 200 × 10, then 429 |

The p50 on the flood is the 429, which is cheap. It is not the cost of a search. The limiter is 120 API requests a minute per IP and 10 auth requests a minute per IP. Past that, the box is mostly saying no.

## What this does not say about the host

A static file at 5000 requests a second is Apache on loopback with nothing else running. Shared hosting will not do that. The CPU is shared, the disk is shared, and the request has already been through Cloudflare. A page that is 0.4 ms here can be tens of milliseconds there, and that is still fine for a school.

The part that matters is the limiter and Argon2id. One IP, even a whole classroom behind one NAT, gets about two API requests a second sustained, and ten login attempts a minute. A botnet that is not stopped by Cloudflare will spend its time on 429s. That is the point of the limit. It also means a load test against the real host is both useless and against the host's rules. Do not run `tools/load.php` or `tools/attack.php` at VisperHost.

A small VPS with the same PHP would feel like the sequential numbers above, until the database grows. This shared plan will feel slower than that, mostly on login and on the first uncached page, and it will fall over only if Cloudflare is not in front or the one rate-limit rule is turned off. PLAN §5 is still the reason a VPS is the calmer option if the school later wants headroom. The Free Cloudflare plan plus these PHP limits is what this port is built for.
