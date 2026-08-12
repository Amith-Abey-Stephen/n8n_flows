import { config, assertEdclubCredentials } from "./config.js";
import { EdclubClient, collectStudentData } from "./edclub.js";
import { postReport } from "./slack.js";
import {
  describeLastActive,
  formatDuration,
  formatLongDate,
  log,
} from "./util.js";

export function escapeMrkdwn(text) {
  return String(text).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function formatNumber(value) {
  if (value === null || value === undefined) return "–";
  return Number(value).toLocaleString("en-US");
}

function formatPercent(value) {
  if (value === null || value === undefined) return "–";
  return `${value}%`;
}

function medal(rank) {
  if (rank === 1) return "🥇";
  if (rank === 2) return "🥈";
  if (rank === 3) return "🥉";
  return `*${rank}.*`;
}

function statusEmoji(status) {
  if (status === "today") return "🟢";
  if (status === "yesterday") return "🟡";
  return "🔴";
}

const MAX_SECTION_CHARS = 2900;

function packLines(lines, { perSection = 8, maxChars = MAX_SECTION_CHARS } = {}) {
  const blocks = [];
  let current = [];
  let length = 0;
  for (const line of lines) {
    if (current.length >= perSection || length + line.length + 1 > maxChars) {
      if (current.length) {
        blocks.push({ type: "section", text: { type: "mrkdwn", text: current.join("\n") } });
      }
      current = [];
      length = 0;
    }
    current.push(line);
    length += line.length + 1;
  }
  if (current.length) {
    blocks.push({ type: "section", text: { type: "mrkdwn", text: current.join("\n") } });
  }
  return blocks;
}

function blocksToText(blocks) {
  const out = [];
  for (const block of blocks) {
    if (block.type === "header") out.push(`\n${block.text.text}`);
    else if (block.type === "context") out.push(block.elements.map((e) => e.text).join(" "));
    else if (block.type === "divider") out.push("─".repeat(32));
    else if (block.type === "section") out.push(block.text.text.replace(/\*/g, ""));
  }
  return out.join("\n");
}

export function buildActivityBlocks(students, now, timeZone) {
  const sorted = [...students].sort((a, b) => {
    const ta = a.lastActivity ? Date.parse(a.lastActivity) : Number.NEGATIVE_INFINITY;
    const tb = b.lastActivity ? Date.parse(b.lastActivity) : Number.NEGATIVE_INFINITY;
    return tb - ta || a.name.localeCompare(b.name);
  });

  const lines = sorted.map((student) => {
    const { label, status } = describeLastActive(student.lastActivity, now, timeZone);
    const warning = student.failed ? "  ⚠️ _Data unavailable_" : "";
    return `${statusEmoji(status)} *${escapeMrkdwn(student.name)}* — Last active: ${label}${warning}`;
  });
  if (lines.length === 0) lines.push("_No active students found._");

  return [
    { type: "header", text: { type: "plain_text", text: "🕙 Student Activity", emoji: true } },
    {
      type: "context",
      elements: [{ type: "mrkdwn", text: formatLongDate(now, timeZone) }],
    },
    ...packLines(lines, { perSection: 10 }),
  ];
}

export function rankStudents(students) {
  return students
    .filter((student) => !student.failed)
    .sort(
      (a, b) =>
        (b.score ?? 0) - (a.score ?? 0) ||
        (b.stars ?? 0) - (a.stars ?? 0) ||
        a.name.localeCompare(b.name)
    );
}

export function buildLeaderboardBlocks(students, now, timeZone) {
  const ranked = rankStudents(students);
  const failed = students.filter((student) => student.failed);

  const lines = ranked.map((student, index) => {
    const stats = [
      `⭐ ${formatNumber(student.stars)} stars`,
      `🏆 ${formatNumber(student.score)}`,
      `⏱ ${formatDuration(student.durationSeconds)}`,
      `📈 ${formatPercent(student.progressPercent)}`,
    ].join("   ");
    return `${medal(index + 1)} *${escapeMrkdwn(student.name)}*\n        ${stats}`;
  });

  for (const student of failed) {
    lines.push(`⚠️ *${escapeMrkdwn(student.name)}* — Data unavailable`);
  }
  if (lines.length === 0) lines.push("_No scoreboard data available._");

  return [
    {
      type: "header",
      text: { type: "plain_text", text: "🏆 TypingClub Scoreboard", emoji: true },
    },
    {
      type: "context",
      elements: [{ type: "mrkdwn", text: formatLongDate(now, timeZone) }],
    },
    ...packLines(lines, { perSection: 6 }),
  ];
}

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
