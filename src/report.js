function buildSlackMessage(data) {
  const students = Array.isArray(data?.students) ? data.students : [];
  const className = data?.className || data?.name || "EdClub Class";

  if (students.length === 0) {
    return {
      text: `*${className}* — no student data available.`,
    };
  }

  const lines = students.map((s) => {
    const name = s.name || s.username || "Unknown";
    const wpm = s.wpm ?? s.avgWpm ?? "-";
    const accuracy = s.accuracy ?? s.avgAccuracy ?? "-";
    const stars = s.stars ?? s.starCount ?? "-";
    return `• ${name}: ${wpm} WPM | ${accuracy}% accuracy | ${stars} stars`;
  });

  return {
    text: [`*${className} — Typing Report*`, ...lines].join("\n"),
  };
}

module.exports = { buildSlackMessage };
