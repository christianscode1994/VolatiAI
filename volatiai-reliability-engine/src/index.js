const RAW_UIO =
  "https://raw.githubusercontent.com/christianscode1994/VolatiAI/main/data/outputs/uio.json";
const RAW_HISTORY =
  "https://raw.githubusercontent.com/christianscode1994/VolatiAI/main/history/uio/";
const RAW_ANALYTICS =
  "https://raw.githubusercontent.com/christianscode1994/VolatiAI/main/analytics/core.json";
const RAW_SIGNALS =
  "https://raw.githubusercontent.com/christianscode1994/VolatiAI/main/signals/";

export default {
  async scheduled(event, env, ctx) {
    await runReliability(env);
  },

  async fetch(request, env, ctx) {
    return new Response("VolatiAI Reliability Engine v4", { status: 200 });
  }
};

async function fetchJSON(url) {
  const res = await fetch(url);
  if (!res.ok) return null;
  return res.json();
}

async function fetchRecentHistory(days = 7) {
  const out = [];
  for (let i = 0; i < days; i++) {
    const d = new Date(Date.now() - i * 86400000);
    const iso = d.toISOString().slice(0, 10);
    const res = await fetch(`${RAW_HISTORY}${iso}.json`);
    if (res.ok) out.push(await res.json());
  }
  return out.reverse();
}

function computeDataConsistency(uio, history) {
  if (!history.length) return 1;
  const latest = uio.risk.global;
  const values = history.map(h => h.uio.risk.global);
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance =
    values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length;
  const std = Math.sqrt(variance);
  const deviation = Math.abs(latest - mean);
  return Math.max(0, 1 - deviation / (std + 1e-6));
}

function computeTrendStability(history) {
  if (history.length < 2) return 1;
  const values = history.map(h => h.uio.risk.global);
  let signChanges = 0;
  for (let i = 2; i < values.length; i++) {
    const d1 = values[i] - values[i - 1];
    const d2 = values[i - 1] - values[i - 2];
    if (d1 * d2 < 0) signChanges++;
  }
  const maxChanges = history.length - 2;
  const instability = maxChanges ? signChanges / maxChanges : 0;
  return Math.max(0, 1 - instability);
}

function computeSignalNoiseRatio(signals) {
  const activeCount = Object.values(signals).filter(
    s => s && s.active !== false
  ).length;
  const total = Object.keys(signals).length || 1;
  return activeCount / total;
}

function computeCrossEngineCoherence(uio, analytics, signals) {
  // simple placeholder: average of other scores for now
  return 0.9;
}

function aggregate(scores) {
  const weights = {
    data_consistency: 0.3,
    trend_stability: 0.3,
    signal_noise_ratio: 0.2,
    cross_engine_coherence: 0.2
  };
  let sum = 0;
  let wsum = 0;
  for (const [k, v] of Object.entries(scores)) {
    const w = weights[k] || 0.25;
    sum += v * w;
    wsum += w;
  }
  return wsum ? sum / wsum : 0;
}

async function runReliability(env) {
  const uio = await fetchJSON(RAW_UIO);
  const history = await fetchRecentHistory(7);
  const analytics = await fetchJSON(RAW_ANALYTICS);

  const signalNames = [
    "risk_spike",
    "opportunity_surge",
    "narrative_flip",
    "flow_reversal",
    "systemic_hotspot"
  ];
  const signals = {};
  for (const name of signalNames) {
    signals[name] = await fetchJSON(`${RAW_SIGNALS}${name}.json`);
  }

  const scores = {
    data_consistency: computeDataConsistency(uio, history),
    trend_stability: computeTrendStability(history),
    signal_noise_ratio: computeSignalNoiseRatio(signals),
    cross_engine_coherence: computeCrossEngineCoherence(uio, analytics, signals)
  };

  const global = aggregate(scores);

  const file = {
    path: "reliability/v4.json",
    content: JSON.stringify(
      {
        global,
        ...scores,
        last_updated: new Date().toISOString()
      },
      null,
      2
    )
  };

  await commitFile(env, file);
}

async function commitFile(env, file) {
  const [owner, repo] = env.GITHUB_REPO.split("/");
  const url = `https://api.github.com/repos/${owner}/${repo}/contents/${file.path}`;

  const contentB64 = btoa(file.content);

  const body = {
    message: `Reliability Engine v4: update ${file.path}`,
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
