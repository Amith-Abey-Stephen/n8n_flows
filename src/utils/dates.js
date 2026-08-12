function dayStamp(date, timeZone) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function daysBetween(earlierStamp, laterStamp) {
  const [y1, m1, d1] = earlierStamp.split("-").map(Number);
  const [y2, m2, d2] = laterStamp.split("-").map(Number);
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86_400_000);
}

function formatTime(date, timeZone) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(date);
}

function formatShortDate(date, timeZone, { withYear = false } = {}) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    month: "short",
    day: "numeric",
    ...(withYear ? { year: "numeric" } : {}),
  }).format(date);
}

export function formatLongDate(date, timeZone) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(date);
}

export function describeLastActive(isoString, now, timeZone) {
  if (!isoString) return { label: "Never practiced", status: "never" };
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) return { label: "Unknown", status: "never" };

  const stamp = dayStamp(date, timeZone);
  const today = dayStamp(now, timeZone);
  const diff = daysBetween(stamp, today);
  if (diff <= 0) return { label: formatTime(date, timeZone), status: "today" };
  if (diff === 1) {
    return { label: `Yesterday ${formatTime(date, timeZone)}`, status: "yesterday" };
  }
  return {
    label: formatShortDate(date, timeZone, { withYear: stamp.slice(0, 4) !== today.slice(0, 4) }),
    status: "stale",
  };
}
