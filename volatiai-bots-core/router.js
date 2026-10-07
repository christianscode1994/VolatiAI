import {
  fetchBotRisk,
  fetchBotOpportunity,
  fetchBotNarrative,
  fetchBotFlow,
  fetchBotReliability,
  fetchBotSignals
} from "./client.js";

import {
  formatRiskMessage,
  formatOpportunityMessage,
  formatSignalsMessage
} from "./formatters.js";

export async function handleCommand(raw) {
  const cmd = raw.trim();

  switch (cmd) {
    case "/risk":
      return formatRiskMessage(await fetchBotRisk());

    case "/opp":
      return formatOpportunityMessage(await fetchBotOpportunity());

    case "/signals":
      return formatSignalsMessage(await fetchBotSignals());

    case "/narr":
      return "🧠 Narrative endpoint wired; formatter pending.";
    case "/flow":
      return "🌊 Flow endpoint wired; formatter pending.";
    case "/rel":
      return "🛡 Reliability v4 wired; formatter pending.";
    case "/trend":
      return "📈 Trend analytics wired; formatter pending.";

    case "/ping":
      return "VolatiAI online ⚡";

    case "/about":
      return "VolatiAI — serverless intelligence engine.";

    case "/help":
      return `
Commands:
  /risk
  /opp
  /signals
  /narr
  /flow
  /rel
  /trend
  /ping
  /about
      `.trim();

    default:
      return "Unknown command. Use /help.";
  }
}
