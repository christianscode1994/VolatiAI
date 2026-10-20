const UA = { "user-agent": "VolatiAI/1.0", "accept": "application/json" };

const COLLECTIONS = [
  { slug: "boredapeyachtclub", name: "BAYC" },
  { slug: "cryptopunks",       name: "CryptoPunks" },
  { slug: "pudgypenguins",     name: "Pudgy Penguins" },
  { slug: "azuki",             name: "Azuki" },
  { slug: "doodles-official",  name: "Doodles" },
];

async function fetchSafe(name, fn) {
  try {
    const data = await fn();
    return { name, ok: true, data, error: null };
  } catch (e) {
    return { name, ok: false, data: null, error: e.message || "unknown" };
  }
}

async function fetchCollection(slug) {
  const r = await fetch(
    `https://api.reservoir.tools/collections/v6?slug=${encodeURIComponent(slug)}`,
    { headers: UA, signal: AbortSignal.timeout(10000) }
  );
  if (!r.ok) throw new Error(`http_${r.status}`);
  const j = await r.json();
  const c = j?.collections?.[0];
  if (!c) throw new Error("collection_not_found");
  const floor = c.floorAsk?.price?.amount;
  return {
    slug:     c.slug,
    name:     c.name,
    floor_eth: floor?.native ?? null,
    floor_usd: floor?.usd ?? null,
    volume_24h: c.volume?.["1day"] ?? null,
  };
}

export default {
  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname !== "/nft/raw") {
      return new Response("Not found", { status: 404 });
    }

    const results = await Promise.all(
      COLLECTIONS.map(async (col) => ({
        name: col.name,
        ...(await fetchSafe(col.slug, () => fetchCollection(col.slug))),
      }))
    );

    const sources = Object.fromEntries(results.map(r => [r.name, r]));
    return Response.json({
      sector: "nft-floors",
      ts: new Date().toISOString(),
      sources,
    });
  },
};
