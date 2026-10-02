// reliability.js — VolatiAI Reliability Scoring Engine

import fs from "fs";
import path from "path";

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
    const reliability =
      (w.status === "OK" ? 0.7 : 0) +
      (w.jsonValid ? 0.2 : 0) +
      (w.latency_ms < 500 ? 0.1 : 0);

    return {
      url: w.url,
      status: w.status,
      latency_ms: w.latency_ms,
      jsonValid: w.jsonValid,
      reliability: Number(reliability.toFixed(2)),
      error: w.error || null
    };
  });

  const avgReliability =
    workers.reduce((a, b) => a + b.reliability, 0) / workers.length;

  const output = {
    timestamp: Date.now(),
    avgReliability: Number(avgReliability.toFixed(2)),
    workers,
    intelligence: intel.intelligence
  };

  writeReliabilityFiles(output);
  return output;
}

function writeReliabilityFiles(data) {
  const outDir = path.join(process.cwd(), "public");

  // JSON output
  fs.writeFileSync(
    path.join(outDir, "reliability.json"),
    JSON.stringify(data, null, 2)
  );

  // HTML dashboard
  const html = `
<!doctype html>
<html>
<head>
  <title>VolatiAI Reliability Dashboard</title>
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
  <h1>VolatiAI Reliability Dashboard</h1>
  <p>Updated: ${new Date(data.timestamp).toISOString()}</p>

  <h2>Global Reliability Score: ${data.avgReliability}</h2>

  <h2>Intelligence Snapshot</h2>
  <pre>${JSON.stringify(data.intelligence, null, 2)}</pre>

  <h2>Worker Reliability Table</h2>
  <table>
    <tr>
      <th>Worker URL</th>
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
          <td>${w.status}</td>
          <td>${w.latency_ms}</td>
          <td>${w.jsonValid}</td>
          <td>${w.reliability}</td>
          <td>${w.error || ""}</td>
        </tr>`;
      })
      .join("")}
  </table>
</body>
</html>
`;

  fs.writeFileSync(path.join(outDir, "reliability.html"), html);
}
