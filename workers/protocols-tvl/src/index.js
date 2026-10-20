const UA = { "user-agent": "VolatiAI/1.0", "accept": "application/json" };

async function fetchSafe(name, fn) {
  try {
    const data = await fn();
    return { name, ok: true, data, error: null };
  } catch (e) {
    return { name, ok: false, data: null, error: e.message || "unknown" };
  }
}

async function chainsAndTotal() {
  const r = await fetch("https://api.llama.fi/v2/chains", {
    headers: UA,
    signal: AbortSignal.timeout(12000),
  });
  if (!r.ok) throw new Error("http_" + r.status);
  const j = await r.json();
  if (!Array.isArray(j)) throw new Error("not_array");
  const sorted = [...j].sort((a, b) => (b.tvl ?? 0) - (a.tvl ?? 0));
  const total = j.reduce((s, c) => s + (c.tvl ?? 0), 0);
  return {
    total_tvl_usd: Math.round(total),
    chain_count: j.length,
    top_15: sorted.slice(0, 15).map(c => ({ name: c.name, tvl: c.tvl })),
  };
}

async function protocolBySlug(slug) {
  const r = await fetch(
    "https://api.llama.fi/protocol/" + encodeURIComponent(slug),
    { headers: UA, signal: AbortSignal.timeout(12000) }
  );
  if (!r.ok) throw new Error("http_" + r.status);
  const j = await r.json();
  const series = Array.isArray(j.tvl) ? j.tvl : [];
  const latest = series.length ? series[series.length - 1] : null;
  const chainBreakdown = (j.currentChainTvls && typeof j.currentChainTvls === "object")
    ? Object.entries(j.currentChainTvls)
        .sort((a, b) => (b[1] ?? 0) - (a[1] ?? 0))
        .slice(0, 8)
        .map(([chain, tvl]) => ({ chain, tvl }))
    : null;
  return {
    slug: j.slug ?? slug,
    name: j.name ?? slug,
    category: j.category ?? null,
    tvl_latest_usd: latest?.totalLiquidityUSD ?? null,
    chain_breakdown: chainBreakdown,
  };
}

export default {
  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname !== "/protocols/raw") {
      return new Response("Not found", { status: 404 });
    }
    const slug = url.searchParams.get("slug") || "aave";

    const [chainsRes, protoRes] = await Promise.all([
      fetchSafe("defillama.chains", chainsAndTotal),
      fetchSafe("defillama.protocol", () => protocolBySlug(slug)),
    ]);

    return Response.json({
      sector: "protocols-tvl",
      ts: new Date().toISOString(),
      inputs: { slug },
      sources: {
        chains: chainsRes,
        protocol: protoRes,
      },
    });
  },
};
