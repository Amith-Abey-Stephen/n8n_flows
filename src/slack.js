import { sleep } from "./util.js";

const MAX_BLOCKS_PER_MESSAGE = 45;

export function chunkBlocks(blocks, maxPerMessage = MAX_BLOCKS_PER_MESSAGE) {
  const chunks = [];
  for (let i = 0; i < blocks.length; i += maxPerMessage) {
    chunks.push(blocks.slice(i, i + maxPerMessage));
  }
  return chunks;
}

export async function postReport({ webhookUrl, botToken, channel, blocks, fallbackText }) {
  const useBot = Boolean(botToken && channel);
  if (!useBot && !webhookUrl) {
    throw new Error(
      "No Slack delivery configured: set SLACK_BOT_TOKEN + SLACK_CHANNEL, or SLACK_WEBHOOK_URL"
    );
  }

  const chunks = chunkBlocks(blocks);
  for (let i = 0; i < chunks.length; i += 1) {
    const text = chunks.length > 1 ? `${fallbackText} (${i + 1}/${chunks.length})` : fallbackText;
    if (useBot) {
      await postViaBot({ botToken, channel, blocks: chunks[i], text });
    } else {
      await postViaWebhook({ webhookUrl, channel, blocks: chunks[i], text });
    }
    if (i < chunks.length - 1) await sleep(1100);
  }
}

async function postViaBot({ botToken, channel, blocks, text }) {
  let response;
  try {
    response = await fetch("https://slack.com/api/chat.postMessage", {
      method: "POST",
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        Authorization: `Bearer ${botToken}`,
      },
      body: JSON.stringify({ channel, text, blocks, unfurl_links: false }),
    });
  } catch (error) {
    throw new Error(`Slack API network error: ${error.message}`);
  }

  let data;
  try {
    data = await response.json();
  } catch {
    throw new Error(`Slack API returned non-JSON (HTTP ${response.status})`);
  }

  if (!data.ok) {
    const hint =
      data.error === "not_in_channel"
        ? " — invite the bot to the channel (/invite @YourBot)"
        : data.error === "channel_not_found"
          ? " — check SLACK_CHANNEL (use the channel ID, e.g. C0XXXXXXX)"
          : data.error === "invalid_auth"
            ? " — check SLACK_BOT_TOKEN"
            : "";
    throw new Error(`Slack API error: ${data.error}${hint}`);
  }
}

async function postViaWebhook({ webhookUrl, channel, blocks, text }) {
  const payload = { text, blocks };
  if (channel) payload.channel = channel;

  let response;
  try {
    response = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch (error) {
    throw new Error(`Slack webhook network error: ${error.message}`);
  }

  if (!response.ok) {
    const body = (await response.text()).slice(0, 200);
    throw new Error(`Slack webhook error: HTTP ${response.status} ${body}`);
  }
}
