# SyncBatch weekly creatives: setup

Two posts a week (Mon & Thu, 09:00 IST) arrive in Discord, each with a 1080×1350 card (SyncBatch + INOVUS LABS logos) and ready-to-paste captions for Instagram, LinkedIn and X.

## What you need
- n8n (n8n Cloud or self-hosted, version 1.x)
- A free **Gemini API key**: aistudio.google.com/apikey (Google account, no card)
- A free **Groq API key**: console.groq.com/keys (no card)
- Two Discord webhooks: one for posts, one for alerts (Channel → Edit → Integrations → Webhooks → New webhook → Copy URL)
- The SyncBatch site deployed with the `/api/social-card` route and a `SOCIAL_CARD_SECRET` env var

## 1. Set up the card renderer (one time)
1. Generate a secret: `openssl rand -hex 32`
2. In Vercel → SyncBatch project → Settings → Environment Variables, add `SOCIAL_CARD_SECRET` = that value (Production). Redeploy.
3. Test it (replace SECRET):
   ```
   curl -X POST https://syncbatch.inovuslabs.org/api/social-card \
     -H "authorization: Bearer SECRET" -H "content-type: application/json" \
     -d '{"template":"statement","headline":"Hello from","highlight":"n8n."}' -o test.png
   ```
   `test.png` should be a card with both logos.

## 2. Import the workflows
1. n8n → Workflows → **Import from file** → `syncbatch-workflow-alerts.json`.
   - Open **Send alert to Discord** and paste your **alerts** webhook URL. Save.
2. Import `syncbatch-weekly-creatives.json`.

## 3. Credentials (both are "Header Auth")
In n8n → Credentials → New → **Header Auth**:
| Credential name | Name | Value | Used by node |
|---|---|---|---|
| Gemini API key | `x-goog-api-key` | your Gemini key | Gemini Flash, Gemini Flash-Lite |
| Groq API key | `Authorization` | `Bearer <your Groq key>` | Groq GPT-OSS |
| SyncBatch card secret | `Authorization` | `Bearer <SOCIAL_CARD_SECRET>` | Render card |

Open each of those four nodes and select the credential.

## 4. Configure
- Open the **Config** node and set `discordWebhook` to your **posts** webhook. Optionally set `mention` to `<@yourDiscordUserId>` to be pinged.
- Workflow **Settings** → **Error workflow** → choose *SyncBatch – workflow alerts*. Timezone is already Asia/Kolkata.

## 5. Test, then activate
1. Click **Execute workflow** once. A post should arrive in Discord within about a minute.
   - Manual runs don't save history, so you can test as often as you like.
2. Toggle the workflow **Active**. From now on it runs Mon & Thu at 09:00, with an 18:00 catch-up.

## How the fallbacks work
| What fails | What happens |
|---|---|
| Gemini 3.8 Flash (quota, outage, blocked, bad JSON, or all 3 options rejected) | Retries once, then **Gemini 3.5 Flash-Lite** (its own free quota) |
| Gemini Flash-Lite fails the same way | **Groq · GPT-OSS 120B** (a different company, so a Google outage doesn't stop the post) |
| Groq fails too | A **backup post** from a bank of 10 fact-checked posts. The Discord message is marked "⚠️ backup copy" and the footer says why. |
| Card rendering | 3 retries, then the captions arrive **text-only** with a warning |
| Discord, or anything unexpected | 3 retries, then the **alerts workflow** posts the failed step, the error and a link to the execution. The **18:00 catch-up** run retries the whole thing. |

## How posts stay unique
- 8 topic pillars rotate (teachers, tips, events, coaching, maker story, sales, privacy, how-to), each with its own card layouts.
- The model sees the last 40 headlines and angles and writes 3 options; code rejects any option that's too similar, uses a banned word, or makes an unverified claim, and picks the first one that passes.
- History is kept in the workflow's static data (last 120 posts).

## Posting from Discord
1. Save the image (open it → Save).
2. **Instagram:** paste the Instagram caption; the bio link is in the message header (it has tracking for this post).
3. **LinkedIn / X:** paste those captions; their links already carry `utm_source=linkedin` / `x`.
4. In PostHog, filter by `utm_campaign = weekly_<date>` to see which post brought visitors.

## About the free tiers
- You use about **2 requests a week** (at most ~8 on a bad day with every fallback firing). Every free tier allows far more, so you won't hit limits. Exact quotas are in AI Studio (aistudio.google.com/rate-limit) and the Groq console (Settings → Limits).
- Google's free tier may use prompts to improve its products. The prompts only contain public product facts, never personal data, so that's fine here. Don't add private information to the prompt.
- Free tiers can change without notice. If a model ID stops working, update it in **Config** (check ai.google.dev/gemini-api/docs/models and console.groq.com/docs/models).

## Changing things
- **Product facts or voice:** edit the system prompt in **Build prompt**. Only add claims that are true in the product.
- **Schedule:** edit the two Schedule nodes (cron, IST).
- **Topics:** edit the `PILLARS` list in **Plan post**.
- **Card design:** `src/app/api/social-card/route.tsx` in the SyncBatch repo.
