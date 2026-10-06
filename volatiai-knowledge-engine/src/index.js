const RAW_UIO =
  "https://raw.githubusercontent.com/christianscode1994/VolatiAI/main/data/outputs/uio.json";
const RAW_ANALYTICS =
  "https://raw.githubusercontent.com/christianscode1994/VolatiAI/main/analytics/core.json";
const RAW_SIGNALS =
  "https://raw.githubusercontent.com/christianscode1994/VolatiAI/main/signals/";
const RAW_RELIABILITY =
  "https://raw.githubusercontent.com/christianscode1994/VolatiAI/main/reliability/v4.json";

export default {
  async scheduled(event, env, ctx) {
    await runKnowledge(env);
  },

  async fetch(request, env, ctx) {
    return new Response("VolatiAI Knowledge Engine", { status: 200 });
  }
};

async function fetchJSON(url) {
  const res = await fetch(url);
  if (!res.ok) return null;
  return res.json();
}

async function runKnowledge(env) {
  const uio = await fetchJSON(RAW_UIO);
  const analytics = await fetchJSON(RAW_ANALYTICS);
  const reliability = await fetchJSON(RAW_RELIABILITY);

  const signals = {};
  const signalNames = [
    "risk_spike",
    "opportunity_surge",
    "narrative_flip",
    "flow_reversal",
    "systemic_hotspot"
  ];
  for (const name of signalNames) {
    signals[name] = await fetchJSON(`${RAW_SIGNALS}${name}.json`);
  }

  const files = [
    buildRiskCard(uio, analytics, signals),
    buildOpportunityCard(uio, analytics, signals),
    buildNarrativeCard(uio, analytics, signals),
    buildFlowCard(uio, analytics, signals),
    buildReliabilityCard(reliability),
    buildTrendCard(analytics)
  ];

  for (const file of files) {
    await commitFile(env, file);
  }
}

function buildRiskCard(uio, analytics, signals) {
  const now = new Date().toISOString();
  const riskSpike = signals.risk_spike?.active === false ? null : signals.risk_spike;

  const md = `
# VolatiAI Risk Card

_Last updated: ${now}_

## Global Risk

- Current: ${uio.risk.global.toFixed(2)}
- Systemic: ${uio.risk.systemic.toFixed(2)}
- Volatility (7d): ${analytics?.risk_volatility_7d?.toFixed(2) ?? "n/a"}

## Top Risk Sectors

${uio.risk.by_sector
  .sort((a, b) => b.score - a.score)
  .slice(0, 5)
  .map(s => `- ${s.sector} — ${s.score.toFixed(2)}`)
  .join("\n")}

## Recent Signals

${
  riskSpike
    ? `- ${riskSpike.timestamp} — risk_spike (value: ${riskSpike.value.toFixed(
        2
      )}, delta: ${riskSpike.delta.toFixed(2)})`
    : "- None active"
}
`.trim();

  return {
    path: "knowledge/risk.md",
    content: md
  };
}

function buildOpportunityCard(uio, analytics, signals) {
  const now = new Date().toISOString();
  const surge = signals.opportunity_surge?.active === false
    ? null
    : signals.opportunity_surge;

  const top = [...uio.opportunities].sort((a, b) => b.score - a.score).slice(0, 5);

  const md = `
# VolatiAI Opportunity Card

_Last updated: ${now}_

## Top Opportunities

${top
  .map(
    o =>
      `- ${o.sector} — ${o.score.toFixed(2)}${
        o.drivers?.length ? ` (drivers: ${o.drivers.join(", ")})` : ""
      }`
  )
  .join("\n")}

## Recent Signals

${
  surge
    ? `- ${surge.timestamp} — opportunity_surge (${surge.sector}, delta: ${surge.delta.toFixed(
        2
      )})`
    : "- None active"
}
`.trim();

  return {
    path: "knowledge/opportunity.md",
    content: md
  };
}

function buildNarrativeCard(uio, analytics, signals) {
  const now = new Date().toISOString();
  const flip = signals.narrative_flip?.active === false
    ? null
    : signals.narrative_flip;

  const md = `
# VolatiAI Narrative Card

_Last updated: ${now}_

## Polarity

- Current polarity: ${uio.narrative.polarity.toFixed(2)}

## Key Arcs

${uio.narrative.arcs
  .slice(0, 10)
  .map(a => `- ${a.topic} — ${a.direction}`)
  .join("\n")}

## Recent Signals

${
  flip
    ? `- ${flip.timestamp} — narrative_flip (from ${flip.from.toFixed(
        2
      )} to ${flip.to.toFixed(2)})`
    : "- None active"
}
`.trim();

  return {
    path: "knowledge/narrative.md",
    content: md
  };
}

function buildFlowCard(uio, analytics, signals) {
  const now = new Date().toISOString();
  const flow = signals.flow_reversal?.active === false
    ? null
    : signals.flow_reversal;

  const md = `
# VolatiAI Flow Card

_Last updated: ${now}_

## Dynamics

${uio.flows.dynamics
  .slice(0, 10)
  .map(d => `- ${d.sector} — ${d.direction} (reversal: ${d.reversal ? "yes" : "no"})`)
  .join("\n")}

## Recent Signals

${
  flow
    ? `- ${flow.timestamp} — flow_reversal (count: ${flow.count}, sectors: ${flow.sectors.join(
        ", "
      )})`
    : "- None active"
}
`.trim();

  return {
    path: "knowledge/flow.md",
    content: md
  };
}

function buildReliabilityCard(reliability) {
  const now = new Date().toISOString();

  const md = `
# VolatiAI Reliability Card

_Last updated: ${now}_

## Reliability v4

- Global: ${reliability.global.toFixed(2)}
- Data consistency: ${reliability.data_consistency.toFixed(2)}
- Trend stability: ${reliability.trend_stability.toFixed(2)}
- Signal-noise ratio: ${reliability.signal_noise_ratio.toFixed(2)}
- Cross-engine coherence: ${reliability.cross_engine_coherence.toFixed(2)}
`.trim();

  return {
    path: "knowledge/reliability.md",
    content: md
  };
}

function buildTrendCard(analytics) {
  const now = new Date().toISOString();

  const md = `
# VolatiAI Trend Card

_Last updated: ${now}_

## Core Metrics

- Risk volatility (7d): ${analytics?.risk_volatility_7d?.toFixed(2) ?? "n/a"}
- Narrative polarity index: ${
    analytics?.narrative_polarity_index?.toFixed(2) ?? "n/a"
  }
- Flow coherence: ${analytics?.flow_coherence?.toFixed(2) ?? "n/a"}
- Reliability drift: ${analytics?.reliability_drift?.toFixed(2) ?? "n/a"}
`.trim();

  return {
    path: "knowledge/trend.md",
    content: md
  };
}

async function commitFile(env, file) {
  const [owner, repo] = env.GITHUB_REPO.split("/");
  const url = `https://api.github.com/repos/${owner}/${repo}/contents/${file.path}`;

  const contentB64 = btoa(file.content);

  const body = {
    message: `Knowledge Engine: update ${file.path}`,
    content: contentB64,
    branch: env.GITHUB_BRANCH
  };

  const res = await fetch(url, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${env.GITHUB_TOKEN}`,
      Accept: "application/vnd.github+json",
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });

  if (!res.ok) {
    const text = await res.text();
    console.error("GitHub commit failed:", file.path, text);
  }
}
