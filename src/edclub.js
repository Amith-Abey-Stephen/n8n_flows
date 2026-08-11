async function fetchClassReport() {
  const baseUrl = process.env.EDCLUB_BASE_URL;
  const token = process.env.EDCLUB_API_TOKEN;
  const classId = process.env.EDCLUB_CLASS_ID;

  if (!baseUrl || !token || !classId) {
    throw new Error("Missing EDCLUB_BASE_URL, EDCLUB_API_TOKEN, or EDCLUB_CLASS_ID");
  }

  const url = `${baseUrl.replace(/\/$/, "")}/api/classes/${classId}/report`;
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
    },
  });

  if (!res.ok) {
    throw new Error(`EdClub API error: ${res.status} ${res.statusText}`);
  }

  return res.json();
}

module.exports = { fetchClassReport };
