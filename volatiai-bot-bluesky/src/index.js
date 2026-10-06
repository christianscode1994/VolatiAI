import { fetchBotSignals } from "volatiai-bots-core/client.js";

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

    await postBluesky(text, env);
  }
};

// pseudo: use your existing Bluesky client here
async function postBluesky(text, env) {
  // call your atproto client with env.BLUESKY_HANDLE / env.BLUESKY_APP_PASSWORD
}
