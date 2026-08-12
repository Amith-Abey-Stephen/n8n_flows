/**
 * Format a duration in seconds as a compact human-readable string.
 *
 *   0    → "0m"
 *   1432 → "23m 52s"
 *   3600 → "1h"
 *   3661 → "1h 1m 1s"
 *
 * The edclub `student-progress` endpoint returns both `secs` and `msecs`
 * (msecs = secs * 1000); `secs` is treated as authoritative upstream and this
 * function always receives plain seconds.
 */
export function formatDuration(totalSeconds) {
  const numeric = Number(totalSeconds);
  if (totalSeconds === null || totalSeconds === undefined || Number.isNaN(numeric)) {
    return "–";
  }
  const seconds = Math.max(0, Math.floor(numeric));
  if (seconds === 0) return "0m";

  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;

  const parts = [];
  if (h) parts.push(`${h}h`);
  if (m) parts.push(`${m}m`);
  if (s) parts.push(`${s}s`);
  return parts.join(" ");
}
