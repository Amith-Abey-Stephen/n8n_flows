/**
 * Current statistics for one student.
 *
 * Verified against the live API: this endpoint is POST-only (GET → 405 with
 * "Allow: POST, OPTIONS") and expects an EMPTY JSON object body — any
 * non-empty body triggers a 500. Returns an array with one record per
 * subject; typing is subject 1.
 */
export async function getCurrentStats(client, studentId) {
  const rows = await client.request(`/students/${studentId}/typing_student_current_stats/`, {
    method: "POST",
    body: {},
  });
  if (!Array.isArray(rows) || rows.length === 0) return null;
  return rows.find((row) => row?.subject === 1) ?? rows[0];
}
