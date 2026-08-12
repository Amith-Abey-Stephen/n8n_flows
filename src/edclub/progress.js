/**
 * Scoreboard data. Verified against the live API: despite the 405 reported
 * during early exploration (which came from the POST-only *stats* endpoints),
 * student-progress is a plain GET ("Allow: GET, PUT, PATCH, DELETE, HEAD,
 * OPTIONS") returning a paginated list with one record per enrolled course.
 */
export async function getStudentProgress(client, studentId) {
  const records = [];
  let url = `/students/${studentId}/student-progress/`;
  while (url) {
    const page = await client.request(url);
    if (Array.isArray(page)) {
      records.push(...page);
      break;
    }
    records.push(...(Array.isArray(page?.results) ? page.results : []));
    url = page?.next ?? null;
  }
  return records;
}

/** Parse numbers that may arrive as strings like "95%" or "22". */
function toNumber(value) {
  if (value === null || value === undefined) return null;
  const n = Number.parseFloat(String(value).replace("%", ""));
  return Number.isNaN(n) ? null : n;
}

/**
 * Collapse a student's per-course progress records into scoreboard totals.
 *
 *  - stars / score / duration are summed across courses.
 *  - `secs` is authoritative for duration (`msecs` is the same value ×1000,
 *    verified live) and is used as a fallback only.
 *  - progress_percent / avg_accuracy / avg_wpm are per-course values, so
 *    mixing courses would be meaningless — we report the course the student
 *    has spent the most time in. avg_accuracy arrives as a string like "95%"
 *    and avg_wpm as "22"; both are parsed to numbers.
 */
export function aggregateProgress(records) {
  if (!Array.isArray(records) || records.length === 0) {
    return {
      stars: null,
      score: null,
      durationSeconds: null,
      progressPercent: null,
      accuracy: null,
      wpm: null,
    };
  }

  let stars = 0;
  let score = 0;
  let durationSeconds = 0;
  for (const record of records) {
    stars += toNumber(record?.stars) ?? 0;
    score += toNumber(record?.score) ?? 0;
    const msecs = toNumber(record?.msecs);
    durationSeconds += toNumber(record?.secs) ?? (msecs !== null ? msecs / 1000 : 0);
  }

  const dominant = [...records].sort(
    (a, b) => (toNumber(b?.secs) ?? 0) - (toNumber(a?.secs) ?? 0)
  )[0];

  return {
    stars,
    score,
    durationSeconds: Math.round(durationSeconds),
    progressPercent: toNumber(dominant?.progress_percent),
    accuracy: toNumber(dominant?.avg_accuracy),
    wpm: toNumber(dominant?.avg_wpm),
  };
}
