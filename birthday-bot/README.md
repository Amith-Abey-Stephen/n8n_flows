# birthday-bot

An **n8n workflow** that reads names and DOBs from a Google Sheet and posts
`🎉🎂 Happy Birthday <name>` to Slack every day at **00:00 IST (Asia/Kolkata)** —
exactly midnight at the start of that person's birthday.

```text
Schedule (00:00 IST)
   → read Google Sheet              (Name, DOB columns)
   → filter today's birthdays       (day/month match, Asia/Kolkata)
   → post to Slack                  (chat.postMessage, as a Slack bot)
```

If nobody has a birthday today, nothing is posted.

## Files

| File | Purpose |
|---|---|
| `birthday.workflow.json` | The n8n workflow. **Secret-free** — reads secrets from env vars, safe to commit. |
| `.env` | Your local copy of the values (gitignored). |
| `.env.example` | Blank template of the above. |

## Spreadsheet

| Column | Format | Example |
|---|---|---|
| `Name` | Full name | `Amith Abey Stephen` |
| `DOB` | `DD/MM/YYYY` | `26/05/2005` |

Only day and month are compared (year is ignored).

## n8n environment variables

Set these on your n8n host, then **restart n8n**:

| Env var | Value |
|---|---|
| `BIRTHDAY_SHEET_ID` | Spreadsheet ID from the URL (`…/d/<THIS>/edit`) |
| `BIRTHDAY_SHEET_NAME` | Tab name, e.g. `Sheet1` |
| `SLACK_CHANNEL` | Channel ID, e.g. `C0…` |
| `SLACK_BOT_TOKEN` | Slack Bot User OAuth Token (`xoxb-…`) |

Self-hosted n8n allows `$env` in expressions by default; leave
`N8N_BLOCK_ENV_ACCESS_IN_NODE` unset (or `false`).

## Slack app (bot)

1. Go to [api.slack.com/apps](https://api.slack.com/apps) → **Create New App** → **From scratch**.
2. **OAuth & Permissions** → **Bot Token Scopes** → add `chat:write`.
3. **Install to Workspace** → copy the **Bot User OAuth Token** (`xoxb-…`) into `SLACK_BOT_TOKEN`.
4. In the target channel: `/invite @YourBot`.
5. Channel ID: open the channel in Slack → channel details → copy the ID at the bottom into `SLACK_CHANNEL`.

## Google Sheets

### 1. Enable APIs (Google Cloud)

1. Open [Google Cloud Console](https://console.cloud.google.com/) → select or create a project.
2. **APIs & Services** → **Library**.
3. Search **Google Sheets API** → **Enable**.
4. Search **Google Drive API** → **Enable** (needed so n8n can list/open the spreadsheet).

### 2. Create OAuth client

1. **APIs & Services** → **OAuth consent screen** → configure (External is fine for personal use) → add your Google account as a test user if the app is in Testing.
2. **APIs & Services** → **Credentials** → **Create Credentials** → **OAuth client ID**.
3. Application type: **Web application**.
4. **Authorised JavaScript origins** — your n8n base URL (no path):
   ```text
   http://localhost:5678
   ```
   or `https://your-n8n-domain.com`
5. **Authorised redirect URIs** — n8n’s OAuth callback (exact path):
   ```text
   http://localhost:5678/rest/oauth2-credential/callback
   ```
   or `https://your-n8n-domain.com/rest/oauth2-credential/callback`
6. Create → copy **Client ID** and **Client Secret**.

Use the same scheme/host/port you open n8n with (`http` vs `https`, include port if any).

### 3. Connect in n8n

1. Open the **Fetch spreadsheet** node → create a **Google Sheets OAuth2** credential.
2. Paste Client ID + Client Secret → **Sign in with Google** with an account that can read the sheet.
3. Share the sheet with that Google account if it isn’t the owner.

## Setup

1. Fill `.env` from `.env.example`, then copy those values onto the n8n host and restart n8n.
2. **Import** `birthday.workflow.json` (Workflows → Import from File).
3. Connect Google Sheets OAuth on **Fetch spreadsheet**.
4. **Execute Workflow** once to test → then toggle **Active**.

## Security

- No tokens in committed files — the workflow uses `$env.*`; real values live on the n8n host and your gitignored `.env`.
- The bot token can only post where the bot is invited; revoke it from the Slack app dashboard if it leaks.
- Before pushing, confirm `git status` shows no `.env`.
