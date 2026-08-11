require("dotenv").config();

const { fetchClassReport } = require("./edclub");
const { buildSlackMessage } = require("./report");
const { postToSlack } = require("./slack");

async function main() {
  const data = await fetchClassReport();
  const message = buildSlackMessage(data);
  await postToSlack(message);
  console.log("Report posted to Slack");
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
