// html.js — VolatiAI HTML Snapshot Generator

import fs from "fs";
import path from "path";

export function writeHtml(intel, sectorsRaw) {
  const outDir = path.join(process.cwd(), "public");

  const summaryHtml = `
<!doctype html>
<html>
<head><title>VolatiAI Summary</title></head>
<body>
  <h1>VolatiAI Summary</h1>
  <p>Timestamp: ${new Date(intel.timestamp).toISOString()}</p>
  <ul>
    <li>Trend acceleration: ${intel.trend_acceleration.toFixed(3)}</li>
    <li>Narrative velocity: ${intel.narrative_velocity.toFixed(3)}</li>
    <li>Whale pressure: ${intel.whale_pressure.toFixed(3)}</li>
    <li>Spoofing probability: ${intel.spoofing_probability.toFixed(3)}</li>
    <li>Chain truth: ${intel.chain_truth.toFixed(3)}</li>
    <li>Sector growth: ${intel.sector_growth.toFixed(3)}</li>
  </ul>
</body>
</html>
`;

  const intelHtml = `
<!doctype html>
<html>
<head><title>VolatiAI Intel</title></head>
<body>
  <h1>Raw Sector Data</h1>
  <pre>${JSON.stringify(sectorsRaw, null, 2)}</pre>
</body>
</html>
`;

  fs.writeFileSync(path.join(outDir, "summary.html"), summaryHtml);
  fs.writeFileSync(path.join(outDir, "intel.html"), intelHtml);
}
