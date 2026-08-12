const MAX_BLOCKS_PER_MESSAGE = 45; // Slack allows 50; keep headroom.

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Split blocks into message-sized chunks (Slack caps blocks per message). */
export function chunkBlocks(blocks, maxPerMessage = MAX_BLOCKS_PER_MESSAGE) {
  const chunks = [];
  for (let i = 0; i < blocks.length; i += maxPerMessage) {
    chunks.push(blocks.slice(i, i + maxPerMessage));
  }
  return chunks;
}

/**
 * Deliver Block Kit blocks to Slack, splitting into multiple messages when
 * the report is too long for one. Two delivery modes:
 *
 *  - Bot token + channel ID → chat.postMessage (the bot must be invited to
 *    the channel: `/invite @YourBot`).
 *  - Incoming Webhook URL → posts to the channel the webhook was created for
 *    (`channel` override only works on legacy webhooks).
 *
 * Both credentials are secrets: they are never logged, and errors
 * deliberately omit them.
 */
export async function postReport({ webhookUrl, botToken, channel, blocks, fallbackText }) {
  const useBot = Boolean(botToken && channel);
  if (!useBot && !webhookUrl) {
    throw new Error("No Slack delivery configured: set SLACK_BOT_TOKEN + SLACK_CHANNEL, or SLACK_WEBHOOK_URL");
  }

  const chunks = chunkBlocks(blocks);
  for (let i = 0; i < chunks.length; i += 1) {
    const text = chunks.length > 1 ? `${fallbackText} (${i + 1}/${chunks.length})` : fallbackText;
    if (useBot) {
      await postViaBot({ botToken, channel, blocks: chunks[i], text });
    } else {
      await postViaWebhook({ webhookUrl, channel, blocks: chunks[i], text });
    }
    if (i < chunks.length - 1) await sleep(1100); // chat.postMessage is limited to ~1 msg/sec/channel
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
  // Channel override only works for legacy webhooks; app webhooks are bound
  // to a channel at creation time and ignore this field.
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
