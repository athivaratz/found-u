# Found-U audit

Static review of this repository on 25 September 2026. The goal is to keep a school deployment on free plans (Vercel Hobby, Supabase Free, optional Cloudflare R2, Gemini free tier, OpenRouter free models) and to find defects that can take the system down or expose student data.

No runtime database was queried. A production project may already differ from these migrations if someone changed grants or row-level security in the Supabase dashboard. Each finding says what the repository proves and what should be confirmed on the live database.

| Report | What it covers |
| --- | --- |
| [Free-tier optimization](./free-tier-optimization.md) | Quota burn: realtime connections, AI tokens, database growth, function time, bandwidth |
| [Bugs and failure points](./bugs-and-failure-points.md) | Privilege escalation, data exposure, matching and agent failures, setup reset, auth that does not survive serverless |

Suggested order:

1. Enable row-level security on `accounts` and revoke student access to the match RPCs. These can grant admin or rewrite item status today.
2. Stop writing full agent transcripts and unbounded `ai_usage` rows, and stop opening a realtime channel per lookup table per student. Those are what fill the 500 MB database and the realtime connection cap.
3. Require a real session on vision, NER, and match, and replace in-memory rate limits and passkey challenges. Otherwise free AI quota and logins fail under load or get spent by anonymous callers.
