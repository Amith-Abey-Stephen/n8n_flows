import { getAllStudents } from "./edclub/students.js";
import { getCurrentStats } from "./edclub/stats.js";
import { getStudentProgress, aggregateProgress } from "./edclub/progress.js";
import { withRetry } from "./utils/retry.js";
import { log } from "./utils/logger.js";

/**
 * Fetch and normalize all report data.
 *
 * Per-student requests run through a small worker pool (default concurrency
 * 3) with retry/backoff, and one student's failure never aborts the run —
 * the student is flagged `failed: true`, collected in `failedIds`, and the
 * report continues. Each endpoint is called at most once per student per run
 * (results live in the returned normalized objects — no duplicate fetches).
 *
 * The `fetch*` dependencies are injectable for tests.
 */
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
        accuracy: null,
        wpm: null,
        practiceTodaySeconds: null,
        failed: false,
      };

      try {
        const [stats, progressRecords] = await Promise.all([
          withRetry(() => fetchStats(client, student.id), { label: `stats(${student.id})` }),
          withRetry(() => fetchProgress(client, student.id), {
            label: `progress(${student.id})`,
          }),
        ]);

        Object.assign(normalized, aggregateProgress(progressRecords));

        // current-stats fallbacks for fields missing from progress records.
        if (!normalized.lastActivity && stats?.last_active_date) {
          normalized.lastActivity = stats.last_active_date;
        }
        if (normalized.accuracy === null) {
          normalized.accuracy = stats?.real_accuracy_current ?? null;
        }
        if (normalized.wpm === null) normalized.wpm = stats?.speed_current ?? null;
        if (normalized.progressPercent === null) {
          normalized.progressPercent = stats?.coverage_current ?? null;
        }
        normalized.practiceTodaySeconds = stats?.practice_today ?? null;
      } catch (error) {
        normalized.failed = true;
        failedIds.push(student.id);
        log(`⚠️ Data unavailable for student ${student.id} (${student.name}): ${error.message}`);
      }

      students[index] = normalized;
    }
  }

  const workerCount = Math.max(1, Math.min(concurrency, roster.length || 1));
  await Promise.all(Array.from({ length: workerCount }, worker));

  log(`Successfully fetched ${roster.length - failedIds.length}/${roster.length}`);
  return { students, failedIds };
}
