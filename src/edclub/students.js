const PAGE_SIZE = 100;

/**
 * Fetch ALL active students, following DRF pagination via the absolute `next`
 * URL until it is null — never assumes a single page. Only non-sensitive
 * fields are kept.
 */
export async function getAllStudents(client) {
  const students = [];
  let url =
    `/students/?source=1&is_active=true&ordering=lname&unenrolled=false` +
    `&limit=${PAGE_SIZE}&offset=0`;

  while (url) {
    const page = await client.request(url);
    const results = Array.isArray(page?.results) ? page.results : [];
    for (const s of results) {
      students.push({
        id: s.id,
        name: [s.fname, s.lname].filter(Boolean).join(" ").trim() || `Student ${s.id}`,
        isActive: Boolean(s.is_active),
        // UTC ISO timestamp (e.g. "2026-08-11T09:12:45.254977Z") or null for
        // students who have never practiced.
        lastActivityDate: s.last_activity_date ?? null,
      });
    }
    url = page?.next ?? null;
  }
  return students;
}
