import "dotenv/config";

function normalizeBaseUrl(raw) {
  const url = (raw || "https://finalapps.edclub.com").replace(/\/+$/, "");
  // Tolerate a base URL that already includes the DRF API prefix.
  return url.replace(/\/drf\/[\d.]+$/, "");
}

function intFromEnv(name, fallback, min, max) {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;
  const value = Number.parseInt(raw, 10);
  if (Number.isNaN(value) || value < min || value > max) {
    throw new Error(`${name} must be an integer between ${min} and ${max}`);
  }
  return value;
}

function readWebhookUrl() {
  const raw = (process.env.SLACK_WEBHOOK_URL || "").trim();
  // Placeholder values (e.g. "PASTE_YOUR_WEBHOOK_HERE") are treated as unset.
  return raw.startsWith("https://hooks.slack.com/") ? raw : null;
}

function readBotToken() {
  const raw = (process.env.SLACK_BOT_TOKEN || "").trim();
  // Slack tokens start with "xox" (bot tokens: xoxb-); anything else is a
  // placeholder.
  return raw.startsWith("xox") ? raw : null;
}

const baseUrl = normalizeBaseUrl(process.env.EDCLUB_BASE_URL);

export const config = {
  edclub: {
    baseUrl,
    apiUrl: `${baseUrl}/drf/1.1.1`,
    authUrl: `${baseUrl}/auth`,
    accessToken: (process.env.EDCLUB_AUTH_TOKEN || "").trim() || null,
    refreshToken: (process.env.EDCLUB_REFRESH_TOKEN || "").trim() || null,
  },
  slack: {
    webhookUrl: readWebhookUrl(),
    botToken: readBotToken(),
    channel: (process.env.SLACK_CHANNEL || "").trim() || null,
  },
  timezone: process.env.TIMEZONE || "Asia/Kolkata",
  report: {
    hour: intFromEnv("REPORT_HOUR", 22, 0, 23),
    minute: intFromEnv("REPORT_MINUTE", 0, 0, 59),
  },
  concurrency: intFromEnv("CONCURRENCY", 3, 1, 10),
};

export function assertEdclubCredentials() {
  if (!config.edclub.accessToken && !config.edclub.refreshToken) {
    throw new Error(
      "Missing edclub credentials. Set EDCLUB_AUTH_TOKEN (and ideally EDCLUB_REFRESH_TOKEN) in .env — see README \"Authentication setup\"."
    );
  }
}
