// LOCAL RUNNER — VolatiAI
// Offline, serverless, anti‑compliance, stateless

import fs from "fs";
import path from "path";

// Import layers
import { fuseSignals } from "./fusion.js";
import { intelligenceModel } from "./intelligence.js";
import { writeHtml } from "./html.js";
import { runHealthCheck } from "./health.js";
import { runReliabilityAnalysis } from "./reliability.js";
import { runSectorReliability } from "./sector_reliability.js";

// Import alerts
import { sendAlerts, sendSectorAlerts } from "./alerts.js";

// Import bots
import { postToSlack } from "./bots/slack.js";
import { postToTelegram } from "./bots/telegram.js";
import { postToBluesky } from "./bots/bluesky.js";
import { postToMastodon } from "./bots/mastodon.js";
import { postToDiscord } from "./bots/discord.js";
import { postToNostr } from "./bots/nostr.js";

// 1. Add ALL your Cloudflare Workers here (FULL LIST PRESERVED)
const sectorUrls = [
  "https://sector-slow.fourieranalys.workers.dev",
  "https://sector-dense.fourieranalys.workers.dev",
  "https://sector-sparse.fourieranalys.workers.dev"
];
``

// 2. Fetch all sector Workers in parallel
async function fetchAllSectors() {
  const results = [];
  const BATCH = 20;

  // Step 1: enumerate sectors per worker via /_sectors
  const index = [];
  for (const base of sectorUrls) {
    try {
      const res = await fetch(`${base}/_sectors`);
      if (!res.ok) {
        console.error(`[warn] /_sectors ${base} → HTTP ${res.status}`);
        continue;
      }
      const map = await res.json();
      const sectorMap = map.sectors || map;  // {count,density,sectors} or raw map
      for (const sector of Object.keys(sectorMap)) index.push({ sector, base });
    } catch (e) {
      console.error(`[warn] /_sectors ${base} failed: ${e.message}`);
    }
  }
  console.log(`[info] enumerated ${index.length} sectors across ${sectorUrls.length} workers`);

  // Step 2: fetch signals in batches of 20
  for (let i = 0; i < index.length; i += BATCH) {
    const batch = index.slice(i, i + BATCH);
    const fetched = await Promise.all(batch.map(async ({ sector, base }) => {
      try {
        const r = await fetch(`${base}/${sector}/signal`);
        if (!r.ok) return { sector, base, success: false, error: `HTTP ${r.status}` };
        const data = await r.json();
        return { sector, base, success: true, data };
      } catch (e) {
        return { sector, base, success: false, error: String(e) };
      }
    }));
    results.push(...fetched);
    process.stdout.write(`[info] fetched ${results.length}/${index.length}\r`);
  }
  console.log();

  const ok = results.filter(r => r.success).length;
  console.log(`[info] fetched ${ok}/${results.length} sector signals successfully`);
  return results;
}

// 5. Write snapshots to /public (GitHub Pages / static dashboard)
function writeSnapshots(intel, sectorsRaw) {
  const outDir = path.join(process.cwd(), "public");

  // Ensure directory exists
  fs.mkdirSync(outDir, { recursive: true });

  const dashboardIntel = {
  ts: new Date().toISOString(),

  global: {
  direction: intel.direction ?? "neutral",
  chain_integrity: intel.chain_truth ?? 0,
  score: intel.sector_growth ?? 0
},

  dsi: Array.isArray(intel.dsi) ? intel.dsi : [],
rpc_truth: Array.isArray(intel.rpc_truth) ? intel.rpc_truth : [],
depth: Array.isArray(intel.depth) ? intel.depth : [],
devactivity: Array.isArray(intel.devactivity) ? intel.devactivity : [],
narratives: Array.isArray(intel.narratives) ? intel.narratives : []
};

fs.writeFileSync(
  path.join(outDir, "intel.json"),
  JSON.stringify(dashboardIntel, null, 2),
  "utf8"
);

  fs.writeFileSync(
    path.join(outDir, "latest.json"),
    JSON.stringify(intel, null, 2),
    "utf8"
  );

  console.log("Snapshots written successfully.");
}

// Format bot message
function formatMessage(intel) {
  return [
    `VolatiAI snapshot — ${new Date(
      intel.timestamp || Date.now()
    ).toISOString()}`,
    `• Trend acceleration: ${(intel.trend_acceleration ?? 0).toFixed(3)}`,
    `• Narrative velocity: ${(intel.narrative_velocity ?? 0).toFixed(3)}`,
    `• Whale pressure: ${(intel.whale_pressure ?? 0).toFixed(3)}`,
    `• Spoofing probability: ${(intel.spoofing_probability ?? 0).toFixed(3)}`,
    `• Chain truth: ${(intel.chain_truth ?? 0).toFixed(3)}`,
    `• Sector growth: ${(intel.sector_growth ?? 0).toFixed(3)}`
  ].join("\n");
}

// 6. Main runner
async function run() {
  console.log("Fetching sector Workers...");
  const sectorsRaw = await fetchAllSectors();

  console.log("Fusing signals...");
  const fused = fuseSignals(sectorsRaw);

  console.log("Running intelligence model...");
  const intel = intelligenceModel(fused);

  // Ensure timestamp exists
  intel.timestamp = intel.timestamp || Date.now();

  // Extract SAFE_* sectors from license map — signalSectors for bot attribution
  // (sectorsRaw has no per-sector names; worker URLs are worker-level, not sector-level)
  try {
    const licenseMap = JSON.parse(
      fs.readFileSync(path.join(process.cwd(), 'config/source_licenses.json'), 'utf8')
    );
    const SAFE_CATS = ['SAFE_PD_CC0', 'SAFE_CC_BY', 'SAFE_MIT', 'SAFE_OPEN'];
    intel.sectors = Object.entries(licenseMap)
      .filter(([_, info]) => SAFE_CATS.includes((info.category || '').toUpperCase()))
      .map(([sector]) => sector);
    console.log(`[info] signalSectors: ${intel.sectors.length} SAFE sectors from license map`);
  } catch (e) {
    console.error('[error] Could not load license map:', e.message);
    intel.sectors = [];
  }

  console.log("Writing snapshots...");
  writeSnapshots(intel, sectorsRaw);

  console.log(
    "Writing HTML (intel + health + reliability dashboards)..."
  );
  await writeHtml(intel, sectorsRaw);

  console.log("Running health checker...");
  await runHealthCheck(sectorUrls);

  console.log("Running reliability scoring...");
  await runReliabilityAnalysis();

  console.log("Running sector reliability breakdown...");
  await runSectorReliability();

  console.log("Sending alerts...");
  await sendAlerts();

  console.log("Sending sector alerts...");
  await sendSectorAlerts();

  const msg = formatMessage(intel);

  console.log("Broadcasting to bots...");

  // All bots now gated with checkAttribution. Sectors passed from intel.
  const signalSectors = intel?.sectors || [];
  await Promise.allSettled([
    postToSlack(msg, signalSectors),
    postToTelegram(msg, signalSectors),
    postToBluesky(msg, signalSectors),
    postToMastodon(msg, signalSectors),
    postToDiscord(msg, signalSectors),
    postToNostr(msg, signalSectors)
  ]);

  console.log("Local Runner complete.");
}

// Start runner
run().catch((err) => {
  console.error("Fatal runner error:", err);
  process.exit(1);
});
