import { formatDuration } from "../utils/duration.js";
import { formatLongDate } from "../utils/dates.js";
import {
  escapeMrkdwn,
  formatNumber,
  formatPercent,
  medal,
  packLines,
} from "./format.js";

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
