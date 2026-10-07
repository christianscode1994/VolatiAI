const API_BASE = "https://volatiai-bot-api.your-worker.workers.dev";

async function j(url) {
  const res = await fetch(url);
  return res.json();
}

export const fetchBotRisk = () => j(`${API_BASE}/api/bot/risk`);
export const fetchBotOpportunity = () => j(`${API_BASE}/api/bot/opportunity`);
export const fetchBotNarrative = () => j(`${API_BASE}/api/bot/narrative`);
export const fetchBotFlow = () => j(`${API_BASE}/api/bot/flow`);
export const fetchBotReliability = () => j(`${API_BASE}/api/bot/reliability`);
export const fetchBotSignals = () => j(`${API_BASE}/api/bot/signal`);
