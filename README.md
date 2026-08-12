# typingclub-slack

Posts a daily **student activity + leaderboard report** from the
edclub / TypingClub teacher portal into a Slack channel, automatically at
**10:00 PM IST (Asia/Kolkata)** every day.

```text
edclub / TypingClub
        ↓  fetch all active students (paginated)
        ↓  fetch per-student stats + scoreboard (concurrency-limited, retried)
        ↓  normalize & rank
        ↓  build Slack Block Kit report
        ↓
Slack channel (via Incoming Webhook)
```

## Architecture

```text
src/
├── index.js            entry point: `npm start` (scheduler) / `npm run report` (once)
├── config.js           env loading + validation (dotenv)
├── collect.js          orchestration: roster → per-student data → normalized objects
├── report.js           one full report run (collect → build → deliver)
├── scheduler.js        node-cron daily trigger, timezone-aware
├── edclub/
│   ├── client.js       authenticated HTTP client, token refresh, error typing
│   ├── students.js     GET /students/ with full pagination
│   ├── stats.js        POST typing_student_current_stats (empty JSON body)
│   ├── overview.js     POST typing_student_overview (see "API limitations")
│   └── progress.js     GET student-progress + per-course aggregation
├── slack/
│   └── client.js       webhook posting, multi-message chunking
├── reports/
│   ├── activity.js     Section 1 — who practiced when (🟢🟡🔴)
│   ├── leaderboard.js  Section 2 — ranked scoreboard (🥇🥈🥉)
│   └── format.js       shared Block Kit helpers (pure functions)
└── utils/
    ├── duration.js     1432 → "23m 52s"
    ├── dates.js        UTC → IST conversion and labels
    ├── retry.js        exponential backoff for retryable errors
    └── logger.js       timestamped logs in the report timezone
tests/                  node:test suite (`npm test`)
```

Every raw API response is normalized into:

```js
{ id, name, lastActivity, stars, score, durationSeconds,
  progressPercent, accuracy, wpm, practiceTodaySeconds, failed }
```

## The edclub API — verified behavior

These were confirmed against the live API (not assumed). All endpoints live
under `{EDCLUB_BASE_URL}/drf/1.1.1`.

| Endpoint | Method | Notes |
|---|---|---|
| `/students/?source=1&is_active=true&…` | `GET` | Paginated (`count`/`next`); the client follows `next` until exhausted, so any roster size works. `last_activity_date` is a **UTC ISO timestamp** (or `null`). |
| `/students/{id}/typing_student_current_stats/` | `POST`, body `{}` | GET returns **405** (`Allow: POST, OPTIONS`). The body must be an **empty JSON object** — any non-empty body causes a 500. |
| `/students/{id}/student-progress/` | `GET` | Despite the 405 seen in early exploration (that came from the POST-only stats endpoints above), this is a plain GET. Paginated; one record per enrolled course with `score`, `stars`, `secs`/`msecs`, `progress_percent`, `avg_accuracy` (string `"95%"`), `avg_wpm` (string `"22"`). |
| `/students/{id}/typing_student_overview/` | `POST`, body `{"period": …}` | Accepted but always returned `[]` in probing — see "API limitations". |
| `/auth/refresh_tokens/` | `POST` | Refresh token sent as the `rt` cookie **and the JSON body must name the tenant**: `{"domain": "finalapps"}` (first hostname label) — without it the server answers `400` with an empty array. Response: an **array of account objects**, the access token in each entry's `token` field (pick the `is_student: false` entry). Every refresh also rotates the `rt` via `Set-Cookie` (leniently — old values keep working for a while). |

Two hard-won client rules, both enforced in `src/edclub/client.js`:

1. **The `Authorization` header takes the raw token** — `Bearer <t>` and
   `Token <t>` are rejected with `"Bad Token."`.
2. **Never send a browser-like `User-Agent`.** Cloudflare fingerprints the TLS
   stack; a browser UA on a non-browser client triggers the "Just a moment"
   challenge. Node's default fetch UA passes. (This is also why `curl` fails
   against this API.)

## Installation

Requires **Node.js 18+** (native `fetch`).

```bash
git clone <your-repo>
cd typingclub-slack
npm install
cp .env.example .env   # then fill it in
```

## Environment variables

| Variable | Required | Description |
|---|---|---|
| `EDCLUB_BASE_URL` | no | Your edclub school host (no trailing path). A value that already ends in `/drf/1.1.1` is handled. |
| `EDCLUB_AUTH_TOKEN` | yes* | Access token, raw value (no prefix). |
| `EDCLUB_REFRESH_TOKEN` | recommended | The `rt` cookie value; enables automatic token refresh. *At least one of the two tokens must be set. |
| `SLACK_BOT_TOKEN` | one of the two | Slack app bot token (`xoxb-…`) with the `chat:write` scope. Used with `SLACK_CHANNEL`. |
| `SLACK_CHANNEL` | with bot token | Target channel **ID** (e.g. `C0BPE7QAYJE`), not the channel name. |
| `SLACK_WEBHOOK_URL` | one of the two | Incoming Webhook URL (alternative to the bot token; the webhook determines the channel). Neither set → the report is printed to the console only. |
| `TIMEZONE` | no | Default `Asia/Kolkata`. Used for scheduling **and** all displayed dates/times. |
| `REPORT_HOUR` / `REPORT_MINUTE` | no | Default `22` / `0` → 10:00 PM. |
| `CONCURRENCY` | no | Parallel per-student requests, 1–10, default 3. |

## Authentication setup

The service reuses your authenticated teacher browser session's tokens —
**your edclub password is never stored anywhere**.

1. Sign in to your edclub teacher portal.
2. Open Chrome DevTools → **Network** tab, reload, and click any request to a
   `/drf/1.1.1/...` URL.
3. Under **Request Headers**, copy the `Authorization` value (a single opaque
   string) into `EDCLUB_AUTH_TOKEN`.
4. DevTools → **Application** → **Cookies** → your edclub host, copy the
   `rt` cookie value into `EDCLUB_REFRESH_TOKEN`.

Access tokens are short-lived (they expire within hours), so
`EDCLUB_REFRESH_TOKEN` is effectively required for unattended operation. With
it set, the client automatically calls `POST /auth/refresh_tokens/` on the
first 401 and replays the request. The server rotates the `rt` on every
refresh; the service adopts the newest value in memory and writes both tokens
back to `.env` (best-effort — skipped on hosts without a `.env` file, which
is fine because old `rt` values remain usable for a while).

> **If the refresh token itself expires** (400 from the refresh endpoint),
> sign in again and re-copy both values. This is a deliberate design choice:
> the alternative — automating a headless browser login with your password —
> would require storing the password, which this project refuses to do.

## Slack setup

Two delivery options; configure exactly one.

**Option A — bot token + channel ID (recommended).** Lets you target any
channel by ID and switch channels without recreating anything:

1. Go to <https://api.slack.com/apps> → **Create New App** → *From scratch*.
2. **OAuth & Permissions** → *Scopes* → add the `chat:write` bot scope.
3. **Install to Workspace**, then copy the **Bot User OAuth Token**
   (`xoxb-…`) into `SLACK_BOT_TOKEN`.
4. Put the channel **ID** into `SLACK_CHANNEL` (channel → open details → the
   `C…` ID at the bottom; a name like `#reports` will not work).
5. In the channel, run `/invite @YourBot` — without this, posting fails with
   `not_in_channel`.

**Option B — Incoming Webhook.** Same app dashboard → enable **Incoming
Webhooks** → **Add New Webhook to Workspace** → pick the channel → copy the
`https://hooks.slack.com/...` URL into `SLACK_WEBHOOK_URL`. The channel is
fixed at webhook creation time.

Both the bot token and the webhook URL are secrets — they are never logged by
this service and must never be committed.

## Running

```bash
npm run report       # generate one report now: prints it AND posts to Slack
npm run report:dry   # generate + print only, never posts (for testing)
npm start            # long-running service; posts daily at 22:00 IST
npm test             # run the test suite
```

If `SLACK_WEBHOOK_URL` is unset, `npm run report` prints the report locally
and says so — useful before the webhook exists.

## How scheduling works

`src/scheduler.js` uses `node-cron` with an explicit timezone:

```js
cron.schedule("0 22 * * *", runReport, { timezone: "Asia/Kolkata" });
```

The expression is evaluated **in Asia/Kolkata**, so the host machine's
timezone/DST rules don't matter. The process must stay running (see
Deployment). A failed scheduled run logs the error and waits for the next day
— it never crashes the service.

## Report content & rules

**Section 1 — Student Activity.** Every active student, most recently active
first. `last_activity_date` (UTC) is converted to IST: 🟢 practiced today,
🟡 yesterday, 🔴 older, `Never practiced` for null.

**Section 2 — Scoreboard.** Ranking rule (documented in
`src/reports/leaderboard.js`): the API exposes **no official rank field**, so
per spec students sort by **score desc, then stars desc**, then name for
determinism. Duration uses the authoritative `secs` field (`msecs` is the
same value ×1000). Progress uses `progress_percent` from student-progress
(fallback: `coverage_current` from current-stats — both are "% of course
covered", the same concept). Stars/score/duration are summed across a
student's courses; progress/accuracy/WPM come from the course with the most
practice time, since averaging percentages across different courses would be
meaningless.

**Failure isolation.** One student's API failure never kills the report: the
student appears with `⚠️ Data unavailable`, everyone else reports normally,
and failed IDs are logged at the end. Retryable errors (429, 5xx, network)
get up to 3 exponential-backoff retries; 401/403 are never retried (401
triggers one token refresh instead).

**Long rosters.** The report is Block Kit; sections are packed under Slack's
3000-char block limit and split across multiple webhook messages when they
exceed the per-message block limit.

## Deployment

Any always-on Node host works (Render, Railway, Fly.io, a VPS…). The service
must run continuously so the 10 PM trigger fires.

**Render (background worker)** — repo → New **Background Worker**, build
`npm install`, start `npm start`, add the env vars in the dashboard.

**Railway** — new project from repo; set env vars in Variables; start command
`npm start`.

**Fly.io** — `fly launch` (no HTTP service needed), `fly secrets set
EDCLUB_AUTH_TOKEN=... EDCLUB_REFRESH_TOKEN=... SLACK_WEBHOOK_URL=...`, deploy
with `npm start` as the process command.

**Plain VPS** — run under a supervisor, e.g.
`pm2 start src/index.js --name typingclub-slack`.

In all cases: configure secrets through the platform's environment settings,
never commit `.env`. Note that free tiers that **sleep on inactivity will
miss the 10 PM run** — use an always-on worker/instance type. If your
platform only offers cron-style execution, schedule `npm run report` daily at
22:00 IST instead of keeping `npm start` alive.

## Troubleshooting

| Symptom | Cause / fix |
|---|---|
| `401 Access Token Expired` | Access token aged out. Set `EDCLUB_REFRESH_TOKEN` for auto-refresh, or copy a fresh `EDCLUB_AUTH_TOKEN` from DevTools. |
| `Token refresh failed (HTTP 400)` | Refresh token expired/invalid — sign in again and re-copy both tokens. |
| `403 "Bad Token."` | The token was pasted with a `Bearer`/`Token` prefix or extra whitespace — use the raw value. |
| `Cloudflare challenge` error | Something is sending browser-like headers, or the host IP is being challenged. Don't add a User-Agent; try another network/host. |
| `405 Method not allowed` | You're calling a stats endpoint with GET — they're POST-only (see the API table). |
| Report prints but doesn't post | No Slack credentials configured: need `SLACK_BOT_TOKEN` + `SLACK_CHANNEL`, or a real `https://hooks.slack.com/` `SLACK_WEBHOOK_URL` (placeholders are ignored on purpose). |
| `Slack API error: not_in_channel` | Invite the bot to the channel: `/invite @YourBot`. |
| `Slack API error: channel_not_found` | `SLACK_CHANNEL` must be the channel **ID** (`C…`), not the `#name`. |
| Nothing posts at 10 PM | The process isn't running at that time (sleeping free tier?) — see Deployment. |

## API limitations

- **Undocumented API.** All behavior above was verified empirically against a
  live authenticated session on 2026-08-11; edclub may change it without
  notice. Every quirk is documented next to the code that depends on it.
- **`typing_student_overview`** accepts `POST {"period": "day"|"week"|…}` and
  returns HTTP 200, but returned an empty array for every payload variant
  probed — the portal UI sends additional undocumented filter parameters. The
  daily report doesn't need it (students + current-stats + student-progress
  cover every reported field). `src/edclub/overview.js` explains how to
  capture the exact browser payload if you ever need this data.
- **Token refresh** is fully verified live (2026-08-12): `rt` cookie +
  `{"domain": …}` body → array of accounts with `token` fields, rotated `rt`
  in `Set-Cookie`. Rotation is lenient (old `rt`s keep working for a while),
  so multiple consumers (browser + service + n8n) can share a session without
  locking each other out.
- **Cloudflare** fronts the API and will challenge clients that look
  "assembled" (browser UA on non-browser TLS). The client deliberately sends
  minimal headers.

## Security considerations

- No passwords, tokens, cookies, or webhook URLs in source code or logs —
  tokens live only in `.env`/platform secrets; log lines contain student
  names/IDs at most, never raw API dumps.
- Only non-sensitive student fields are read (id, name, activity, scores);
  sensitive roster fields are dropped at the API boundary
  (`src/edclub/students.js`).
- `.gitignore` excludes `.env` and `.env.*` (except `.env.example`).
- **If a credential is ever printed or committed: rotate it immediately**
  (sign out/in for edclub tokens; regenerate the Slack webhook) — deleting
  the log/commit is not enough.
