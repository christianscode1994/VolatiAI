const UA = { "user-agent": "VolatiAI/1.0", "accept": "application/json" };

const TARGETS = [
  { id: "bored-ape-yacht-club", name: "BAYC" },
  { id: "cryptopunks",          name: "CryptoPunks" },
  { id: "pudgy-penguins",       name: "Pudgy Penguins" },
  { id: "azuki",                name: "Azuki" },
  { id: "doodles",              name: "Doodles" },
];

const CACHE_TTL = 300;
const CACHE_KEY_URL = "https://cache.internal/coingecko-nft-markets/v1";
const MARKETS_URL =
  "https://api.coingecko.com/api/v3/nfts/markets?per_page=250&order=market_cap_usd_desc";

async function getMarkets() {
  const cache = caches.default;
  const cacheKey = new Request(CACHE_KEY_URL, { method: "GET" });

  const cached = await cache.match(cacheKey);
  if (cached) {
    const at = Number(cached.headers.get("x-cached-at") || 0);
    if (Date.now() - at < CACHE_TTL * 1000) {
      return { rows: await cached.json(), cached: true, stale: false, rate_limited: false };
    }
  }

  const r = await fetch(MARKETS_URL, { headers: UA, signal: AbortSignal.timeout(12000) });

  if (r.status === 429) {
    if (cached) {
      return { rows: await cached.json(), cached: true, stale: true, rate_limited: true };
    }
    const retry = r.headers.get("retry-after") || "60";
    throw new Error(`http_429 retry_after_${retry}s`);
  }
  if (!r.ok) throw new Error(`http_${r.status}`);

  const rows = await r.json();
  if (!Array.isArray(rows)) throw new Error("not_array");

  const toCache = new Response(JSON.stringify(rows), {
    headers: {
      "content-type": "application/json",
      "cache-control": `public, max-age=${CACHE_TTL}`,
      "x-cached-at": String(Date.now()),
    },
  });
  try { await cache.put(cacheKey, toCache); } catch {}

  return { rows, cached: false, stale: false, rate_limited: false };
}

function pick(row) {
  const floor = row.floor_price ?? {};
  return {
    id: row.id,
    name: row.name,
    symbol: row.symbol ?? null,
    platform: row.asset_platform_id ?? null,
    floor_native: floor.native_currency ?? null,
    floor_usd: floor.usd ?? null,
    market_cap_usd: row.market_cap?.usd ?? null,
    volume_24h_usd: row.volume_24h?.usd ?? null,
    floor_24h_change_pct:
      row.floor_price_24h_percentage_change ??
      row.floor_price_in_usd_24h_percentage_change ??
      null,
  };
}

export default {
  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname !== "/nft/raw") {
      return new Response("Not found", { status: 404 });
    }

    const sources = {};
    let meta = { cached: false, stale: false, rate_limited: false, snapshot_size: 0 };

    try {
      const m = await getMarkets();
      const byId = new Map(m.rows.map(r => [r.id, r]));
      for (const t of TARGETS) {
        const row = byId.get(t.id);
        sources[t.name] = row
          ? { name: t.id, ok: true,  data: pick(row), error: null }
          : { name: t.id, ok: false, data: null, error: "not_in_markets_snapshot" };
      }
      meta = {
        cached: m.cached,
        stale: m.stale,
        rate_limited: m.rate_limited,
        snapshot_size: m.rows.length,
      };
    } catch (e) {
      const msg = e.message || "unknown";
      for (const t of TARGETS) {
        sources[t.name] = { name: t.id, ok: false, data: null, error: msg };
      }
      meta.rate_limited = /429/.test(msg);
    }

    return Response.json({
      sector: "nft-floors",
      ts: new Date().toISOString(),
      meta,
      sources,
    });
  },
};
