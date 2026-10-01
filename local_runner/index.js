// LOCAL RUNNER — VolatiAI
// Offline, serverless, anti‑compliance, stateless

import fs from "fs";
import path from "path";
import fetch from "node-fetch";

// Import layers
import { fuseSignals } from "./fusion.js";
import { intelligenceModel } from "./intelligence.js";
import { writeHtml } from "./html.js";

// Import bots
import { postToSlack } from "./bots/slack.js";
import { postToTelegram } from "./bots/telegram.js";
import { postToBluesky } from "./bots/bluesky.js";
import { postToMastodon } from "./bots/mastodon.js";
import { postToDiscord } from "./bots/discord.js";
import { postToNostr } from "./bots/nostr.js";

// 1. Add ALL your Cloudflare Workers here
const sectorUrls = [
  "https://sector-opensoruce.fourieranalys.workers.dev",
  "https://sector-opendata.fourieranalys.workers.dev",
  "https://sector-nyhet.fourieranalys.workers.dev",
  "https://sector-musik.fourieranalys.workers.dev",
  "https://sector-maskin.fourieranalys.workers.dev",
  "https://sector-jobb.fourieranalys.workers.dev",
  "https://sector-healthy.fourieranalys.workers.dev",
  "https://sector-govern.fourieranalys.workers.dev",
  "https://sector-geocode.fourieranalys.workers.dev",
  "https://sector-spel.fourieranalys.workers.dev",

  // Add any remaining Workers here
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

  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir);
  }

  fs.writeFileSync(
    path.join(outDir, "intel.json"),
    JSON.stringify(
      {
        timestamp: Date.now(),
        intelligence: intel,
        sectors: sectorsRaw
      },
      null,
      2
    )
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
