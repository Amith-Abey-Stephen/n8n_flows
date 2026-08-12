/** Shared Slack formatting helpers (pure — no config/env dependencies). */

export function escapeMrkdwn(text) {
  return String(text).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function formatNumber(value) {
  if (value === null || value === undefined) return "–";
  return Number(value).toLocaleString("en-US");
}

export function formatPercent(value) {
  if (value === null || value === undefined) return "–";
  return `${value}%`;
}

export function medal(rank) {
  if (rank === 1) return "🥇";
  if (rank === 2) return "🥈";
  if (rank === 3) return "🥉";
  return `*${rank}.*`;
}

export function statusEmoji(status) {
  if (status === "today") return "🟢";
  if (status === "yesterday") return "🟡";
  return "🔴";
}

const MAX_SECTION_CHARS = 2900; // Slack caps section text at 3000 chars.

/** Pack lines into section blocks, respecting Slack's per-block text limit. */
export function packLines(lines, { perSection = 8, maxChars = MAX_SECTION_CHARS } = {}) {
  const blocks = [];
  let current = [];
  let length = 0;
  for (const line of lines) {
    if (current.length >= perSection || length + line.length + 1 > maxChars) {
      if (current.length) blocks.push(sectionBlock(current.join("\n")));
      current = [];
      length = 0;
    }
    current.push(line);
    length += line.length + 1;
  }
  if (current.length) blocks.push(sectionBlock(current.join("\n")));
  return blocks;
}

function sectionBlock(text) {
  return { type: "section", text: { type: "mrkdwn", text } };
}

/** Plain-text rendering of Block Kit blocks for the console preview. */
export function blocksToText(blocks) {
  const out = [];
  for (const block of blocks) {
    if (block.type === "header") out.push(`\n${block.text.text}`);
    else if (block.type === "context") out.push(block.elements.map((e) => e.text).join(" "));
    else if (block.type === "divider") out.push("─".repeat(32));
    else if (block.type === "section") out.push(block.text.text.replace(/\*/g, ""));
  }
  return out.join("\n");
}
