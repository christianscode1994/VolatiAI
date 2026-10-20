const UA = { "user-agent": "VolatiAI/1.0", "accept": "application/json" };

const COLLECTIONS = [
  { id: "bored-ape-yacht-club", name: "BAYC" },
  { id: "cryptopunks",          name: "CryptoPunks" },
  { id: "pudgy-penguins",       name: "Pudgy Penguins" },
  { id: "azuki",                name: "Azuki" },
  { id: "doodles",              name: "Doodles" },
];

async function fetchSafe(name, fn) {
  try {
    const data = await fn();
    return { name, ok: true, data, error: null };
  } catch (e) {
    return { name, ok: false, data: null, error: e.message || "unknown" };
  }
}

async function fetchCollection(id) {
  const r = await fetch(
    `https://api.coingecko.com/api/v3/nfts/${encodeURIComponent(id)}`,
    { headers: UA, signal: AbortSignal.timeout(10000) }
  );
  if (!r.ok) throw new Error(`http_${r.status}`);
  const j = await r.json();
  const floor = j.floor_price ?? {};
  return {
    id:        j.id ?? id,
    name:      j.name ?? id,
    symbol:    j.symbol ?? null,
    floor_native: floor.native_currency ?? null,
    floor_usd:    floor.usd ?? null,
    volume_24h_usd: j.volume_24h?.usd ?? null,
    market_cap_usd: j.market_cap?.usd ?? null,
    floor_24h_change_pct: floor["24h_change"] ?? null,
  };
}

export default {
  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname !== "/nft/raw") {
      return new Response("Not found", { status: 404 });
    }

    // Sequential to respect CoinGecko's ~10-30/min rate limit on free tier
    const sources = {};
    for (const col of COLLECTIONS) {
      sources[col.name] = await fetchSafe(col.id, () => fetchCollection(col.id));
    }

    return Response.json({
      sector: "nft-floors",
      ts: new Date().toISOString(),
      sources,
    });
  },
};
