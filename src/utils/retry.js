import { log } from "./logger.js";
import { sleep } from "./sleep.js";

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
