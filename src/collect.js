import { getAllStudents } from "./edclub/students.js";
import { getCurrentStats } from "./edclub/stats.js";
import { getStudentProgress, aggregateProgress } from "./edclub/progress.js";
import { withRetry } from "./utils/retry.js";
import { log } from "./utils/logger.js";

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
