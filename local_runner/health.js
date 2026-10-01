// health.js — VolatiAI Sector Health Checker

import fs from "fs";
import path from "path";
import fetch from "node-fetch";

export async function runHealthCheck(sectorUrls) {
  const results = [];

  for (const url of sectorUrls) {
    const start = performance.now();
    let status = "OK";
    let latency = 0;
    let jsonValid = true;
    let error = null;

    try {
      const res = await fetch(url, { timeout: 8000 });
      latency = performance.now() - start;

      if (!res.ok) {
        status = "HTTP_ERROR";
        jsonValid = false;
        error = `HTTP ${res.status}`;
      } else {
        try {
          await res.json();
        } catch (err) {
          status = "INVALID_JSON";
          jsonValid = false;
          error = err.toString();
        }
      }
    } catch (err) {
      status = "FETCH_ERROR";
      jsonValid = false;
      latency = performance.now() - start;
      error = err.toString();
    }

    results.push({
      url,
      status,
      latency_ms: Math.round(latency),
      jsonValid,
      error
    });
  }

  writeHealthFiles(results);
  return results;
}

function writeHealthFiles(results) {
  const outDir = path.join(process.cwd(), "public");

  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir);
  }

  // JSON output
  fs.writeFileSync(
    path.join(outDir, "health.json"),
    JSON.stringify(
      {
        timestamp: Date.now(),
        workers: results
      },
      null,
      2
    )
  );

  // HTML dashboard
  const html = `
<!doctype html>
<html>
<head>
  <title>VolatiAI Health Dashboard</title>
  <style>
    body { font-family: Arial; padding: 20px; }
    table { border-collapse: collapse; width: 100%; }
    th, td { border: 1px solid #ccc; padding: 8px; }
    th { background: #eee; }
    .OK { background: #d4ffd4; }
    .FETCH_ERROR, .HTTP_ERROR, .INVALID_JSON { background: #ffd4d4; }
  </style>
</head>
<body>
  <h1>VolatiAI Sector Health Dashboard</h1>
  <p>Updated: ${new Date().toISOString()}</p>
  <table>
    <tr>
      <th>Worker URL</th>
      <th>Status</th>
      <th>Latency (ms)</th>
      <th>JSON Valid</th>
      <th>Error</th>
    </tr>
    ${results
      .map(
        (r) => `
      <tr class="${r.status}">
        <td>${r.url}</td>
        <td>${r.status}</td>
        <td>${r.latency_ms}</td>
        <td>${r.jsonValid}</td>
        <td>${r.error || ""}</td>
      </tr>
    `
      )
      .join("")}
  </table>
</body>
</html>
`;

  fs.writeFileSync(path.join(outDir, "health.html"), html);
}
