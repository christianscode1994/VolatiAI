import fs from "fs";

function safeRead(path) {
  try {
    return JSON.parse(fs.readFileSync(path, "utf8"));
  } catch {
    return null;
  }
}

function buildAlerts() {
  const latest = safeRead("public/latest.json");
  const history = safeRead("public/reliability_history.json");
  const uptime = safeRead("public/uptime_history.json");

  const alerts = [];
  const now = Math.floor(Date.now() / 1000);

  // 1. Global reliability anomaly
  if (Array.isArray(history) && history.length > 10) {
    const values = history.map(h => h.avgReliability);
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const variance = values.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / values.length;
    const std = Math.sqrt(variance);
    const last = values[values.length - 1];

    if (Math.abs(last - mean) > 2 * std) {
      alerts.push({
        id: "global-reliability-spike",
        severity: Math.abs(last - mean) > 3 * std ? "critical" : "high",
        source: "reliability_history.json",
        signal: "global_reliability",
        createdAt: now,
        message: `Global reliability at ${last.toFixed(2)} (mean ${mean.toFixed(2)}, std ${std.toFixed(2)}).`,
        details: { latest: last, mean, std }
      });
    }
  }

  // 2. Spoofing probability
  if (latest && typeof latest.spoofing_probability === "number") {
    if (latest.spoofing_probability > 0.7) {
      alerts.push({
        id: "spoofing-probability-high",
        severity: latest.spoofing_probability > 0.85 ? "high" : "medium",
        source: "latest.json",
        signal: "spoofing_probability",
        createdAt: now,
        message: `Spoofing probability elevated at ${latest.spoofing_probability.toFixed(3)}.`,
        details: { spoofing_probability: latest.spoofing_probability }
      });
    }
  }

  // 3. Whale pressure
  if (latest && typeof latest.whale_pressure === "number") {
    if (latest.whale_pressure > 0.7) {
      alerts.push({
        id: "whale-pressure-high",
        severity: latest.whale_pressure > 0.85 ? "high" : "medium",
        source: "latest.json",
        signal: "whale_pressure",
        createdAt: now,
        message: `Whale pressure elevated at ${latest.whale_pressure.toFixed(3)}.`,
        details: { whale_pressure: latest.whale_pressure }
      });
    }
  }

  // 4. Uptime degradation
  if (Array.isArray(uptime)) {
    const map = {};
    uptime.forEach(entry => {
      (entry.workers || []).forEach(w => {
        if (!map[w.url]) {
          map[w.url] = { url: w.url, sector: w.sector, upSamples: 0, totalSamples: 0 };
        }
        map[w.url].totalSamples += 1;
        if (w.up) map[w.url].upSamples += 1;
      });
    });

    Object.values(map).forEach(w => {
      const uptimePct = w.totalSamples ? (w.upSamples / w.totalSamples) * 100 : 0;
      if (uptimePct < 95) {
        alerts.push({
          id: `uptime-degradation-${w.url}`,
          severity: uptimePct < 90 ? "high" : "medium",
          source: "uptime_history.json",
          signal: "worker_uptime",
          createdAt: now,
          message: `Uptime degradation for ${w.url}: ${uptimePct.toFixed(1)}%.`,
          details: { url: w.url, sector: w.sector, uptimePct }
        });
      }
    });
  }

  fs.writeFileSync("public/alerts.json", JSON.stringify(alerts, null, 2));
}

buildAlerts();
