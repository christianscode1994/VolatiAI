const UA = { "user-agent": "VolatiAI/1.0", "accept": "application/json" };

const L2_NAMES = [
  "Arbitrum", "Base", "OP Mainnet", "Optimism", "zkSync Era", "Linea",
  "Scroll", "Mantle", "Blast", "Starknet", "Manta Pacific", "Metis",
  "Mode", "Taiko", "Immutable zkEVM", "ZKsync Era"
];

async function fetchSafe(name, fn) {
  try {
    const data = await fn();
    return { name, ok: true, data, error: null };
  } catch (e) {
    return { name, ok: false, data: null, error: e.message || "unknown" };
  }
}

async function l2beatTvl() {
  const r = await fetch("https://l2beat.com/api/scaling/tvl", {
    headers: UA,
    signal: AbortSignal.timeout(12000),
  });
  if (!r.ok) throw new Error("http_" + r.status);
  const j = await r.json();

  // Shape 1: array of { name, tvs | tvl | usd }
  if (Array.isArray(j)) {
    return {
      count: j.length,
      projects: j.slice(0, 30).map(p => ({
        name: p.name ?? p.id ?? "unknown",
        tvs_usd: p.tvs ?? p.tvl ?? p.usd ?? null,
      })),
    };
  }
  // Shape 2: object keyed by project name
  if (j && typeof j === "object") {
    const entries = Object.entries(j).slice(0, 30).map(([k, v]) => ({
      name: k,
      tvs_usd: typeof v === "number" ? v : (v?.tvs ?? v?.tvl ?? v?.usd ?? null),
    }));
    return { count: entries.length, projects: entries };
  }
  throw new Error("unexpected_shape");
}

async function defillamaL2s() {
  const r = await fetch("https://api.llama.fi/v2/chains", {
    headers: UA,
    signal: AbortSignal.timeout(12000),
  });
  if (!r.ok) throw new Error("http_" + r.status);
  const j = await r.json();
  if (!Array.isArray(j)) throw new Error("not_array");
  const l2 = j.filter(c => L2_NAMES.includes(c.name));
  l2.sort((a, b) => (b.tvl ?? 0) - (a.tvl ?? 0));
  return {
    count: l2.length,
    total_tvl_usd: Math.round(l2.reduce((s, c) => s + (c.tvl ?? 0), 0)),
    chains: l2.map(c => ({ name: c.name, tvl: c.tvl })),
  };
}

export default {
  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname !== "/scaling/raw") {
      return new Response("Not found", { status: 404 });
    }
    const [l2beat, defillama] = await Promise.all([
      fetchSafe("l2beat", l2beatTvl),
      fetchSafe("defillama.l2s", defillamaL2s),
    ]);
    return Response.json({
      sector: "scaling-l2",
      ts: new Date().toISOString(),
      sources: { l2beat, defillama },
    });
  },
};
