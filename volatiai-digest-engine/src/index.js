import {
  fetchBotRisk,
  fetchBotOpportunity,
  fetchBotNarrative,
  fetchBotFlow,
  fetchBotReliability
} from "volatiai-bots-core/client.js";

export default {
  async scheduled(event, env, ctx) {
    const risk = await fetchBotRisk();
    const opp = await fetchBotOpportunity();
    const narr = await fetchBotNarrative();
    const flow = await fetchBotFlow();
    const rel = await fetchBotReliability();

    const msg = [
      "📊 VolatiAI Daily Intelligence Digest",
      "",
      `🌋 Risk: ${risk.global.toFixed(2)} (sys: ${risk.systemic.toFixed(2)})`,
      `🌱 Opportunity: ${opp.top_opportunities[0].sector}`,
      `🧠 Narrative polarity: ${narr.polarity.toFixed(2)}`,
      `🌊 Flow: ${flow.dynamics[0].sector} (${flow.dynamics[0].direction})`,
      `🛡 Reliability: ${rel.v4.global.toFixed(2)}`,
      "",
      "Have a strong day."
    ].join("\n");

    await Promise.all([
      postTelegram(env, msg),
      postDiscord(env, msg),
      postSlack(env, msg),
      postMastodon(env, msg),
      postBluesky(env, msg),
      postNostr(env, msg)
    ]);
  }
};
