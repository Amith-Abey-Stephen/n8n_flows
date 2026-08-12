import { config, assertEdclubCredentials } from "./config.js";
import { EdclubClient } from "./edclub/client.js";
import { collectStudentData } from "./collect.js";
import { buildActivityBlocks } from "./reports/activity.js";
import { buildLeaderboardBlocks } from "./reports/leaderboard.js";
import { blocksToText } from "./reports/format.js";
import { postReport } from "./slack/client.js";
import { formatLongDate } from "./utils/dates.js";
import { log } from "./utils/logger.js";

/**
 * One full report run: fetch → normalize → build both sections → deliver.
 * Always prints the report to the console; posts to Slack unless dry-run or
 * the webhook is not configured.
 */
export async function runReport({ dryRun = false } = {}) {
  log("Starting report");
  assertEdclubCredentials();

  const client = new EdclubClient(config.edclub);
  const now = new Date();

  const { students, failedIds } = await collectStudentData(client, {
    concurrency: config.concurrency,
  });

  log("Generating report");
  const blocks = [
    ...buildActivityBlocks(students, now, config.timezone),
    { type: "divider" },
    ...buildLeaderboardBlocks(students, now, config.timezone),
  ];
  const fallbackText = `TypingClub daily report — ${formatLongDate(now, config.timezone)}`;

  console.log(`\n${blocksToText(blocks)}\n`);

  const canPost =
    (config.slack.botToken && config.slack.channel) || config.slack.webhookUrl;
  if (dryRun) {
    log("Dry run — skipping Slack post");
  } else if (!canPost) {
    log(
      "Slack not configured (need SLACK_BOT_TOKEN + SLACK_CHANNEL, or SLACK_WEBHOOK_URL) — report printed locally only"
    );
  } else {
    log("Posting to Slack");
    await postReport({
      webhookUrl: config.slack.webhookUrl,
      botToken: config.slack.botToken,
      channel: config.slack.channel,
      blocks,
      fallbackText,
    });
    log("Report posted successfully");
  }

  if (failedIds.length > 0) {
    log(`Students with unavailable data: ${failedIds.join(", ")}`);
  }
  return { students, failedIds, blocks };
}
