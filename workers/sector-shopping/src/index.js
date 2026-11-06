const SECTOR = "shopping";

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
    ttl_seconds: 3600,
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

    const metric = result.sources["wti"] && result.sources["wti"].ok
      ? result.sources["wti"].data
      : null;
    let prevStr = null;
    let absChange = 0;
    let pct = 0;
    if (metric !== null) {
      prevStr = await env.SECTOR_KV.get("shopping_wti");
      if (prevStr) {
        const prevNum = parseFloat(prevStr);
        absChange = metric - prevNum;
        pct = prevNum === 0 ? 0 : (absChange / prevNum) * 100;
      }
      await env.SECTOR_KV.put("shopping_wti", String(metric), { expirationTtl: 3600 });
    }

    const hasSignal = Math.abs(pct) >= 3.0 && Math.abs(absChange) >= 1.5;
    const sev = Math.abs(pct) >= (3.0 * 3) ? "alert" : "notice";

    return envelope({
      has_signal: hasSignal,
      severity: sev,
      summary: hasSignal
        ? "wti " + metric + " (" + (pct > 0 ? "+" : "") + pct.toFixed(1) + "%)"
        : "quiet",
      delta: metric !== null
        ? { metric: "wti", current: metric, previous: prevStr ? parseFloat(prevStr) : null, pct_change: pct, window: "24h" }
        : null,
      context: {
        
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
      wti: await fetchSafe(async () => {
        const r = await fetch('https://query1.finance.yahoo.com/v8/finance/chart/CL%3DF?interval=1d&range=1d', {
          headers: { 'user-agent': 'Mozilla/5.0' }
        });
        if (!r.ok) throw new Error('status ' + r.status);
        const j = await r.json();
        const result = j.chart && j.chart.result && j.chart.result[0];
        if (!result || !result.meta || !result.meta.regularMarketPrice) throw new Error('no price');
        return Math.round(result.meta.regularMarketPrice * 100) / 100;
      })
    },
  };
}
