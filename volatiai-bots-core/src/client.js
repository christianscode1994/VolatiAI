const API_BASE = "https://volatiai-bot-api.your-worker-domain.workers.dev";

export async function fetchBotRisk() {
  const res = await fetch(`${API_BASE}/api/bot/risk`);
  return res.json();
}

export async function fetchBotOpportunity() {
  const res = await fetch(`${API_BASE}/api/bot/opportunity`);
  return res.json();
}

export async function fetchBotSignals() {
  const res = await fetch(`${API_BASE}/api/bot/signal`);
  return res.json();
}
