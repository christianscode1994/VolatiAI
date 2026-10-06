const RAW_UIO =
  "https://raw.githubusercontent.com/christianscode1994/VolatiAI/main/data/outputs/uio.json";
const RAW_SIGNALS =
  "https://raw.githubusercontent.com/christianscode1994/VolatiAI/main/signals/";
const RAW_RELIABILITY =
  "https://raw.githubusercontent.com/christianscode1994/VolatiAI/main/reliability/";
const RAW_ANALYTICS =
  "https://raw.githubusercontent.com/christianscode1994/VolatiAI/main/analytics/";

export default {
  async fetch(request) {
    const url = new URL(request.url);
    const path = url.pathname;

    if (path === "/api/bot/risk") return botRisk();
    if (path === "/api/bot/opportunity") return botOpportunity();
    if (path === "/api/bot/narrative") return botNarrative();
    if (path === "/api/bot/flow") return botFlow();
    if (path === "/api/bot/reliability") return botReliability();
    if (path === "/api/bot/signal") return botSignals();

    return new Response("VolatiAI Bot Intelligence API", { status: 200 });
  }
};

async function fetchJSON(url) {
  const res = await fetch(url);
  if (!res.ok) return null;
  return res.json();
}

async function botRisk() {
  const uio = await fetchJSON(RAW_UIO);
  const riskSignal = await fetchJSON(`${RAW_SIGNALS}risk_spike.json`);

  const payload = {
    global: uio.risk.global,
    systemic: uio.risk.systemic,
    top_sectors: uio.risk.by_sector
      .sort((a, b) => b.score - a.score)
      .slice(0, 3),
    latest_signal: riskSignal?.active === false ? null : riskSignal
  };

  return json(payload);
}

async function botOpportunity() {
  const uio = await fetchJSON(RAW_UIO);
  const oppSignal = await fetchJSON(`${RAW_SIGNALS}opportunity_surge.json`);

  const top = [...uio.opportunities].sort((a, b) => b.score - a.score).slice(0, 5);

  const payload = {
    top_opportunities: top,
    latest_signal: oppSignal?.active === false ? null : oppSignal
  };

  return json(payload);
}

async function botNarrative() {
  const uio = await fetchJSON(RAW_UIO);
  const flipSignal = await fetchJSON(`${RAW_SIGNALS}narrative_flip.json`);

  const payload = {
    polarity: uio.narrative.polarity,
    arcs: uio.narrative.arcs.slice(0, 10),
    latest_signal: flipSignal?.active === false ? null : flipSignal
  };

  return json(payload);
}

async function botFlow() {
  const uio = await fetchJSON(RAW_UIO);
  const flowSignal = await fetchJSON(`${RAW_SIGNALS}flow_reversal.json`);

  const payload = {
    dynamics: uio.flows.dynamics.slice(0, 20),
    latest_signal: flowSignal?.active === false ? null : flowSignal
  };

  return json(payload);
}

async function botReliability() {
  const v3 = await fetchJSON(`${RAW_RELIABILITY}v3.json`);
  const v4 = await fetchJSON(`${RAW_RELIABILITY}v4.json`);

  const payload = {
    v3,
    v4
  };

  return json(payload);
}

async function botSignals() {
  const names = [
    "risk_spike",
    "opportunity_surge",
    "narrative_flip",
    "flow_reversal",
    "systemic_hotspot"
  ];

  const signals = {};
  for (const name of names) {
    signals[name] = await fetchJSON(`${RAW_SIGNALS}${name}.json`);
  }

  return json(signals);
}

function json(obj) {
  return new Response(JSON.stringify(obj), {
    headers: { "Content-Type": "application/json" }
  });
}
