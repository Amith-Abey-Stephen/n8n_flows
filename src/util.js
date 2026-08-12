import { config } from "./config.js";

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function timestamp() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: config.timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(new Date());
  const get = (type) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")} ${get("hour")}:${get("minute")}:${get("second")}`;
}

export function log(message) {
  console.log(`[${timestamp()}] ${message}`);
}

export function logError(message) {
  console.error(`[${timestamp()}] ${message}`);
}

export async function withRetry(
  fn,
  { retries = 3, baseDelayMs = 500, maxDelayMs = 8000, label = "request" } = {}
) {
  let attempt = 0;
  for (;;) {
    try {
      return await fn();
    } catch (error) {
      if (error?.retryable !== true || attempt >= retries) throw error;
      const delay =
        Math.min(maxDelayMs, baseDelayMs * 2 ** attempt) + Math.floor(Math.random() * 250);
      attempt += 1;
      log(`Retrying ${label} in ${delay}ms (attempt ${attempt}/${retries})`);
      await sleep(delay);
    }
  }
}

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

export function formatDuration(totalSeconds) {
  const numeric = Number(totalSeconds);
  if (totalSeconds === null || totalSeconds === undefined || Number.isNaN(numeric)) {
    return "–";
  }
  const seconds = Math.max(0, Math.floor(numeric));
  if (seconds === 0) return "0m";

  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;

  const parts = [];
  if (h) parts.push(`${h}h`);
  if (m) parts.push(`${m}m`);
  if (s) parts.push(`${s}s`);
  return parts.join(" ");
}
