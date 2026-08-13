# typingclub-slack

An **n8n workflow** that posts a daily **Last Activity + TypingClub Scoreboard**
report from the [edclub / TypingClub]() teacher
portal into a Slack channel, every day at **10:00 PM IST (Asia/Kolkata)**.

```text
Schedule (22:00 IST)
   → refresh edclub access token   (POST /auth/refresh_tokens/)
   → fetch all active students     (GET /students/, paginated)
   → per student: current stats + scoreboard   (concurrency 3, retries)
   → normalize, rank, format        (one Code node)
   → post to Slack                  (chat.postMessage, as you)
```

## Files

| File | Purpose |
|---|---|
| `typingclub-report.workflow.json` | The n8n workflow. **Secret-free** — reads all secrets from env vars, so it is safe to commit and push. |
| `.env` | Your local copy of the values (gitignored). A notepad + the source you copy into your n8n host's environment. |
| `.env.example` | Blank template of the above. |

## n8n environment variables

This workflow contains **no secrets** — it reads them from the n8n host's
environment via `{{ $env.* }}` expressions. Set these on your n8n instance
(its own `.env`, docker `environment:`, or systemd unit), then **restart n8n**:

| Env var | Value |
|---|---|
| `EDCLUB_REFRESH_TOKEN` | edclub `rt` cookie (the refresh seed) |
| `SLACK_CHANNEL` | target channel ID, e.g. `C0BPE7QAYJE` |
| `SLACK_XOXC` | Slack `xoxc-` token |
| `SLACK_XOXD` | Slack `d` cookie value (`xoxd-…`) |

Self-hosted n8n allows `$env` in expressions by default; leave
`N8N_BLOCK_ENV_ACCESS_IN_NODE` unset (or `false`).

## Setup

1. Set the four environment variables above on your n8n host and restart n8n.
2. **Import** `typingclub-report.workflow.json` (Workflows → Import from File).
3. **Execute Workflow** once to test → then toggle **Active**.

Pick **one** runner only — the edclub refresh token rotates on every use, so two schedulers sharing it would invalidate each other.

## Slack auth (posting as you, no Slack app)

This posts as your own user by reusing your logged-in browser session — no app
to create. From a logged-in `app.slack.com` tab, DevTools (F12):

- **Token** (`xoxc-…`) — Console tab:
  ```js
  Object.values(JSON.parse(localStorage.localConfig_v2).teams).forEach(t => console.log(t.token))
  ```
- **Cookie** (`xoxd-…`) — Application → Cookies → `app.slack.com` → value of the cookie named `d`.

Both are needed together and are **session-scoped**: signing out (or "Sign out
of all other sessions") invalidates them. When posting starts failing with
`not_authed` / `invalid_auth`, re-copy both into the `SLACK_XOXC` / `SLACK_XOXD`
env vars on the n8n host and restart n8n. There is no automatic refresh for
these (unlike the edclub token) — that is the trade-off for not using a Slack app.

## edclub auth

- `EDCLUB_AUTH_TOKEN` — an access token (raw value; no `Bearer`/`Token` prefix).
- `EDCLUB_REFRESH_TOKEN` — the `rt` **cookie** value (DevTools → Application →
  Cookies → `*.edclub.com` → `rt`). This is what the workflow's Config
  node `refreshTokenSeed` needs.

The workflow refreshes the short-lived access token itself on each run and
persists the rotated `rt` in n8n static data, so after the first run it is
self-sustaining. If the refresh ever 400s, sign in again and paste a fresh `rt`
into the Config node.

## Verified edclub API behavior

All confirmed against the live API (not assumed):

- `GET /students/?source=1&is_active=true&…` — paginated via `next`; `last_activity_date` is a **UTC** ISO timestamp (converted to IST for display).
- `POST /students/{id}/typing_student_current_stats/` — **POST-only**, body must be an empty `{}` (any other body → 500).
- `GET /students/{id}/student-progress/` — plain GET; per-course records with `score`, `stars`, `secs`/`msecs`, `progress_percent`, `avg_accuracy`/`avg_wpm` (as strings).
- `POST /auth/refresh_tokens/` — `rt` cookie **plus** JSON body `{"domain":"<subdomain>"}` (empty body → 400). Response is an **array of accounts**; the access token is the teacher entry's `token`.
- The `Authorization` header uses the **raw** token, and requests must **not** send a browser-like `User-Agent` (Cloudflare challenges spoofed UAs). n8n's HTTP node defaults are fine.

## Report format & rules

- **Last Activity** — every active student, first name only, most recent first. 🟢 practiced today (IST) · 🟡 yesterday · 🔴 older / never.
- **Scoreboard** — ranked **score desc, then stars desc** (the API exposes no rank field). Duration uses the authoritative `secs`; progress uses `progress_percent` (fallback: current-stats `coverage`). Stars/score/time are summed across a student's courses.
- **Failure isolation** — one student's API error doesn't stop the report; they're marked "data unavailable" and the rest post normally. 429/5xx/network get retried with backoff; 401 triggers one token refresh.

## Security

- No tokens or cookies in committed files — the workflow references `$env.*`, and the actual values live only in your n8n host's environment and your gitignored `.env`.
- The Slack `xoxc` token grants **full access to your Slack account** — if it leaks, revoke via Slack → **Sign out of all other sessions**.
- `.gitignore` excludes `.env`, `*.local.json`, and `*.har`. Before your first push, double-check `git status` shows no `.env`.
