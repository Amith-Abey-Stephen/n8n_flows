import { describeLastActive, formatLongDate } from "../utils/dates.js";
import { escapeMrkdwn, packLines, statusEmoji } from "./format.js";

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
