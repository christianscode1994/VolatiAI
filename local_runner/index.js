// LOCAL RUNNER — VolatiAI
// Offline, serverless, anti‑compliance, stateless

import fs from "fs";
import path from "path";
import fetch from "node-fetch";

// Import layers
import { fuseSignals } from "./fusion.js";
import { intelligenceModel } from "./intelligence.js";
import { writeHtml } from "./html.js";
import { runHealthCheck } from "./health.js";
import { runReliabilityAnalysis } from "./reliability.js";
import { runSectorReliability } from "./sector_reliability.js";

// Import alerts
import { sendAlerts } from "./alerts.js";
import { sendSectorAlerts } from "./alerts.js";

// Import bots
import { postToSlack } from "./bots/slack.js";
import { postToTelegram } from "./bots/telegram.js";
import { postToBluesky } from "./bots/bluesky.js";
import { postToMastodon } from "./bots/mastodon.js";
import { postToDiscord } from "./bots/discord.js";
import { postToNostr } from "./bots/nostr.js";

// 1. Add ALL your Cloudflare Workers here (FULL LIST PRESERVED)
const sectorUrls = [
  "https://sector-books.fourieranalys.workers.dev",
  "https://sector-art-design.fourieranalys.workers.dev",
  "https://sector-anti-malware.fourieranalys.workers.dev",
  "https://sector-anime.fourieranalys.workers.dev",
  "https://sector-animals.fourieranalys.workers.dev",
  "https://sector-health.fourieranalys.workers.dev",
  "https://sector-government.fourieranalys.workers.dev",
  "https://sector-geocoding.fourieranalys.workers.dev",
  "https://sector-games-comics.fourieranalys.workers.dev",
  "https://sector-food-drink.fourieranalys.workers.dev",
  "https://sector-finance.fourieranalys.workers.dev",
  "https://sector-events.fourieranalys.workers.dev",
  "https://sector-environment.fourieranalys.workers.dev",
  "https://sector-education.fourieranalys.workers.dev",
  "https://sector-documents-productivty.fourieranalys.workers.dev",
  "https://sector-science-math.fourieranalys.workers.dev",
  "https://sector-photography.fourieranalys.workers.dev",
  "https://sector-personality.fourieranalys.workers.dev",
  "https://sector-patent.fourieranalys.workers.dev",
  "https://sector-open-source-projects.fourieranalys.workers.dev",
  "https://sector-open-data.fourieranalys.workers.dev",
  "https://sector-news.fourieranalys.workers.dev",
  "https://sector-music.fourieranalys.workers.dev",
  "https://sector-machine-learning.fourieranalys.workers.dev",
  "https://sector-jobs.fourieranalys.workers.dev",
  "https://sector-vehicles.fourieranalys.workers.dev",
  "https://sector-url-shorteners.fourieranalys.workers.dev",
  "https://sector-transport.fourieranalys.workers.dev",
  "https://sector-tracking.fourieranalys.workers.dev",
  "https://sector-text-analysis.fourieranalys.workers.dev",
  "https://sector-test-data.fourieranalys.workers.dev",
  "https://sector-sports-fitness.fourieranalys.workers.dev",
  "https://sector-social.fourieranalys.workers.dev",
  "https://sector-shopping.fourieranalys.workers.dev",
  "https://sector-security.fourieranalys.workers.dev",
  "https://sector-kalender.fourieranalys.workers.dev",
  "https://sector-bisnis.fourieranalys.workers.dev",
  "https://sector-bok.fourieranalys.workers.dev",
  "https://sector-animerad.fourieranalys.workers.dev",
  "https://sector-djur.fourieranalys.workers.dev",
  "https://sector-diction.fourieranalys.workers.dev",
  "https://sector-develop.fourieranalys.workers.dev",
  "https://sector-blockchain.fourieranalys.workers.dev",
  "https://sector-weather.fourieranalys.workers.dev",
  "https://sector-video.fourieranalys.workers.dev",
  "https://sector-mat-dryck.fourieranalys.workers.dev",
  "https://sector-rahoitus.fourieranalys.workers.dev",
  "https://sector-environments.fourieranalys.workers.dev",
  "https://sector-entertainment.fourieranalys.workers.dev",
  "https://sector-epost.fourieranalys.workers.dev",
  "https://sector-productivity.fourieranalys.workers.dev",
  "https://sector-data-valid.fourieranalys.workers.dev",
  "https://sector-currency-ex.fourieranalys.workers.dev",
  "https://sector-kryptovaluta.fourieranalys.workers.dev",
  "https://sector-moln.fourieranalys.workers.dev",

  // ⭐ NEW SECTORS YOU PROVIDED ⭐
  "https://sector-opensoruce.fourieranalys.workers.dev",
  "https://sector-opendata.fourieranalys.workers.dev",
  "https://sector-nyhet.fourieranalys.workers.dev",
  "https://sector-musik.fourieranalys.workers.dev",
  "https://sector-maskin.fourieranalys.workers.dev",
  "https://sector-jobb.fourieranalys.workers.dev",
  "https://sector-healthy.fourieranalys.workers.dev",
  "https://sector-govern.fourieranalys.workers.dev",
  "https://sector-geocode.fourieranalys.workers.dev",
  "https://sector-spel.fourieranalys.workers.dev"
];

// 2. Fetch all sector Workers in parallel
async function fetchAllSectors() {
  return Promise.all(
    sectorUrls.map(async (url) => {
      try {
        const res = await fetch(url);
        const json = await res.json();
        return { url, data: json };
      } catch (err) {
        return { url, error: err.toString() };
      }
    })
  );
}

// 5. Write snapshots to /public
function writeSnapshots(intel, sectorsRaw) {
  const outDir = path.join(process.cwd(), "public");
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir);

  fs.writeFileSync(
    path.join(outDir, "intel.json"),
    JSON.stringify({ timestamp: Date.now(), intelligence: intel, sectors: sectorsRaw }, null, 2)
  );

  fs.writeFileSync(
    path.join(outDir, "latest.json"),
    JSON.stringify(intel, null, 2)
  );
}

// Format bot message
function formatMessage(intel) {
  return [
    `VolatiAI snapshot — ${new Date(intel.timestamp).toISOString()}`,
    `• Trend acceleration: ${intel.trend_acceleration.toFixed(3)}`,
    `• Narrative velocity: ${intel.narrative_velocity.toFixed(3)}`,
    `• Whale pressure: ${intel.whale_pressure.toFixed(3)}`,
    `• Spoofing probability: ${intel.spoofing_probability.toFixed(3)}`,
    `• Chain truth: ${intel.chain_truth.toFixed(3)}`,
    `• Sector growth: ${intel.sector_growth.toFixed(3)}`
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

  console.log("Writing snapshots...");
  writeSnapshots(intel, sectorsRaw);

  console.log("Writing HTML...");
  writeHtml(intel, sectorsRaw);

  // ⭐ NEW: Health Checker
  console.log("Running health checker...");
  await runHealthCheck(sectorUrls);

  // ⭐ NEW: Reliability Scoring
  console.log("Running reliability scoring...");
  await runReliabilityAnalysis();

  // ⭐ NEW: Sector Reliability Breakdown
  console.log("Running sector reliability breakdown...");
  await runSectorReliability();

  // ⭐ NEW: Alerts
  console.log("Sending alerts...");
  await sendAlerts();

  console.log("Sending sector alerts...");
  await sendSectorAlerts();

  const msg = formatMessage(intel);

  console.log("Broadcasting to bots...");
  await postToSlack(msg);
  await postToTelegram(msg);
  await postToBluesky(msg);
  await postToMastodon(msg);
  await postToDiscord(msg);
  await postToNostr(msg);

  console.log("Local Runner complete.");
}

run();
