async function postToSlack(payload) {
  const webhookUrl = process.env.SLACK_WEBHOOK_URL;

  if (!webhookUrl) {
    throw new Error("Missing SLACK_WEBHOOK_URL");
  }

  const res = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Slack webhook error: ${res.status} ${body}`);
  }
}

module.exports = { postToSlack };
