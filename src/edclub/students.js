const PAGE_SIZE = 100;
const MAX_PAGES = 100;

export async function getAllStudents(client) {
  const students = [];
  let url =
    `/students/?source=1&is_active=true&ordering=lname&unenrolled=false` +
    `&limit=${PAGE_SIZE}&offset=0`;

  for (let pageNum = 0; url && pageNum < MAX_PAGES; pageNum += 1) {
    const page = await client.request(url);
    const results = Array.isArray(page?.results) ? page.results : [];
    for (const s of results) {
      students.push({
        id: s.id,
        name: [s.fname, s.lname].filter(Boolean).join(" ").trim() || `Student ${s.id}`,
        lastActivityDate: s.last_activity_date ?? null,
      });
    }
    url = page?.next ?? null;
  }

  if (url) {
    throw new Error(`Student roster exceeded ${MAX_PAGES} pages — aborting to avoid an infinite loop`);
  }
  return students;
}
