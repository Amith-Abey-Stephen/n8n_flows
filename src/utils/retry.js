import { log } from "./logger.js";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Retry `fn` with exponential backoff and jitter.
 *
 * Only errors flagged `retryable: true` are retried (the edclub client flags
 * 429, 5xx, and network errors; 401/403 are never retryable — retrying those
 * would just hammer the API with a dead token).
 */
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
