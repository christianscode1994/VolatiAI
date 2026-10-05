const RAW_UIO =
  "https://raw.githubusercontent.com/christianscode1994/VolatiAI/main/data/outputs/uio.json";

export default {
  async scheduled(event, env, ctx) {
    const uio = await fetch(RAW_UIO).then(r => r.json());
    const alerts = [];

    if (uio.risk.global > 0.8) {
      alerts.push(`Global risk high: ${uio.risk.global.toFixed(2)}`);
    }

    if (alerts.length) {
      await sendAlert(env.ALERT_WEBHOOK_URL, alerts);
    }
  }
};

async function sendAlert(webhook, alerts) {
  await fetch(webhook, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text: alerts.join("\n") })
  });
}
