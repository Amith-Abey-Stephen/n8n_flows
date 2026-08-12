/**
 * Per-day typing overview (WPM, accuracy, attempts, lessons completed…).
 *
 * KNOWN LIMITATION — verified against the live API:
 *  - The endpoint is POST-only (GET → 405 with "Allow: POST, OPTIONS").
 *  - An empty body ({}) triggers a 500; {"period": "day"|"week"|...} is
 *    accepted (HTTP 200) but returned an empty array for every period value
 *    we probed, even for students with activity that day. The portal UI
 *    evidently sends additional undocumented filter parameters.
 *
 * The daily report does NOT depend on this endpoint — the students list,
 * current-stats, and student-progress endpoints cover every reported field —
 * so this module exists for completeness and future use. If you need it,
 * capture the exact request body from Chrome DevTools (Network tab → the
 * typing_student_overview call → "Payload") and mirror it here.
 */
export async function getOverview(client, studentId, { period = "week" } = {}) {
  const rows = await client.request(`/students/${studentId}/typing_student_overview/`, {
    method: "POST",
    body: { period },
  });
  return Array.isArray(rows) ? rows : [];
}
