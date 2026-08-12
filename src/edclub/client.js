import { log } from "../utils/logger.js";

export class EdclubApiError extends Error {
  constructor(message, { status = null, retryable = false } = {}) {
    super(message);
    this.name = "EdclubApiError";
    this.status = status;
    this.retryable = retryable;
  }
}

const ACCESS_TOKEN_KEYS = ["at", "access_token", "token", "access", "auth_token"];

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
            "The access token has expired or is invalid — copy fresh tokens from an authenticated browser session into .env (see README).",
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
      // ignore — handled below
    }

    const newAccessToken = ACCESS_TOKEN_KEYS.map((key) => data?.[key]).find(
      (value) => typeof value === "string" && value.length > 0
    );
    if (!newAccessToken) {
      throw new EdclubApiError(
        "Token refresh succeeded but no recognizable access token was found in the response. " +
          "Inspect the browser's /auth/refresh_tokens/ response and extend ACCESS_TOKEN_KEYS in src/edclub/client.js."
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
