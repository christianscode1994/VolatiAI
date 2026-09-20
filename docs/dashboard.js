async function loadJSON(path) {
  const res = await fetch(path);
  return await res.json();
}

async function initDashboard() {
  try {
    const intel = await loadJSON("intel.json");
    const swarm = await loadJSON("swarm.json");

    renderSnapshotTime(intel);
    renderGlobalIntel(intel);
    renderIntelCards(intel);

    renderDSI(intel);
    renderDevVelocity(intel);

    renderRPC(intel);
    renderRPCSpread(intel);

    renderDepth(intel);
    renderSpoof(intel);

    renderTrend(intel);
    renderNarrative(intel);

    renderSwarmClusters(swarm);
    renderSwarmAgents(swarm);
  } catch (err) {
    console.error("Dashboard init failed:", err);
  }
}

function renderSnapshotTime(intel) {
  const el = document.getElementById("snapshotTime");
  if (!intel.ts) {
    el.textContent = "Last updated: (no timestamp)";
    return;
  }
  el.textContent = `Last updated: ${new Date(intel.ts).toLocaleString()}`;
}

function renderGlobalIntel(intel) {
  const el = document.getElementById("global-intel");
  const g = intel.global || {};
  const dir = g.direction || "neutral";
  const chain = g.chain_integrity ?? 0;
  const score = g.score ?? 0;

  el.innerHTML = `
    <span><strong>Direction:</strong> ${dir}</span>
    <span><strong>Chain Integrity:</strong> ${chain.toFixed ? chain.toFixed(2) : chain}</span>
    <span><strong>Global Score:</strong> ${score.toFixed ? score.toFixed(2) : score}</span>
  `;
}

function renderIntelCards(intel) {
  const dsiAvg = avg((intel.dsi || []).map(x => x.value));
  const rpcAvg = avg((intel.rpc_truth || []).map(x => x.value));
  const depthAvg = avg((intel.depth || []).map(x => x.whale_pressure ?? 0));
  const trendAvg = avg(
    (intel.devactivity || [])
      .filter(x => x.metric === "trend_accel")
      .map(x => x.value)
  );

  document.getElementById("card-dsi").innerHTML =
    `<h3>DSI</h3><p>${dsiAvg.toFixed(2)}</p>`;

  document.getElementById("card-rpc").innerHTML =
    `<h3>RPC Truth</h3><p>${rpcAvg.toFixed(2)}</p>`;

  document.getElementById("card-depth").innerHTML =
    `<h3>Whale Pressure</h3><p>${depthAvg.toFixed(2)}</p>`;

  document.getElementById("card-trend").innerHTML =
    `<h3>Trend Accel</h3><p>${trendAvg.toFixed(2)}</p>`;
}

/* Charts */

function renderDSI(intel) {
  const ctx = document.getElementById("dsiChart").getContext("2d");
  const dsi = intel.dsi || [];
  const labels = dsi.map(x => x.project);
  const data = dsi.map(x => x.value);

  new Chart(ctx, {
    type: "bar",
    data: {
      labels,
      datasets: [{
        label: "Developer Sentiment Index",
        data,
        backgroundColor: "#3b82f6"
      }]
    },
    options: {
      plugins: { legend: { display: false } },
      scales: { y: { beginAtZero: true, max: 100 } }
    }
  });
}

function renderDevVelocity(intel) {
  const ctx = document.getElementById("devVelocityChart").getContext("2d");
  const dev = intel.devactivity || [];
  const commits = dev.filter(x => x.metric === "commits_7d");
  const labels = commits.map(x => x.project);
  const data = commits.map(x => x.value);

  new Chart(ctx, {
    type: "line",
    data: {
      labels,
      datasets: [{
        label: "Commit Velocity (7d)",
        data,
        borderColor: "#8b5cf6",
        tension: 0.3
      }]
    },
    options: {
      plugins: { legend: { display: false } },
      scales: { y: { beginAtZero: true } }
    }
  });
}

function renderRPC(intel) {
  const ctx = document.getElementById("rpcChart").getContext("2d");
  const rpc = intel.rpc_truth || [];
  const labels = rpc.map(x => x.project);
  const data = rpc.map(x => x.value);

  new Chart(ctx, {
    type: "line",
    data: {
      labels,
      datasets: [{
        label: "RPC Truth Score",
        data,
        borderColor: "#10b981",
        tension: 0.3
      }]
    },
    options: {
      plugins: { legend: { display: false } },
      scales: { y: { beginAtZero: true, max: 100 } }
    }
  });
}

function renderRPCSpread(intel) {
  const ctx = document.getElementById("rpcSpreadChart").getContext("2d");
  const rpc = intel.rpc_truth || [];
  const labels = rpc.map(x => x.project);
  const spreads = rpc.map(x => x.height_spread ?? 0);

  new Chart(ctx, {
    type: "bar",
    data: {
      labels,
      datasets: [{
        label: "Height Spread",
        data: spreads,
        backgroundColor: "#f59e0b"
      }]
    },
    options: {
      plugins: { legend: { display: false } },
      scales: { y: { beginAtZero: true } }
    }
  });
}

function renderDepth(intel) {
  const ctx = document.getElementById("depthChart").getContext("2d");
  const depth = intel.depth || [];
  const labels = depth.map(x => x.project);
  const whale = depth.map(x => x.whale_pressure ?? 0);
  const stress = depth.map(x => x.liquidity_stress ?? 0);

  new Chart(ctx, {
    type: "radar",
    data: {
      labels,
      datasets: [
        {
          label: "Whale Pressure",
          data: whale,
          borderColor: "#ef4444",
          backgroundColor: "rgba(239,68,68,0.2)"
        },
        {
          label: "Liquidity Stress",
          data: stress,
          borderColor: "#3b82f6",
          backgroundColor: "rgba(59,130,246,0.2)"
        }
      ]
    },
    options: {
      plugins: { legend: { position: "bottom" } }
    }
  });
}

function renderSpoof(intel) {
  const ctx = document.getElementById("spoofChart").getContext("2d");
  const depth = intel.depth || [];
  const labels = depth.map(x => x.project);
  const spoof = depth.map(x => x.spoofing_prob ?? 0);

  new Chart(ctx, {
    type: "bar",
    data: {
      labels,
      datasets: [{
        label: "Spoofing Probability",
        data: spoof,
        backgroundColor: "#f97316"
      }]
    },
    options: {
      plugins: { legend: { display: false } },
      scales: { y: { beginAtZero: true, max: 1 } }
    }
  });
}

function renderTrend(intel) {
  const ctx = document.getElementById("trendChart").getContext("2d");
  const dev = intel.devactivity || [];
  const trend = dev.filter(x => x.metric === "trend_accel");
  const labels = trend.map(x => x.project);
  const data = trend.map(x => x.value);

  new Chart(ctx, {
    type: "bar",
    data: {
      labels,
      datasets: [{
        label: "Trend Acceleration",
        data,
        backgroundColor: "#8b5cf6"
      }]
    },
    options: {
      plugins: { legend: { display: false } },
      scales: { y: { beginAtZero: true } }
    }
  });
}

/* Narrative */

function renderNarrative(intel) {
  const el = document.getElementById("narrativeTimeline");
  el.innerHTML = "";

  const narratives = intel.narratives || [];
  if (!narratives.length) {
    el.innerHTML = "<p class='muted'>No narratives yet.</p>";
    return;
  }

  narratives.forEach(n => {
    const div = document.createElement("div");
    div.className = "timeline-item";
    div.innerHTML = `
      <h4>${n.tag}</h4>
      <p>Strength: ${n.strength.toFixed(2)} · Momentum: ${n.momentum.toFixed(2)}</p>
      <p>Phase: ${n.phase}</p>
    `;
    el.appendChild(div);
  });
}

/* Swarm */

function renderSwarmClusters(swarm) {
  const el = document.getElementById("swarmClusters");
  el.innerHTML = "";

  const clusters = swarm.clusters || {};
  const entries = Object.entries(clusters);

  entries.forEach(([name, agents]) => {
    const div = document.createElement("div");
    div.className = "swarm-cluster-card";
    div.innerHTML = `
      <h3>${name}</h3>
      <p>${agents.length} agents</p>
    `;
    el.appendChild(div);
  });
}

function renderSwarmAgents(swarm) {
  const el = document.getElementById("swarmViz");
  el.innerHTML = "";

  const agents = swarm.swarm || [];
  agents.forEach(agent => {
    const div = document.createElement("div");
    div.className = "agent-pill";
    div.textContent = `${agent.personality} · ${agent.action}`;
    el.appendChild(div);
  });
}

/* Utils */

function avg(arr) {
  return arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
}

initDashboard();
