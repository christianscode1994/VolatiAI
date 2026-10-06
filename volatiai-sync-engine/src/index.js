// -------------------------------------------------------------
// RAW PATHS
// -------------------------------------------------------------
const RAW_UIO =
  "https://raw.githubusercontent.com/christianscode1994/VolatiAI/main/data/outputs/uio.json";

const RAW_HISTORY =
  "https://raw.githubusercontent.com/christianscode1994/VolatiAI/main/history/uio/";

// -------------------------------------------------------------
// Worker Entrypoints
// -------------------------------------------------------------
export default {
  async scheduled(event, env, ctx) {
    await runSync(env);
  },

  async fetch(request, env, ctx) {
    return new Response("VolatiAI Sync Engine is running", { status: 200 });
  }
};

// -------------------------------------------------------------
// Fetch latest UIO
// -------------------------------------------------------------
async function fetchUIO() {
  const res = await fetch(RAW_UIO);
  if (!res.ok) throw new Error("Failed to fetch uio.json");
  return res.json();
}

// -------------------------------------------------------------
// Fetch recent history (7 days)
// -------------------------------------------------------------
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

// -------------------------------------------------------------
// Build Pulse Snapshot
// -------------------------------------------------------------
function buildPulse(uio, now) {
  const isoHour = now.toISOString().slice(0, 13); // YYYY-MM-DDTHH
  return {
    path: `pulse/${isoHour}.json`,
    content: JSON.stringify(
      {
        timestamp: now.toISOString(),
        risk: uio.risk,
        opportunities: uio.opportunities,
        narrative: uio.narrative,
        flows: uio.flows
      },
      null,
      2
    )
  };
}

// -------------------------------------------------------------
// Build Daily History Snapshot
// -------------------------------------------------------------
function buildHistory(uio, now) {
  const isoDate = now.toISOString().slice(0, 10); // YYYY-MM-DD
  return {
    path: `history/uio/${isoDate}.json`,
    content: JSON.stringify(
      {
        date: isoDate,
        uio
      },
      null,
      2
    )
  };
}

// -------------------------------------------------------------
// Build Insight Cards
// -------------------------------------------------------------
function buildInsights(uio) {
  const topRisk = [...uio.risk.by_sector].sort((a, b) => b.score - a.score)[0];
  const topOpp = [...uio.opportunities].sort((a, b) => b.score - a.score)[0];

  return [
    {
      path: "insights/top_risk.json",
      content: JSON.stringify(
        {
          title: "Top Risk Sector",
          sector: topRisk.sector,
          score: topRisk.score,
          drivers: topRisk.drivers ?? []
        },
        null,
        2
      )
    },
    {
      path: "insights/top_opportunity.json",
      content: JSON.stringify(
        {
          title: "Top Opportunity Sector",
          sector: topOpp.sector,
          score: topOpp.score,
          drivers: topOpp.drivers ?? []
        },
        null,
        2
      )
    }
  ];
}

// -------------------------------------------------------------
// SIGNAL: Risk Spike
// -------------------------------------------------------------
function buildRiskSpikeSignal(uio, history) {
  const latest = uio.risk.global;
  const prev = history.length
    ? history[history.length - 1].uio.risk.global
    : latest;

  const delta = latest - prev;
  const threshold = 0.8;
  const spikeDelta = 0.05;

  if (latest > threshold && delta > spikeDelta) {
    return {
      path: "signals/risk_spike.json",
      content: JSON.stringify(
        {
          type: "risk_spike",
          timestamp: new Date().toISOString(),
          severity: "high",
          metric: "risk.global",
          value: latest,
          threshold,
          delta,
          context: uio.risk.by_sector
            .sort((a, b) => b.score - a.score)
            .slice(0, 3)
            .map(s => s.sector)
        },
        null,
        2
      )
    };
  }

  return {
    path: "signals/risk_spike.json",
    content: JSON.stringify(
      {
        type: "risk_spike",
        timestamp: new Date().toISOString(),
        active: false
      },
      null,
      2
    )
  };
}

// -------------------------------------------------------------
// SIGNAL: Opportunity Surge
// -------------------------------------------------------------
function buildOpportunitySurgeSignal(uio, history) {
  const latestTop = [...uio.opportunities].sort(
    (a, b) => b.score - a.score
  )[0];
  const prevTop = history.length
    ? [...history[history.length - 1].uio.opportunities].sort(
        (a, b) => b.score - a.score
      )[0]
    : latestTop;

  const delta = latestTop.score - prevTop.score;
  const surgeDelta = 0.05;

  if (delta > surgeDelta) {
    return {
      path: "signals/opportunity_surge.json",
      content: JSON.stringify(
        {
          type: "opportunity_surge",
          timestamp: new Date().toISOString(),
          sector: latestTop.sector,
          score: latestTop.score,
          delta,
          drivers: latestTop.drivers ?? []
        },
        null,
        2
      )
    };
  }

  return {
    path: "signals/opportunity_surge.json",
    content: JSON.stringify(
      {
        type: "opportunity_surge",
        timestamp: new Date().toISOString(),
        active: false
      },
      null,
      2
    )
  };
}

// -------------------------------------------------------------
// SIGNAL: Narrative Flip
// -------------------------------------------------------------
function buildNarrativeFlipSignal(uio, history) {
  const latest = uio.narrative.polarity;
  const prev = history.length
    ? history[history.length - 1].uio.narrative.polarity
    : latest;

  if (latest * prev < 0) {
    return {
      path: "signals/narrative_flip.json",
      content: JSON.stringify(
        {
          type: "narrative_flip",
          timestamp: new Date().toISOString(),
          from: prev,
          to: latest,
          arcs: uio.narrative.arcs
            .slice(0, 5)
            .map(a => ({ topic: a.topic, direction: a.direction }))
        },
        null,
        2
      )
    };
  }

  return {
    path: "signals/narrative_flip.json",
    content: JSON.stringify(
      {
        type: "narrative_flip",
        timestamp: new Date().toISOString(),
        active: false
      },
      null,
      2
    )
  };
}

// -------------------------------------------------------------
// SIGNAL: Flow Reversal
// -------------------------------------------------------------
function buildFlowReversalSignal(uio) {
  const reversals = uio.flows.dynamics.filter(d => d.reversal);
  const countThreshold = 5;

  if (reversals.length >= countThreshold) {
    return {
      path: "signals/flow_reversal.json",
      content: JSON.stringify(
        {
          type: "flow_reversal",
          timestamp: new Date().toISOString(),
          count: reversals.length,
          sectors: reversals.slice(0, 10).map(d => d.sector)
        },
        null,
        2
      )
    };
  }

  return {
    path: "signals/flow_reversal.json",
    content: JSON.stringify(
      {
        type: "flow_reversal",
        timestamp: new Date().toISOString(),
        active: false
      },
      null,
      2
    )
  };
}

// -------------------------------------------------------------
// SIGNAL: Systemic Hotspot
// -------------------------------------------------------------
function buildSystemicHotspotSignal(uio) {
  const systemic = uio.risk.systemic;
  const threshold = 0.75;

  if (systemic > threshold) {
    return {
      path: "signals/systemic_hotspot.json",
      content: JSON.stringify(
        {
          type: "systemic_hotspot",
          timestamp: new Date().toISOString(),
          value: systemic,
          threshold,
          hotspots: uio.risk.by_sector
            .filter(s => s.score > threshold)
            .map(s => ({ sector: s.sector, score: s.score }))
        },
        null,
        2
      )
    };
  }

  return {
    path: "signals/systemic_hotspot.json",
    content: JSON.stringify(
      {
        type: "systemic_hotspot",
        timestamp: new Date().toISOString(),
        active: false
      },
      null,
      2
    )
  };
}

// -------------------------------------------------------------
// Commit file to GitHub
// -------------------------------------------------------------
async function commitFile(env, file) {
  const [owner, repo] = env.GITHUB_REPO.split("/");
  const url = `https://api.github.com/repos/${owner}/${repo}/contents/${file.path}`;

  const contentB64 = btoa(file.content);

  const body = {
    message: `Sync Engine: update ${file.path}`,
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

// -------------------------------------------------------------
// Orchestrate Sync (FINAL)
// -------------------------------------------------------------
async function runSync(env) {
  const now = new Date();
  const uio = await fetchUIO();
  const history = await fetchRecentHistory(7);

  const pulse = buildPulse(uio, now);
  const historyFile = buildHistory(uio, now);
  const insights = buildInsights(uio);

  const signals = [
    buildRiskSpikeSignal(uio, history),
    buildOpportunitySurgeSignal(uio, history),
    buildNarrativeFlipSignal(uio, history),
    buildFlowReversalSignal(uio),
    buildSystemicHotspotSignal(uio)
  ];

  const files = [pulse, historyFile, ...insights, ...signals];

  for (const file of files) {
    await commitFile(env, file);
  }
}
