// -------------------------------------------------------------
// VolatiAI Sector Spotlight Engine (Full Production Version)
// -------------------------------------------------------------

// 1. ALL your Cloudflare Workers (full list)
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

  // ⭐ NEW SECTORS YOU ADDED ⭐
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

// -------------------------------------------------------------
// Worker Entrypoint
// -------------------------------------------------------------
export default {
  async scheduled(event, env, ctx) {
    await runSpotlight(env);
  },

  async fetch(request, env, ctx) {
    return new Response("VolatiAI Sector Spotlight Engine", { status: 200 });
  }
};

// -------------------------------------------------------------
// Spotlight Logic
// -------------------------------------------------------------
async function runSpotlight(env) {
  try {
    const sector = await pickSector(env);
    if (!sector) return;

    const msg = buildSpotlightMessage(sector);

    await Promise.all([
      safe(() => postTelegram(env, msg)),
      safe(() => postDiscord(env, msg)),
      safe(() => postSlack(env, msg)),
      safe(() => postMastodon(env, msg)),
      safe(() => postBluesky(env, msg)),
      safe(() => postNostr(env, msg))
    ]);
  } catch (err) {
    console.error("Spotlight error:", err);
  }
}

// -------------------------------------------------------------
// Reliability-weighted sector selection + rotation + weekly memory
// -------------------------------------------------------------
async function pickSector(env) {
  const weekKey = getWeekKey();
  const lastWeek = await env.SECTOR_WEEK.get(weekKey);

  // If we already picked a sector this week → reuse it
  if (lastWeek) {
    try {
      const res = await fetch(lastWeek);
      return await res.json();
    } catch (_) {}
  }

  // Fetch reliability v4
  const relUrl =
    "https://raw.githubusercontent.com/christianscode1994/VolatiAI/main/reliability/v4.json";
  const relRes = await fetch(relUrl);
  const reliability = relRes.ok ? await relRes.json() : null;

  // Weighted random selection
  const weights = sectorUrls.map(url => {
    const w = reliability?.global ?? 0.5;
    return Math.random() * w;
  });

  const idx = weights.indexOf(Math.max(...weights));
  const chosenUrl = sectorUrls[idx];

  // Save for the week
  await env.SECTOR_WEEK.put(weekKey, chosenUrl);

  // Fetch chosen sector
  const res = await fetch(chosenUrl);
  if (!res.ok) return null;

  return await res.json();
}

function getWeekKey() {
  const now = new Date();
  const year = now.getUTCFullYear();
  const week = Math.ceil(
    ((now - new Date(year, 0, 1)) / 86400000 + new Date(year, 0, 1).getUTCDay() + 1) /
      7
  );
  return `week-${year}-${week}`;
}

// -------------------------------------------------------------
// Spotlight Message Builder
// -------------------------------------------------------------
function buildSpotlightMessage(sector) {
  const items = sector.items?.slice(0, 5) ?? [];

  return [
    "🔦 VolatiAI Sector Spotlight",
    `Sector: ${sector.name}`,
    `Score: ${sector.score?.toFixed(2) ?? "n/a"}`,
    "",
    "Top Items:",
    ...items.map(i => `• ${i.name}`)
  ].join("\n");
}

// -------------------------------------------------------------
// Safe wrapper for error handling
// -------------------------------------------------------------
async function safe(fn) {
  try {
    await fn();
  } catch (err) {
    console.error("Broadcast error:", err);
  }
}

// -------------------------------------------------------------
// Platform Posting Functions
// -------------------------------------------------------------
async function postTelegram(env, text) {
  if (!env.TELEGRAM_TOKEN || !env.TELEGRAM_CHAT_ID) return;
  await fetch(`https://api.telegram.org/bot${env.TELEGRAM_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: env.TELEGRAM_CHAT_ID, text })
  });
}

async function postDiscord(env, text) {
  if (!env.DISCORD_WEBHOOK_URL) return;
  await fetch(env.DISCORD_WEBHOOK_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content: text })
  });
}

async function postSlack(env, text) {
  if (!env.SLACK_WEBHOOK_URL) return;
  await fetch(env.SLACK_WEBHOOK_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text })
  });
}

async function postMastodon(env, text) {
  if (!env.MASTODON_BASE || !env.MASTODON_TOKEN) return;
  await fetch(`${env.MASTODON_BASE}/api/v1/statuses`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.MASTODON_TOKEN}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ status: text })
  });
}

async function postBluesky(env, text) {
  if (!env.BLUESKY_HANDLE || !env.BLUESKY_APP_PASSWORD) return;
  // Your Bluesky client goes here
}

async function postNostr(env, text) {
  if (!env.NOSTR_PRIVKEY) return;
  // Your Nostr signer goes here
}
