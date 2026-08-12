/**
 * All edclub timestamps observed from the API are UTC ISO strings
 * (e.g. "2026-08-11T09:12:45.254977Z"). Every function here converts into the
 * configured display timezone (Asia/Kolkata by default) via Intl, so the
 * machine's local timezone never leaks into the report.
 */

export function dayStamp(date, timeZone) {
  // en-CA yields YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

export function daysBetween(earlierStamp, laterStamp) {
  const [y1, m1, d1] = earlierStamp.split("-").map(Number);
  const [y2, m2, d2] = laterStamp.split("-").map(Number);
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86_400_000);
}

export function formatTime(date, timeZone) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(date);
}

export function formatShortDate(date, timeZone, { withYear = false } = {}) {
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

/**
 * Describe a student's last-activity timestamp relative to `now`, in the
 * report timezone. Status drives the activity emoji:
 *   today → 🟢, yesterday → 🟡, older/never → 🔴.
 */
export function describeLastActive(isoString, now, timeZone) {
  if (!isoString) return { label: "Never practiced", status: "never" };
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) return { label: "Unknown", status: "never" };

  const diff = daysBetween(dayStamp(date, timeZone), dayStamp(now, timeZone));
  if (diff <= 0) return { label: formatTime(date, timeZone), status: "today" };
  if (diff === 1) {
    return { label: `Yesterday ${formatTime(date, timeZone)}`, status: "yesterday" };
  }
  const sameYear = dayStamp(date, timeZone).slice(0, 4) === dayStamp(now, timeZone).slice(0, 4);
  return { label: formatShortDate(date, timeZone, { withYear: !sameYear }), status: "stale" };
}
