// Stateless narrative + sentiment fetcher. No KV, no secrets.
// Sources verified working 2026-10-18.

export async function fetchNarrativeLayer() {
  const get = (url) =>
    fetch(url, { headers: { accept: "application/json" } })
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null);

  const [fg, defi, nft] = await Promise.all([
    get("https://cryptocurrency.cv/api/fear-greed"),
    get("https://api.llama.fi/protocols"),
    get("https://api.coingecko.com/api/v3/search/trending"),
  ]);

  return {
    fearGreed: fg ?? null,
    defiProtocols: Array.isArray(defi)
      ? [...defi].sort((a, b) => (b.tvl ?? 0) - (a.tvl ?? 0)).slice(0, 10)
      : [],
    nftTrending: nft?.nfts ?? [],
  };
}

// Fallback news sentiment — keyless RSS, lexicon scoring, no state.
export async function fetchRssSentiment() {
  const feeds = [
    "https://cointelegraph.com/rss",
    "https://www.coindesk.com/arc/outboundfeeds/rss/",
    "https://decrypt.co/feed",
  ];
  const pos = /(surge|rally|record|gain|bull|approve|launch|partner|adopt)/i;
  const neg = /(crash|hack|exploit|drop|bear|ban|sue|lawsuit|delay)/i;
  const titles = [];
  for (const url of feeds) {
    try {
      const txt = await (await fetch(url)).text();
      for (const m of txt.matchAll(/<title>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?<\/title>/gs)) {
        const t = m[1].trim();
        if (t && !/^<?xml|rss|cointelegraph|coindesk|decrypt/i.test(t)) titles.push(t);
      }
    } catch {}
  }
  let score = 0;
  for (const t of titles) score += pos.test(t) ? 1 : neg.test(t) ? -1 : 0;
  return {
    titles: titles.slice(0, 40),
    score: titles.length ? score / titles.length : 0,
    count: titles.length,
  };
}
