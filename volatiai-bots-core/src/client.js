const API_BASE = "https://volatiai-bot-api.your-worker.workers.dev";

export async function fetchBotRisk() {
  const res = await fetch(`${API_BASE}/api/bot/risk`);
  return res.json();
}

export async function fetchBotOpportunity() {
  const res = await fetch(`${API_BASE}/api/bot/opportunity`);
  return res.json();
}

export async function fetchBotNarrative() {
  const res = await fetch(`${API_BASE}/api/bot/narrative`);
  return res.json();
}

export async function fetchBotFlow() {
  const res = await fetch(`${API_BASE}/api/bot/flow`);
  return res.json();
}

export async function fetchBotReliability() {
  const res = await fetch(`${API_BASE}/api/bot/reliability`);
  return res.json();
}

export async function fetchBotSignals() {
  const res = await fetch(`${API_BASE}/api/bot/signal`);
  return res.json();
}
