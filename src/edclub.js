import { log, withRetry } from "./util.js";

const ACCESS_TOKEN_KEYS = ["at", "access_token", "token", "access", "auth_token"];
const PAGE_SIZE = 100;
const MAX_ROSTER_PAGES = 100;
const MAX_PROGRESS_PAGES = 50;

export class EdclubApiError extends Error {
  constructor(message, { status = null, retryable = false } = {}) {
    super(message);
    this.name = "EdclubApiError";
    this.status = status;
    this.retryable = retryable;
  }
}

function isCloudflareChallenge(response, text) {
  return (
    (response.headers.get("content-type") || "").includes("text/html") &&
    text.includes("Just a moment")
  );
}

function pathOf(url) {
  try {
    return new URL(url).pathname;
  } catch {
    return url;
  }
}

export class EdclubClient {
  constructor({ apiUrl, authUrl, accessToken, refreshToken }) {
    this.apiUrl = apiUrl;
    this.authUrl = authUrl;
    this.accessToken = accessToken;
    this.refreshToken = refreshToken;
    this.refreshPromise = null;
  }

  buildHeaders(hasBody) {
    const headers = { Accept: "application/json" };
    if (this.accessToken) headers.Authorization = this.accessToken;
    if (hasBody) headers["Content-Type"] = "application/json";
    return headers;
  }

  async request(pathOrUrl, { method = "GET", body, retryOn401 = true } = {}) {
    const url = pathOrUrl.startsWith("http") ? pathOrUrl : `${this.apiUrl}${pathOrUrl}`;
    const init = { method, headers: this.buildHeaders(body !== undefined) };
    if (body !== undefined) init.body = JSON.stringify(body);

    let response;
    try {
      response = await fetch(url, init);
    } catch (error) {
      throw new EdclubApiError(`Network error calling edclub: ${error.message}`, {
        retryable: true,
      });
    }

    const text = await response.text();

    if (isCloudflareChallenge(response, text)) {
      throw new EdclubApiError(
        `Cloudflare challenge on ${method} ${pathOf(url)}. Do not add browser-like headers; if this persists the server is challenging this IP.`,
        { status: response.status }
      );
    }

    if (response.status === 401 && retryOn401 && this.refreshToken) {
      await this.refreshTokens();
      return this.request(pathOrUrl, { method, body, retryOn401: false });
    }

    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        throw new EdclubApiError(
          `edclub authentication failed (HTTP ${response.status}) on ${method} ${pathOf(url)}. ` +
            "The access token has expired or is invalid — copy fresh tokens from an authenticated browser session into .env.",
          { status: response.status }
        );
      }
      const detail = text.trimStart().startsWith("<")
        ? "(HTML error page)"
        : text.slice(0, 200);
      throw new EdclubApiError(
        `edclub API error ${response.status} on ${method} ${pathOf(url)}: ${detail}`,
        {
          status: response.status,
          retryable: response.status === 429 || response.status >= 500,
        }
      );
    }

    if (!text) return null;
    try {
      return JSON.parse(text);
    } catch {
      throw new EdclubApiError(
        `edclub returned non-JSON on ${method} ${pathOf(url)} (HTTP ${response.status})`
      );
    }
  }

  refreshTokens() {
    if (!this.refreshPromise) {
      this.refreshPromise = this.#doRefresh().finally(() => {
        this.refreshPromise = null;
      });
    }
    return this.refreshPromise;
  }

  async #doRefresh() {
    log("Access token rejected — attempting token refresh");
    let response;
    try {
      response = await fetch(`${this.authUrl}/refresh_tokens/`, {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          Cookie: `rt=${this.refreshToken}`,
        },
        body: "{}",
      });
    } catch (error) {
      throw new EdclubApiError(`Network error refreshing edclub tokens: ${error.message}`, {
        retryable: true,
      });
    }

    const text = await response.text();
    if (!response.ok) {
      throw new EdclubApiError(
        `Token refresh failed (HTTP ${response.status}). The refresh token has likely expired — ` +
          "sign in to the edclub portal again and update EDCLUB_AUTH_TOKEN / EDCLUB_REFRESH_TOKEN in .env.",
        { status: response.status }
      );
    }

    let data = {};
    try {
      data = JSON.parse(text);
    } catch {
      // ignore
    }

    const newAccessToken = ACCESS_TOKEN_KEYS.map((key) => data?.[key]).find(
      (value) => typeof value === "string" && value.length > 0
    );
    if (!newAccessToken) {
      throw new EdclubApiError(
        "Token refresh succeeded but no recognizable access token was found in the response."
      );
    }
    this.accessToken = newAccessToken;

    const cookies =
      typeof response.headers.getSetCookie === "function" ? response.headers.getSetCookie() : [];
    for (const cookie of cookies) {
      const match = /^rt=([^;]+)/.exec(cookie);
      if (match) this.refreshToken = match[1];
    }
    log("Token refresh succeeded");
  }
}

export async function getAllStudents(client) {
  const students = [];
  let url =
    `/students/?source=1&is_active=true&ordering=lname&unenrolled=false` +
    `&limit=${PAGE_SIZE}&offset=0`;

  for (let pageNum = 0; url && pageNum < MAX_ROSTER_PAGES; pageNum += 1) {
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
    throw new Error(`Student roster exceeded ${MAX_ROSTER_PAGES} pages`);
  }
  return students;
}

export async function getCurrentStats(client, studentId) {
  const rows = await client.request(`/students/${studentId}/typing_student_current_stats/`, {
    method: "POST",
    body: {},
  });
  if (!Array.isArray(rows) || rows.length === 0) return null;
  return rows.find((row) => row?.subject === 1) ?? rows[0];
}

export async function getStudentProgress(client, studentId) {
  const records = [];
  let url = `/students/${studentId}/student-progress/`;

  for (let pageNum = 0; url && pageNum < MAX_PROGRESS_PAGES; pageNum += 1) {
    const page = await client.request(url);
    if (Array.isArray(page)) {
      records.push(...page);
      return records;
    }
    records.push(...(Array.isArray(page?.results) ? page.results : []));
    url = page?.next ?? null;
  }

  if (url) {
    throw new Error(`student-progress for ${studentId} exceeded ${MAX_PROGRESS_PAGES} pages`);
  }
  return records;
}

function toNumber(value) {
  if (value === null || value === undefined) return null;
  const n = Number.parseFloat(String(value).replace("%", ""));
  return Number.isNaN(n) ? null : n;
}

export function aggregateProgress(records) {
  if (!Array.isArray(records) || records.length === 0) {
    return {
      stars: null,
      score: null,
      durationSeconds: null,
      progressPercent: null,
    };
  }

  let stars = 0;
  let score = 0;
  let durationSeconds = 0;
  let dominant = records[0];

  for (const record of records) {
    stars += toNumber(record?.stars) ?? 0;
    score += toNumber(record?.score) ?? 0;
    const msecs = toNumber(record?.msecs);
    durationSeconds += toNumber(record?.secs) ?? (msecs !== null ? msecs / 1000 : 0);
    if ((toNumber(record?.secs) ?? 0) > (toNumber(dominant?.secs) ?? 0)) {
      dominant = record;
    }
  }

  return {
    stars,
    score,
    durationSeconds: Math.round(durationSeconds),
    progressPercent: toNumber(dominant?.progress_percent),
  };
}

async function settled(fn) {
  try {
    return { ok: true, value: await fn() };
  } catch (error) {
    return { ok: false, error };
  }
}

export async function collectStudentData(
  client,
  {
    concurrency = 3,
    fetchStudents = getAllStudents,
    fetchStats = getCurrentStats,
    fetchProgress = getStudentProgress,
  } = {}
) {
  const roster = await fetchStudents(client);
  log(`Found ${roster.length} students`);
  log("Fetching student data");

  const students = new Array(roster.length);
  const failedIds = [];
  let cursor = 0;

  async function worker() {
    while (cursor < roster.length) {
      const index = cursor;
      cursor += 1;
      const student = roster[index];

      const normalized = {
        id: student.id,
        name: student.name,
        lastActivity: student.lastActivityDate ?? null,
        stars: null,
        score: null,
        durationSeconds: null,
        progressPercent: null,
        failed: false,
      };

      const [statsResult, progressResult] = await Promise.all([
        settled(() =>
          withRetry(() => fetchStats(client, student.id), { label: `stats(${student.id})` })
        ),
        settled(() =>
          withRetry(() => fetchProgress(client, student.id), {
            label: `progress(${student.id})`,
          })
        ),
      ]);

      if (progressResult.ok) {
        Object.assign(normalized, aggregateProgress(progressResult.value));
      }

      if (statsResult.ok) {
        const stats = statsResult.value;
        if (!normalized.lastActivity && stats?.last_active_date) {
          normalized.lastActivity = stats.last_active_date;
        }
        if (normalized.progressPercent === null) {
          normalized.progressPercent = stats?.coverage_current ?? null;
        }
      }

      if (!progressResult.ok) {
        normalized.failed = true;
        failedIds.push(student.id);
        log(
          `⚠️ Data unavailable for student ${student.id} (${student.name}): ${progressResult.error.message}`
        );
      }

      students[index] = normalized;
    }
  }

  const workerCount = Math.max(1, Math.min(concurrency, roster.length || 1));
  await Promise.all(Array.from({ length: workerCount }, worker));

  log(`Successfully fetched ${roster.length - failedIds.length}/${roster.length}`);
  return { students, failedIds };
}
