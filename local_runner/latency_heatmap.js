// latency_heatmap.js — VolatiAI Latency Heatmap Generator

import fs from "fs";
import path from "path";

export function generateLatencyHeatmap() {
  const healthPath = path.join(process.cwd(), "public", "health.json");

  if (!fs.existsSync(healthPath)) {
    console.log("Latency Heatmap: Missing health.json");
    return;
  }

  const health = JSON.parse(fs.readFileSync(healthPath, "utf8"));

  const outDir = path.join(process.cwd(), "public");

  const html = `
<!doctype html>
<html>
<head>
  <title>VolatiAI Latency Heatmap</title>
  <style>
    body { font-family: Arial; padding: 20px; }
    .heatmap { display: grid; grid-template-columns: repeat(10, 1fr); gap: 4px; }
    .cell {
      padding: 10px;
      text-align: center;
      font-size: 12px;
      border-radius: 4px;
      color: #000;
    }
  </style>
</head>
<body>
  <h1>Latency Heatmap</h1>
  <p>Updated: ${new Date().toISOString()}</p>

  <div class="heatmap">
    ${health.workers
      .map((w) => {
        const color =
          w.latency_ms < 300
            ? "#b2ffb2"
            : w.latency_ms < 800
            ? "#fff7b2"
            : "#ffb2b2";

        return `
        <div class="cell" style="background:${color}">
          ${w.latency_ms}ms<br>
          <small>${w.url.replace("https://", "").split(".")[0]}</small>
        </div>
      `;
      })
      .join("")}
  </div>
</body>
</html>
`;

  fs.writeFileSync(path.join(outDir, "latency_heatmap.html"), html);
}
