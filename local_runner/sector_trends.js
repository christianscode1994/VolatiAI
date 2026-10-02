// sector_trends.js — VolatiAI Sector Reliability Trend Engine

import fs from "fs";
import path from "path";

const TREND_FILE = path.join(process.cwd(), "public", "sector_trends.json");

// Append new trend entry
export function updateSectorTrends(sectorData) {
  let history = [];

  if (fs.existsSync(TREND_FILE)) {
    history = JSON.parse(fs.readFileSync(TREND_FILE, "utf8"));
  }

  history.push({
    timestamp: Date.now(),
    sectors: sectorData.sectors
  });

  // Keep only last 7 days
  const sevenDays = 7 * 24 * 60 * 60 * 1000;
  history = history.filter(
    (entry) => Date.now() - entry.timestamp <= sevenDays
  );

  fs.writeFileSync(TREND_FILE, JSON.stringify(history, null, 2));
  writeTrendDashboard(history);
}

// HTML dashboard
function writeTrendDashboard(history) {
  const outDir = path.join(process.cwd(), "public");

  const html = `
<!doctype html>
<html>
<head>
  <title>VolatiAI Sector Reliability Trends</title>
  <style>
    body { font-family: Arial; padding: 20px; }
    table { border-collapse: collapse; width: 100%; }
    th, td { border: 1px solid #ccc; padding: 8px; }
    th { background: #eee; }
  </style>
</head>
<body>
  <h1>Sector Reliability Trends (Last 7 Days)</h1>
  <p>Updated: ${new Date().toISOString()}</p>

  ${history
    .map((entry) => {
      return `
      <h2>${new Date(entry.timestamp).toISOString()}</h2>
      <table>
        <tr>
          <th>Sector</th>
          <th>Score</th>
        </tr>
        ${entry.sectors
          .map(
            (s) => `
          <tr>
            <td>${s.sector}</td>
            <td>${s.score}</td>
          </tr>
        `
          )
          .join("")}
      </table>
    `;
    })
    .join("")}
</body>
</html>
`;

  fs.writeFileSync(path.join(outDir, "sector_trends.html"), html);
}
