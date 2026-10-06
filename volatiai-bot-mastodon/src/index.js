import { fetchBotSignals } from "volatiai-bots-core/client.js";

const MASTODON_BASE = "https://your.instance";
const MASTODON_TOKEN = MASTODON_TOKEN_FROM_ENV;

export default {
  async scheduled(event, env, ctx) {
    const signals = await fetchBotSignals();
    const active = Object.values(signals).filter(
      s => s && s.active !== false
    );
    if (!active.length) return;

    const text =
      "🔔 VolatiAI Signals:\n" +
      active
        .map(s => `- ${s.type} @ ${s.timestamp}`)
        .join("\n");

    await toot(text);
  }
};

async function toot(status) {
  await fetch(`${MASTODON_BASE}/api/v1/statuses`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${MASTODON_TOKEN}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ status })
  });
}
