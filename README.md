# n8n-flows

A collection of self-hosted [n8n](https://n8n.io) workflows — one folder per
bot. Each folder is self-contained: the workflow JSON, its own README, and a
`.env.example` listing the environment variables that flow needs.

## Flows

| Folder | What it does |
|---|---|
| [`typingclub-slack/`](typingclub-slack/) | Daily edclub / TypingClub activity + scoreboard report, posted to Slack at 22:00 IST. |
| [`birthday-bot/`](birthday-bot/) | _Placeholder — not built yet._ |

## Conventions

- **No secrets in git.** Workflow JSONs reference secrets via `{{ $env.* }}`; the real values live in the n8n host's environment. Set them there and restart n8n.
- **`.env` is gitignored everywhere** (root `.gitignore`). Copy each flow's `.env.example` to a local `.env` as your own notepad / source of values.
- Before pushing, run `git status` and confirm no `.env` is listed.
