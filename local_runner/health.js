// health.js — VolatiAI Sector Health Checker

import fs from "fs";
import path from "path";

export async function runHealthCheck(sectorUrls = []) {
  const results = [];

  console.log("Running VolatiAI health check...");
  console.log("CWD:", process.cwd());

  for (const url of sectorUrls) {
    const start = performance.now();

    let status = "OK";
    let latency = 0;
    let jsonValid = true;
    let error = null;

    try {
      const controller = new AbortController();

      const timeout = setTimeout(() => {
        controller.abort();
      }, 8000);

      let res;

      try {
        res = await fetch(url, {
          signal: controller.signal
        });
      } finally {
        clearTimeout(timeout);
      }

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
          error = String(err);
        }
      }
    } catch (err) {
      status = "FETCH_ERROR";
      jsonValid = false;
      latency = performance.now() - start;
      error = String(err);
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

  console.log(
    `Health check complete. Generated reports for ${results.length} worker(s).`
  );

  return results;
}

function writeHealthFiles(results) {
  const outDir = path.join(process.cwd(), "public");

  fs.mkdirSync(outDir, {
    recursive: true
  });

  const jsonPath = path.join(outDir, "health.json");
  const htmlPath = path.join(outDir, "health.html");

  fs.writeFileSync(
    jsonPath,
    JSON.stringify(
      {
        timestamp: Date.now(),
        workers: results
      },
      null,
      2
    ),
    "utf8"
  );

  const html = `
<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <title>VolatiAI Health Dashboard</title>

  <style>
    body {
      font-family: Arial, sans-serif;
      padding: 20px;
    }

    table {
      border-collapse: collapse;
      width: 100%;
    }

    th, td {
      border: 1px solid #ccc;
      padding: 8px;
      text-align: left;
    }

    th {
      background: #eee;
    }

    .OK {
      background: #d4ffd4;
    }

    .FETCH_ERROR,
    .HTTP_ERROR,
    .INVALID_JSON {
      background: #ffd4d4;
    }
  </style>
</head>
<body>
  <h1>VolatiAI Health Dashboard</h1>

  <p>Updated: ${new Date().toISOString()}</p>

  <table>
    <tr>
      <th>Worker URL</th>
      <th>Status</th>
      <th>Latency (ms)</th>
      <th>JSON Valid</th>
      <th>Error</th>
    </tr>

    ${results.map(r => `
      <tr class="${r.status}">
        <td>${r.url}</td>
        <td>${r.status}</td>
        <td>${r.latency_ms}</td>
        <td>${r.jsonValid}</td>
        <td>${r.error ?? ""}</td>
      </tr>
    `).join("")}
  </table>
</body>
</html>
`;

  fs.writeFileSync(htmlPath, html, "utf8");

  console.log("Generated:", jsonPath);
  console.log("Generated:", htmlPath);
}

// Run directly from CLI
if (import.meta.url === `file://${process.argv[1]}`) {
  const sectorUrls = [
    process.env.SECTOR_URL_1,
    process.env.SECTOR_URL_2,
    process.env.SECTOR_URL_3,
    process.env.SECTOR_URL_4,
    process.env.SECTOR_URL_5
  ].filter(Boolean);

  try {
    await runHealthCheck(sectorUrls);

    console.log(
      `Health check completed successfully for ${sectorUrls.length} sector(s).`
    );
  } catch (err) {
    console.error("Health check failed:");
    console.error(err);
    process.exit(1);
  }
}
