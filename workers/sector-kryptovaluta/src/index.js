const SECTOR = "kryptovaluta";

function envelope({ has_signal, severity, summary, delta, context, sources }) {
  return new Response(JSON.stringify({
    sector: SECTOR,
    has_signal,
    density: "dense",
    severity: has_signal ? severity : "info",
    confidence: sources.healthy / Math.max(sources.total, 1),
    timestamp: new Date().toISOString(),
    summary: has_signal ? summary : "quiet",
    delta: delta || { metric: "none", current: 0, previous: null, pct_change: null, window: "24h" },
    context: context || {},
    sources,
    ttl_seconds: 1800,
  }), { headers: { "content-type": "application/json" } });
}

async function fetchSafe(fn) {
  try { return { ok: true, data: await fn() }; }
  catch (e) { return { ok: false, error: String(e).slice(0, 120) }; }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/health") {
      return new Response(JSON.stringify({ ok: true, sector: SECTOR }), {
        headers: { "content-type": "application/json" },
      });
    }
    if (url.pathname === "/raw") {
      const raw = await collectAll(env);
      return new Response(JSON.stringify(raw, null, 2), {
        headers: { "content-type": "application/json" },
      });
    }
    if (url.pathname !== "/signal" && url.pathname !== "/") {
      return new Response("not found", { status: 404 });
    }

    const result = await collectAll(env);
    const healthy = Object.values(result.sources).filter(s => s.ok).length;
    const total = Object.keys(result.sources).length;

    if (healthy === 0) {
      return envelope({
        has_signal: false,
        sources: { total, healthy, failed: Object.keys(result.sources) },
      });
    }

    const dominance = result.sources.dominance.ok ? result.sources.dominance.data : null;
    let prevStr = null;
    let absChange = 0;
    let pct = 0;
    if (dominance !== null) {
      prevStr = await env.SECTOR_KV.get("btc_dominance");
      if (prevStr) {
        const prevNum = parseFloat(prevStr);
        absChange = dominance - prevNum;
        pct = ((dominance - prevNum) / prevNum) * 100;
      }
      await env.SECTOR_KV.put("btc_dominance", String(dominance), { expirationTtl: 86400 });
    }

    const MIN_ABS_DOM = 1.0;
    const hasSignal = Math.abs(absChange) >= MIN_ABS_DOM;
    const sev = Math.abs(absChange) >= 2.0 ? "alert" : "notice";

    return envelope({
      has_signal: hasSignal,
      severity: sev,
      summary: hasSignal
        ? `BTC dominance ${dominance.toFixed(2)}% (${absChange > 0 ? "+" : ""}${absChange.toFixed(2)} pp)`
        : "quiet",
      delta: dominance !== null
        ? { metric: "btc_dominance", current: dominance, previous: prevStr ? parseFloat(prevStr) : null, pct_change: pct, window: "24h" }
        : null,
      context: {
        fng: result.sources.fng.ok ? result.sources.fng.data : null,
        top10_avg_24h: result.sources.top10.ok ? result.sources.top10.data : null,
      },
      sources: {
        total, healthy,
        failed: Object.entries(result.sources).filter(([, v]) => !v.ok).map(([k]) => k),
      },
    });
  },
};

async function collectAll(env) {
  return {
    sources: {
      dominance: await fetchSafe(async () => {
        const r = await fetch("https://api.coingecko.com/api/v3/global", {
          headers: { accept: "application/json" },
        });
        if (!r.ok) throw new Error(`status ${r.status}`);
        const j = await r.json();
        if (!j.data || !j.data.market_cap_percentage) throw new Error("no data");
        return Math.round(j.data.market_cap_percentage.btc * 100) / 100;
      }),
      fng: await fetchSafe(async () => {
        const r = await fetch("https://api.alternative.me/fng/?limit=1");
        if (!r.ok) throw new Error(`status ${r.status}`);
        const j = await r.json();
        if (!j.data || !j.data[0]) throw new Error("no data");
        return {
          value: parseInt(j.data[0].value, 10),
          classification: j.data[0].value_classification,
        };
      }),
      top10: await fetchSafe(async () => {
        const r = await fetch(
          "https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=10&page=1&price_change_percentage=24h"
        );
        if (!r.ok) throw new Error(`status ${r.status}`);
        const j = await r.json();
        if (!Array.isArray(j) || j.length === 0) throw new Error("empty");
        const avg = j.reduce((s, c) => s + (c.price_change_percentage_24h || 0), 0) / j.length;
        return Math.round(avg * 100) / 100;
      }),
    },
  };
}
