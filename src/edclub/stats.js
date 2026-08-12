export async function getCurrentStats(client, studentId) {
  const rows = await client.request(`/students/${studentId}/typing_student_current_stats/`, {
    method: "POST",
    body: {},
  });
  if (!Array.isArray(rows) || rows.length === 0) return null;
  return rows.find((row) => row?.subject === 1) ?? rows[0];
}
