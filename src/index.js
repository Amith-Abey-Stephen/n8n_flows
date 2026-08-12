import { runReport } from "./report.js";
import { startScheduler } from "./scheduler.js";
import { logError } from "./utils/logger.js";

const args = new Set(process.argv.slice(2));
const runNow = args.has("--now");
const dryRun = args.has("--dry-run");

if (runNow || dryRun) {
  runReport({ dryRun })
    .then(() => process.exit(0))
    .catch((error) => {
      logError(`Report failed: ${error.message}`);
      process.exit(1);
    });
} else {
  startScheduler(runReport);
}
