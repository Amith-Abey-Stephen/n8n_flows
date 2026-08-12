import cron from "node-cron";
import { config } from "./config.js";
import { runReport } from "./report.js";
import { log, logError } from "./util.js";

function startScheduler() {
  const expression = `${config.report.minute} ${config.report.hour} * * *`;

  cron.schedule(
    expression,
    async () => {
      try {
        await runReport();
      } catch (error) {
        logError(`Scheduled report failed: ${error.message}`);
      }
    },
    { timezone: config.timezone }
  );

  const hh = String(config.report.hour).padStart(2, "0");
  const mm = String(config.report.minute).padStart(2, "0");
  log(`Scheduler started — daily report at ${hh}:${mm} ${config.timezone}`);
  log("Press Ctrl+C to stop. Run `npm run report` for an immediate report.");
}

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
  startScheduler();
}
