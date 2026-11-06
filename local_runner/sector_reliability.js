// sector_reliability.js — VolatiAI Sector-Level Reliability Engine

import fs from "fs";
import path from "path";

// Extract sector name from URL
function extractSector(url) {
  const match = url.match(/sector-([a-zA-Z0-9\-]+)/);
  return match ? match[1] : "unknown";
}

// Compute reliability for a single sector
function computeSectorScore(workers) {
  const total = workers.length;

  const okCount = workers.filter(w => w.status === "OK").length;
  const jsonCount = workers.filter(w => w.jsonValid).length;

  const avgLatency =
    workers.reduce((a, b) => a + b.latency_ms, 0) / total;

  const latencyThreshold = 2000;
  const latencyScore = Math.max(0, 1 - avgLatency / latencyThreshold);

  const R1 = okCount / total;
  const R2 = jsonCount / total;
  const R3 = latencyScore;

  const score = 0.6 * R1 + 0.25 * R2 + 0.15 * R3;

  return Number(score.toFixed(3));
}

export function runSectorReliability() {
  const healthPath = path.join(process.cwd(), "public", "health.json");

  if (!fs.existsSync(healthPath)) {
    console.log("Sector Reliability: Missing health.json");
    return;
  }

  const health = JSON.parse(fs.readFileSync(healthPath, "utf8"));

  // Group workers by sector
  const sectors = {};

  for (const w of health.workers) {
    const sector = extractSector(w.url);

    if (!sectors[sector]) sectors[sector] = [];
    sectors[sector].push(w);
  }

  // Compute reliability per sector
  const sectorScores = Object.entries(sectors).map(([sector, workers]) => {
    return {
      sector,
      score: computeSectorScore(workers),
      workers
    };
  });

  const output = {
    timestamp: Date.now(),
    sectors: sectorScores
  };

  writeSectorReliabilityFiles(output);
  return output;
}

function writeSectorReliabilityFiles(data) {
  const outDir = path.join(process.cwd(), "public");

  // JSON output
  fs.writeFileSync(
    path.join(outDir, "sector_reliability.json"),
    JSON.stringify(data, null, 2)
  );

  // HTML dashboard
  const html = `
<!doctype html>
<html>
<head>
  <title>VolatiAI Sector Reliability Dashboard</title>
  <style>
    body { font-family: Arial; padding: 20px; }
    table { border-collapse: collapse; width: 100%; }
    th, td { border: 1px solid #ccc; padding: 8px; }
    th { background: #eee; }
    .bad { background: #ffd4d4; }
    .ok { background: #fffbd4; }
    .good { background: #d4ffd4; }
  </style>
</head>
<body>
  <h1>VolatiAI Sector Reliability Breakdown</h1>
  <p>Updated: ${new Date(data.timestamp).toISOString()}</p>

  <table>
    <tr>
      <th>Sector</th>
      <th>Reliability Score</th>
      <th>Workers</th>
    </tr>
    ${data.sectors
      .map((s) => {
        const cls =
          s.score >= 0.8 ? "good" :
          s.score >= 0.5 ? "ok" : "bad";

        return `
        <tr class="${cls}">
          <td>${s.sector}</td>
          <td>${s.score}</td>
          <td>${s.workers.length}</td>
        </tr>`;
      })
      .join("")}
  </table>
</body>
</html>
`;

  fs.writeFileSync(path.join(outDir, "sector_reliability.html"), html);
}
