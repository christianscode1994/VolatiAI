async function loadJSON(path) {
  const res = await fetch(path);
  return await res.json();
}

async function initDashboard() {
  const intel = await loadJSON("intel.json");
  const swarm = await loadJSON("swarm.json");

  renderGlobalIntel(intel);
  renderDSI(intel);
  renderRPC(intel);
  renderDepth(intel);
  renderTrend(intel);
  renderNarrative(intel);
  renderSwarm(swarm);
}

function renderGlobalIntel(intel) {
  const el = document.getElementById("global-intel");
  el.innerHTML = `
    <p><strong>Direction:</strong> ${intel.global.direction}</p>
    <p><strong>Chain Integrity:</strong> ${intel.global.chain_integrity}</p>
    <p><strong>Score:</strong> ${intel.global.score}</p>
  `;
}

function renderDSI(intel) {
  const ctx = document.getElementById("dsiChart").getContext("2d");
  const dsi = intel.dsi.map(x => x.value);
  const labels = intel.dsi.map(x => x.project);

  new Chart(ctx, {
    type: "bar",
    data: {
      labels,
      datasets: [{
        label: "Developer Sentiment Index (DSI)",
        data: dsi,
        backgroundColor: "#3b82f6"
      }]
    }
  });
}

function renderRPC(intel) {
  const ctx = document.getElementById("rpcChart").getContext("2d");
  const truth = intel.rpc_truth.map(x => x.value);
  const labels = intel.rpc_truth.map(x => x.project);

  new Chart(ctx, {
    type: "line",
    data: {
      labels,
      datasets: [{
        label: "RPC Truth Score",
        data: truth,
        borderColor: "#10b981"
      }]
    }
  });
}

function renderDepth(intel) {
  const ctx = document.getElementById("depthChart").getContext("2d");
  const whale = intel.depth.map(x => x.whale_pressure);
  const spoof = intel.depth.map(x => x.spoofing_prob);
  const labels = intel.depth.map(x => x.project);

  new Chart(ctx, {
    type: "radar",
    data: {
      labels,
      datasets: [
        {
          label: "Whale Pressure",
          data: whale,
          borderColor: "#ef4444"
        },
        {
          label: "Spoofing Probability",
          data: spoof,
          borderColor: "#f59e0b"
        }
      ]
    }
  });
}

function renderTrend(intel) {
  const ctx = document.getElementById("trendChart").getContext("2d");
  const trend = intel.devactivity
    .filter(x => x.metric === "trend_accel")
    .map(x => x.value);

  const labels = intel.devactivity
    .filter(x => x.metric === "trend_accel")
    .map(x => x.project);

  new Chart(ctx, {
    type: "bar",
    data: {
      labels,
      datasets: [{
        label: "Trend Acceleration",
        data: trend,
        backgroundColor: "#8b5cf6"
      }]
    }
  });
}

function renderNarrative(intel) {
  const el = document.getElementById("narrativeTimeline");
  el.innerHTML = "<p>Narrative timeline coming soon…</p>";
}

function renderSwarm(swarm) {
  const el = document.getElementById("swarmClusters");
  const clusters = swarm.clusters;

  el.innerHTML = `
    <p><strong>Opportunity Agents:</strong> ${clusters.opportunity.length}</p>
    <p><strong>Risk Agents:</strong> ${clusters.risk.length}</p>
    <p><strong>Volatility Agents:</strong> ${clusters.volatility.length}</p>
    <p><strong>Pressure Agents:</strong> ${clusters.pressure.length}</p>
    <p><strong>Trend Agents:</strong> ${clusters.trend.length}</p>
    <p><strong>Anomaly Agents:</strong> ${clusters.anomaly.length}</p>
    <p><strong>Global Agents:</strong> ${clusters.global.length}</p>
    <p><strong>Whale Agents:</strong> ${clusters.whale.length}</p>
    <p><strong>Spoofing Agents:</strong> ${clusters.spoofing.length}</p>
    <p><strong>RPC Agents:</strong> ${clusters.rpc.length}</p>
  `;
}

initDashboard();
