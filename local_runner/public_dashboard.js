// public_dashboard.js — Unified VolatiAI Dashboard

import fs from "fs";
import path from "path";

export function generatePublicDashboard() {
  const intel = JSON.parse(fs.readFileSync("public/intel.json", "utf8"));
  const health = JSON.parse(fs.readFileSync("public/health.json", "utf8"));
  const reliability = JSON.parse(fs.readFileSync("public/reliability.json", "utf8"));
  const sectorReliability = JSON.parse(fs.readFileSync("public/sector_reliability.json", "utf8"));

  const outDir = path.join(process.cwd(), "public");

  const html = `
<!doctype html>
<html>
<head>
  <title>VolatiAI Public Dashboard</title>
  <style>
    body { font-family: Arial; padding: 20px; }
    h2 { margin-top: 40px; }
    pre { background: #f4f4f4; padding: 10px; }
  </style>
</head>
<body>
  <h1>VolatiAI Public Dashboard</h1>
  <p>Updated: ${new Date().toISOString()}</p>

  <h2>Intelligence Snapshot</h2>
  <pre>${JSON.stringify(intel.intelligence, null, 2)}</pre>

  <h2>Global Reliability</h2>
  <pre>${JSON.stringify(reliability.globalReliability, null, 2)}</pre>

  <h2>Sector Reliability</h2>
  <pre>${JSON.stringify(sectorReliability.sectors, null, 2)}</pre>

  <h2>Worker Health</h2>
  <pre>${JSON.stringify(health.workers, null, 2)}</pre>

  <h2>Links</h2>
  <ul>
    <li><a href="health.html">Health Dashboard</a></li>
    <li><a href="reliability.html">Reliability Dashboard</a></li>
    <li><a href="sector_reliability.html">Sector Reliability</a></li>
    <li><a href="sector_trends.html">Sector Trends</a></li>
    <li><a href="latency_heatmap.html">Latency Heatmap</a></li>
  </ul>
</body>
</html>
`;

  fs.writeFileSync(path.join(outDir, "dashboard.html"), html);
}
