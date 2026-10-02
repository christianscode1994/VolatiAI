// reliability.js — VolatiAI Reliability Scoring Engine

import fs from "fs";
import path from "path";

function getSectorFromUrl(url) {
  const match = url.match(/https:\/\/(sector-[^.]+)\./);
  return match ? match[1] : "unknown";
}

// Global reliability formula:
// status OK (0.7) + JSON valid (0.2) + latency < 500ms (0.1)
export function runReliabilityAnalysis() {
  const healthPath = path.join(process.cwd(), "public", "health.json");
  const intelPath = path.join(process.cwd(), "public", "intel.json");

  if (!fs.existsSync(healthPath) || !fs.existsSync(intelPath)) {
    console.log("Reliability: Missing health.json or intel.json");
    return;
  }

  const health = JSON.parse(fs.readFileSync(healthPath, "utf8"));
  const intel = JSON.parse(fs.readFileSync(intelPath, "utf8"));

  const workers = health.workers.map((w) => {
    const reliabilityScore =
      (w.status === "OK" ? 0.7 : 0) +
      (w.jsonValid ? 0.2 : 0) +
      (w.latency_ms < 500 ? 0.1 : 0);

    const reliability = Number(reliabilityScore.toFixed(2));
    const sector = getSectorFromUrl(w.url);

    return {
      url: w.url,
      sector,
      status: w.status,
      latency_ms: w.latency_ms,
      jsonValid: w.jsonValid,
      reliability,
      error: w.error || null
    };
  });

  const avgReliability =
    workers.reduce((a, b) => a + b.reliability, 0) / workers.length;

  // Sector reliability breakdown
  const sectorMap = {};
  workers.forEach((w) => {
    if (!sectorMap[w.sector]) {
      sectorMap[w.sector] = { sector: w.sector, sum: 0, count: 0 };
    }
    sectorMap[w.sector].sum += w.reliability;
    sectorMap[w.sector].count += 1;
  });

  const sectorReliability = Object.values(sectorMap).map((s) => ({
    sector: s.sector,
    avgReliability: Number((s.sum / s.count).toFixed(2))
  }));

  const output = {
    timestamp: Date.now(),
    avgReliability: Number(avgReliability.toFixed(2)),
    workers,
    sectorReliability,
    intelligence: intel.intelligence
  };

  writeReliabilityFiles(output);
  writeReliabilityHistory(output); // for sector reliability trend graph
  return output;
}

function writeReliabilityFiles(data) {
  const outDir = path.join(process.cwd(), "public");

  // JSON output
  fs.writeFileSync(
    path.join(outDir, "reliability.json"),
    JSON.stringify(data, null, 2)
  );

  // HTML dashboard (combined intel + health + reliability)
  const html = `
<!doctype html>
<html>
<head>
  <title>VolatiAI Reliability Dashboard</title>
  <style>
    body { font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; padding: 20px; background: #0b0c10; color: #e5e5e5; }
    h1, h2 { color: #ffffff; }
    a { color: #4fd1c5; }
    table { border-collapse: collapse; width: 100%; margin-top: 16px; }
    th, td { border: 1px solid #333; padding: 8px; font-size: 13px; }
    th { background: #111827; }
    .bad { background: #7f1d1d; }
    .ok { background: #78350f; }
    .good { background: #064e3b; }
    .pill { display: inline-block; padding: 2px 8px; border-radius: 999px; font-size: 11px; }
  </style>
</head>
<body>
  <h1>VolatiAI Reliability Dashboard</h1>
  <p>Updated: ${new Date(data.timestamp).toISOString()}</p>

  <h2>Global Reliability Score: ${data.avgReliability}</h2>

  <h2>Intelligence Snapshot</h2>
  <pre>${JSON.stringify(data.intelligence, null, 2)}</pre>

  <h2>Sector Reliability Breakdown</h2>
  <table>
    <tr>
      <th>Sector</th>
      <th>Average Reliability</th>
    </tr>
    ${data.sectorReliability
      .map((s) => {
        const cls =
          s.avgReliability >= 0.8
            ? "good"
            : s.avgReliability >= 0.5
            ? "ok"
            : "bad";

        return `
        <tr class="${cls}">
          <td>${s.sector}</td>
          <td>${s.avgReliability}</td>
        </tr>`;
      })
      .join("")}
  </table>

  <h2>Worker Reliability Table</h2>
  <table>
    <tr>
      <th>Worker URL</th>
      <th>Sector</th>
      <th>Status</th>
      <th>Latency (ms)</th>
      <th>JSON Valid</th>
      <th>Reliability</th>
      <th>Error</th>
    </tr>
    ${data.workers
      .map((w) => {
        const cls =
          w.reliability >= 0.8
            ? "good"
            : w.reliability >= 0.5
            ? "ok"
            : "bad";

        return `
        <tr class="${cls}">
          <td>${w.url}</td>
          <td>${w.sector}</td>
          <td>${w.status}</td>
          <td>${w.latency_ms}</td>
          <td>${w.jsonValid}</td>
          <td>${w.reliability}</td>
          <td>${w.error || ""}</td>
        </tr>`;
      })
      .join("")}
  </table>

  <h2>Sector Reliability Trend (24h / 7d)</h2>
  <p>This page reads <code>reliability_history.json</code> for trend graphs. Add a client-side chart (e.g. lightweight canvas/SVG) to keep it fully static and serverless.</p>
</body>
</html>
`;

  fs.writeFileSync(path.join(outDir, "reliability.html"), html);
}

// Append to reliability_history.json for trend graphs
function writeReliabilityHistory(data) {
  const outDir = path.join(process.cwd(), "public");
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir);

  const historyPath = path.join(outDir, "reliability_history.json");
  let history = [];

  if (fs.existsSync(historyPath)) {
    try {
      history = JSON.parse(fs.readFileSync(historyPath, "utf8"));
    } catch {
      history = [];
    }
  }

  history.push({
    timestamp: data.timestamp,
    avgReliability: data.avgReliability,
    sectorReliability: data.sectorReliability
  });

  fs.writeFileSync(historyPath, JSON.stringify(history, null, 2));
}
