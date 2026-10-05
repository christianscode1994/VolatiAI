const RAW_UIO =
  "https://raw.githubusercontent.com/christianscode1994/VolatiAI/main/data/outputs/uio.json";

export default {
  async scheduled(event, env, ctx) {
    await runSync(env);
  },

  async fetch(request, env, ctx) {
    return new Response("VolatiAI Sync Engine is running", { status: 200 });
  }
};

// -----------------------------
// Fetch latest UIO
// -----------------------------
async function fetchUIO() {
  const res = await fetch(RAW_UIO);
  if (!res.ok) throw new Error("Failed to fetch uio.json");
  return res.json();
}

// -----------------------------
// Build Pulse Snapshot
// -----------------------------
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

// -----------------------------
// Build Daily History Snapshot
// -----------------------------
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

// -----------------------------
// Build Insight Cards
// -----------------------------
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

// -----------------------------
// Commit file to GitHub
// -----------------------------
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

// -----------------------------
// Orchestrate Sync
// -----------------------------
async function runSync(env) {
  const now = new Date();
  const uio = await fetchUIO();

  const pulse = buildPulse(uio, now);
  const history = buildHistory(uio, now);
  const insights = buildInsights(uio);

  const files = [pulse, history, ...insights];

  for (const file of files) {
    await commitFile(env, file);
  }
}
