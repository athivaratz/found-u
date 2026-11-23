# Cloudflare Free

This is PLAN §7.1 written as steps. The plan is Free only. Pro features (a full managed ruleset, more than one rate-limit rule, regex in custom rules) are not part of this setup.

Do this after the site answers on the host with a certificate, and before you tell students the domain.

## 1. DNS

Add the domain to Cloudflare (full setup, change the nameservers at the registrar).

Every record that points at the hosting IP is **Proxied** (orange cloud). That includes the apex and `www` if you use it. Do not leave `mail.`, `ftp.`, or `direct.` as DNS-only on that same IP. This site does not send mail. Use the hostname VisperHost gave you for FTP, not a name on this domain.

## 2. SSL

SSL/TLS mode: **Full (strict)**.

Create an Origin CA certificate in Cloudflare (15 years is fine). In DirectAdmin: **SSL Certificates**, paste the certificate and the private key. Do not paste that key into git or into a chat.

Also turn on:

- Always Use HTTPS
- Automatic HTTPS Rewrites
- Minimum TLS 1.2

Turn on HSTS only after you have loaded the real site over HTTPS and you are sure you will stay behind Cloudflare. Start with a max-age of one month.

If you ever pause Cloudflare, visitors will see an untrusted certificate. That is normal for an Origin CA cert. Let's Encrypt is the other option, and it needs `/.well-known/acme-challenge/` to stay reachable. The `.htaccess` already allows that path. Origin CA is the one to use if you can.

## 3. WAF custom rules

Security → WAF → Custom rules. Free allows **5**. There is no regex. Use these expressions as written.

**1. Block scanners** — action Block

```
(starts_with(http.request.uri.path, "/wp-"))
or (http.request.uri.path contains "xmlrpc")
or (http.request.uri.path contains ".env")
or (http.request.uri.path contains "/.git")
or (http.request.uri.path contains "phpmyadmin")
or (ends_with(http.request.uri.path, ".php") and not http.request.uri.path eq "/api/index.php")
```

**2. API calls must carry our header** — action Block

The browser sends `X-Requested-With: foundu` from `apiFetch`. A bare script that only has the URL does not.

```
(starts_with(http.request.uri.path, "/api/") and not any(http.request.headers["x-requested-with"][*] eq "foundu"))
```

**3. Outside Thailand, challenge** — action Managed Challenge

Verified bots (Line, Facebook) still fetch Open Graph tags. Static files under `/_next/` are left alone. If a student is abroad, turn this rule off or they will get a challenge.

```
(ip.src.country ne "TH" and not cf.client.bot and not starts_with(http.request.uri.path, "/_next/"))
```

**4. Auth routes** — action Block

```
(starts_with(http.request.uri.path, "/api/auth/") and (http.user_agent eq "" or (http.request.method ne "POST" and http.request.method ne "GET")))
```

**5. Emergency switch** — action Managed Challenge, **leave this rule disabled**

Turn it on only while the site is being flooded. It challenges every page except `/_next/` and verified bots. That is softer than Under Attack mode for the whole zone.

```
(not starts_with(http.request.uri.path, "/_next/") and not cf.client.bot)
```

Free Managed Ruleset should already be on. Check that it is enabled. The paid Cloudflare Managed Ruleset and OWASP are not on this plan.

## 4. The one rate-limit rule

Free allows **one** rule. It counts per IP, over 10 seconds, and it can block for 10 seconds.

- If the path starts with `/api/`
- Characteristic: IP
- Requests: **60** per 10 seconds
- Action: Block for 10 seconds

60 is the starting point so a school NAT (many students, one public IP) can still load a page. Watch Security Analytics and lower it if one address is abusive. Login is tighter in PHP (10 requests a minute per IP, then the account lock), so this one rule stays on `/api/` rather than only `/api/auth/`.

## 5. Bots

**Bot Fight Mode: off.** It can challenge `fetch` and XHR, and a custom rule cannot skip it. `/api` will break for real browsers if it challenges those calls. Turn it on only during an attack, and turn it off again after. See `runbook.md`.

If the dashboard has "Block AI bots", you can turn that on. It is a separate switch.

## 6. Cache

Browser Cache TTL: **Respect existing headers**.

Cache rules (Free allows 10):

1. URI Path starts with `/_next/static/` → Eligible for cache, Edge TTL 1 year
2. URI Path does not start with `/api/` and the extension is html, or the path ends with `/` → Eligible for cache, Edge TTL 30 minutes
3. URI Path starts with `/api/public-` or `/api/cms/` and the method is GET → Eligible for cache, respect the origin `Cache-Control`
4. URI Path starts with `/api/` → Bypass cache

After every deploy, purge the cache (or purge HTML). Hashed files under `/_next/static/` can stay.

## 7. Turnstile

Create one widget. Mode: **Managed**. Hostnames: the real domain, and `localhost` if you still test in docker.

Put the site key in `TURNSTILE_SITE_KEY` and the secret in `TURNSTILE_SECRET`. Set `TURNSTILE_ENABLED` to `1`. An empty secret turns the check off, which is how the local docker tests log in. Production must have the real secret or bots skip the widget.

The widget is on login, register, the lost and found forms, and the chat composer. The server checks the token. A token lasts 300 seconds and works once.

The keys Cloudflare publishes for testing (`1x00000000000000000000AA` always passes) are not for the live site.

## 8. Refreshing the Cloudflare IP list

`.htaccess` only accepts Cloudflare's addresses, between the lines `BEGIN foundu-cloudflare-ips` and `END foundu-cloudflare-ips`. `foundu/config/cloudflare-ips.php` is the same list, and PHP trusts `CF-Connecting-IP` only when the TCP peer is on that list.

`bin/cron.php` refreshes both files when the last refresh is older than a week. The cron line is in `go-live.md`. You can also run `php ~/foundu/bin/cron.php` once from a machine that has the files and a PHP CLI, then upload the two updated files. Do not add another `Require ip` outside the markers. The updater will refuse the file.

## Warning: REMOTE_ADDR

This lock assumes `REMOTE_ADDR` is still the address of the TCP connection, which is Cloudflare.

If VisperHost already rewrites `REMOTE_ADDR` to the visitor IP (`mod_remoteip`, or LiteSpeed "Use Client IP in Header"), the `Require ip` block sees the visitor, not Cloudflare, and **every visitor gets 403**. Check that before you upload the release. The question is in `go-live.md`. If they already restore the visitor IP, delete the `Require ip` block (keep the rest of the file) and rely on PHP, which still wants `CF-Connecting-IP` together with `CF-Ray` only when you have confirmed the request came through Cloudflare. Do not start trusting `X-Forwarded-For`.

`public_html/.cf-allowlist-off` disables the lock. Docker creates it. Do not upload it.
