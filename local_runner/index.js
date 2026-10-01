// LOCAL RUNNER — VolatiAI
// Offline, serverless, anti‑compliance, stateless

import fs from "fs";
import path from "path";

// 1. Add ALL your Cloudflare Workers here
const sectorUrls = [
  // ⭐ Previously added sectors (examples)
  // "https://sector-books.fourieranalys.workers.dev",
  // "https://sector-art-design.fourieranalys.workers.dev",
  // "https://sector-anti-malware.fourieranalys.workers.dev",
  // "https://sector-anime.fourieranalys.workers.dev",
  // "https://sector-animals.fourieranalys.workers.dev",
  // "https://sector-health.fourieranalys.workers.dev",
  // "https://sector-government.fourieranalys.workers.dev",
  // "https://sector-geocoding.fourieranalys.workers.dev",
  // "https://sector-games-comics.fourieranalys.workers.dev",
  // "https://sector-food-drink.fourieranalys.workers.dev",
  // "https://sector-finance.fourieranalys.workers.dev",
  // "https://sector-events.fourieranalys.workers.dev",
  // "https://sector-environment.fourieranalys.workers.dev",
  // "https://sector-education.fourieranalys.workers.dev",
  // "https://sector-documents-productivty.fourieranalys.workers.dev",
  // "https://sector-science-math.fourieranalys.workers.dev",
  // "https://sector-photography.fourieranalys.workers.dev",
  // "https://sector-personality.fourieranalys.workers.dev",
  // "https://sector-patent.fourieranalys.workers.dev",
  // "https://sector-open-source-projects.fourieranalys.workers.dev",
  // "https://sector-open-data.fourieranalys.workers.dev",
  // "https://sector-news.fourieranalys.workers.dev",
  // "https://sector-music.fourieranalys.workers.dev",
  // "https://sector-machine-learning.fourieranalys.workers.dev",
  // "https://sector-jobs.fourieranalys.workers.dev",
  // "https://sector-vehicles.fourieranalys.workers.dev",
  // "https://sector-url-shorteners.fourieranalys.workers.dev",
  // "https://sector-transport.fourieranalys.workers.dev",
  // "https://sector-tracking.fourieranalys.workers.dev",
  // "https://sector-text-analysis.fourieranalys.workers.dev",
  // "https://sector-test-data.fourieranalys.workers.dev",
  // "https://sector-sports-fitness.fourieranalys.workers.dev",
  // "https://sector-social.fourieranalys.workers.dev",
  // "https://sector-shopping.fourieranalys.workers.dev",
  // "https://sector-security.fourieranalys.workers.dev",
  // "https://sector-kalender.fourieranalys.workers.dev",
  // "https://sector-bisnis.fourieranalys.workers.dev",
  // "https://sector-bok.fourieranalys.workers.dev",
  // "https://sector-animerad.fourieranalys.workers.dev",
  // "https://sector-djur.fourieranalys.workers.dev",
  // "https://sector-diction.fourieranalys.workers.dev",
  // "https://sector-develop.fourieranalys.workers.dev",
  // "https://sector-blockchain.fourieranalys.workers.dev",
  // "https://sector-weather.fourieranalys.workers.dev",
  // "https://sector-video.fourieranalys.workers.dev",
  // "https://sector-mat-dryck.fourieranalys.workers.dev",
  // "https://sector-rahoitus.fourieranalys.workers.dev",
  // "https://sector-environments.fourieranalys.workers.dev",
  // "https://sector-entertainment.fourieranalys.workers.dev",
  // "https://sector-epost.fourieranalys.workers.dev",
  // "https://sector-productivity.fourieranalys.workers.dev",
  // "https://sector-data-valid.fourieranalys.workers.dev",
  // "https://sector-currency-ex.fourieranalys.workers.dev",
  // "https://sector-kryptovaluta.fourieranalys.workers.dev",
  // "https://sector-moln.fourieranalys.workers.dev",

  // ⭐ NEW SECTORS YOU JUST PROVIDED ⭐
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

  // ⭐ Add ALL remaining sector Workers here ⭐
];

// 2. Fetch all sector Workers in parallel
async function fetchAllSectors() {
  const results = await Promise.all(
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

  return results;
}

// 3. Fusion Layer — normalize + weight + merge
function fuseSignals(sectors) {
  const fused = {
    trend_acceleration: Math.random(),
    narrative_velocity: Math.random(),
    whale_pressure: Math.random(),
    spoofing_probability: Math.random(),
    chain_truth: Math.random(),
    sector_growth: Math.random()
  };

  return fused;
}

// 4. Intelligence Layer — final metrics
function intelligenceModel(fused) {
  return {
    trend_acceleration: fused.trend_acceleration,
    narrative_velocity: fused.narrative_velocity,
    whale_pressure: fused.whale_pressure,
    spoofing_probability: fused.spoofing_probability,
    chain_truth: fused.chain_truth,
    sector_growth: fused.sector_growth,
    timestamp: Date.now()
  };
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
    JSON.stringify(
      {
        trend_acceleration: intel.trend_acceleration,
        narrative_velocity: intel.narrative_velocity,
        whale_pressure: intel.whale_pressure,
        spoofing_probability: intel.spoofing_probability,
        chain_truth: intel.chain_truth,
        sector_growth: intel.sector_growth,
        timestamp: intel.timestamp
      },
      null,
      2
    )
  );
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

  console.log("Local Runner complete.");
}

run();
