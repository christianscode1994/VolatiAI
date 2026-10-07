const sectorUrls = [
  // ⭐ Previously added sectors (examples)
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
  "https://sector-spel.fourieranalys.workers.dev"
];

export default {
  async scheduled(event, env, ctx) {
    const url = sectorUrls[Math.floor(Math.random() * sectorUrls.length)];
    const res = await fetch(url);
    const sector = await res.json();

    const msg = [
      "🔦 VolatiAI Sector Spotlight",
      `Sector: ${sector.name}`,
      `Score: ${sector.score.toFixed(2)}`,
      "",
      "Top items:",
      ...sector.items.slice(0, 5).map(i => `• ${i.name}`)
    ].join("\n");

    await Promise.all([
      postTelegram(env, msg),
      postDiscord(env, msg),
      postSlack(env, msg),
      postMastodon(env, msg),
      postBluesky(env, msg),
      postNostr(env, msg)
    ]);
  }
};
