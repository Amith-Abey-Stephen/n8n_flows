import cron from "node-cron";
import { config } from "./config.js";
import { log, logError } from "./utils/logger.js";

/**
 * Run the report every day at REPORT_HOUR:REPORT_MINUTE (default 22:00) in
 * the configured timezone (default Asia/Kolkata). node-cron evaluates the
 * expression in that timezone, so the host machine's timezone is irrelevant.
 */
export function startScheduler(runReport) {
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
