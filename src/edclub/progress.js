const MAX_PAGES = 50;

export async function getStudentProgress(client, studentId) {
  const records = [];
  let url = `/students/${studentId}/student-progress/`;

  for (let pageNum = 0; url && pageNum < MAX_PAGES; pageNum += 1) {
    const page = await client.request(url);
    if (Array.isArray(page)) {
      records.push(...page);
      return records;
    }
    records.push(...(Array.isArray(page?.results) ? page.results : []));
    url = page?.next ?? null;
  }

  if (url) {
    throw new Error(`student-progress for ${studentId} exceeded ${MAX_PAGES} pages`);
  }
  return records;
}

function toNumber(value) {
  if (value === null || value === undefined) return null;
  const n = Number.parseFloat(String(value).replace("%", ""));
  return Number.isNaN(n) ? null : n;
}

export function aggregateProgress(records) {
  if (!Array.isArray(records) || records.length === 0) {
    return {
      stars: null,
      score: null,
      durationSeconds: null,
      progressPercent: null,
    };
  }

  let stars = 0;
  let score = 0;
  let durationSeconds = 0;
  let dominant = records[0];

  for (const record of records) {
    stars += toNumber(record?.stars) ?? 0;
    score += toNumber(record?.score) ?? 0;
    const msecs = toNumber(record?.msecs);
    durationSeconds += toNumber(record?.secs) ?? (msecs !== null ? msecs / 1000 : 0);
    if ((toNumber(record?.secs) ?? 0) > (toNumber(dominant?.secs) ?? 0)) {
      dominant = record;
    }
  }

  return {
    stars,
    score,
    durationSeconds: Math.round(durationSeconds),
    progressPercent: toNumber(dominant?.progress_percent),
  };
}
