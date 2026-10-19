const SECTOR = "finance";

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

    const metric = result.sources["treasury_10y"] && result.sources["treasury_10y"].ok
      ? result.sources["treasury_10y"].data
      : null;
    let prevStr = null;
    let absChange = 0;
    let pct = 0;
    if (metric !== null) {
      prevStr = await env.SECTOR_KV.get("finance_treasury_10y");
      if (prevStr) {
        const prevNum = parseFloat(prevStr);
        absChange = metric - prevNum;
        pct = prevNum === 0 ? 0 : (absChange / prevNum) * 100;
      }
      await env.SECTOR_KV.put("finance_treasury_10y", String(metric), { expirationTtl: 3600 });
    }

    const hasSignal = Math.abs(pct) >= 5.0 && Math.abs(absChange) >= 0.1;
    const sev = Math.abs(pct) >= (5.0 * 3) ? "alert" : "notice";

    return envelope({
      has_signal: hasSignal,
      severity: sev,
      summary: hasSignal
        ? "treasury_10y " + metric + " (" + (pct > 0 ? "+" : "") + pct.toFixed(1) + "%)"
        : "quiet",
      delta: metric !== null
        ? { metric: "treasury_10y", current: metric, previous: prevStr ? parseFloat(prevStr) : null, pct_change: pct, window: "24h" }
        : null,
      context: {
        dxy: result.sources["dxy"] && result.sources["dxy"].ok ? result.sources["dxy"].data : null
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
      treasury_10y: await fetchSafe(async () => {
        const r = await fetch('https://fred.stlouisfed.org/graph/fredgraph.csv?id=DGS10&cosd=2026-01-01');
        if (!r.ok) throw new Error('status ' + r.status);
        const csv = await r.text();
        const lines = csv.trim().split('\n').slice(1).filter(l => !l.endsWith(','));
        if (!lines.length) throw new Error('no data');
        const last = lines[lines.length - 1].split(',');
        const val = parseFloat(last[1]);
        if (isNaN(val)) throw new Error('invalid');
        return val;
      }),
      dxy: await fetchSafe(async () => {
        const r = await fetch('https://api.frankfurter.app/latest?from=USD&to=EUR,JPY,GBP,CAD,SEK,CHF');
        if (!r.ok) throw new Error('status ' + r.status);
        const j = await r.json();
        if (!j.rates || !j.rates.EUR) throw new Error('no rates');
        return Math.round((1 / j.rates.EUR) * 10000) / 10000;
      })
    },
  };
}
