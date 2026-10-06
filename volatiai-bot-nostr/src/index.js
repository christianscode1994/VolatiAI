import { fetchBotSignals } from "volatiai-bots-core/client.js";
// use a nostr lib in Node, or hand-roll event JSON + signature

export default {
  async scheduled(event, env, ctx) {
    const signals = await fetchBotSignals();
    const active = Object.values(signals).filter(
      s => s && s.active !== false
    );
    if (!active.length) return;

    const content =
      "🔔 VolatiAI Signals:\n" +
      active
        .map(s => `- ${s.type} @ ${s.timestamp}`)
        .join("\n");

    // build nostr event and publish to relays
  }
};
