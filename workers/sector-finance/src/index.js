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

    const yield10y = result.sources.treasury.ok ? result.sources.treasury.data : null;
    let prevStr = null;
    let absChangeBp = 0;
    let pct = 0;
    if (yield10y !== null) {
      prevStr = await env.SECTOR_KV.get("treasury_10y");
      if (prevStr) {
        const prevNum = parseFloat(prevStr);
        absChangeBp = (yield10y - prevNum) * 100;
        pct = ((yield10y - prevNum) / prevNum) * 100;
      }
      await env.SECTOR_KV.put("treasury_10y", String(yield10y), { expirationTtl: 86400 });
    }

    const MIN_BP = 10;
    const hasSignal = Math.abs(absChangeBp) >= MIN_BP;
    const sev = Math.abs(absChangeBp) >= 20 ? "alert" : "notice";

    return envelope({
      has_signal: hasSignal,
      severity: sev,
      summary: hasSignal
        ? `10Y yield ${yield10y.toFixed(3)}% (${absChangeBp > 0 ? "+" : ""}${absChangeBp.toFixed(1)} bp)`
        : "quiet",
      delta: yield10y !== null
        ? { metric: "treasury_10y", current: yield10y, previous: prevStr ? parseFloat(prevStr) : null, pct_change: pct, window: "24h" }
        : null,
      context: {
        dxy: result.sources.dxy.ok ? result.sources.dxy.data : null,
        sp500: result.sources.sp500.ok ? result.sources.sp500.data : null,
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
      treasury: await fetchSafe(async () => {
        const r = await fetch("https://fred.stlouisfed.org/graph/fredgraph.csv?id=DGS10&cosd=2026-01-01");
        if (!r.ok) throw new Error(`status ${r.status}`);
        const csv = await r.text();
        const lines = csv.trim().split("\n").slice(1).filter(l => !l.endsWith(","));
        if (lines.length === 0) throw new Error("no data");
        const last = lines[lines.length - 1].split(",");
        const val = parseFloat(last[1]);
        if (isNaN(val)) throw new Error("invalid value");
        return val;
      }),
      dxy: await fetchSafe(async () => {
        // DXY proxy: EUR/USD inverse, since DXY is ~57% EUR
        const r = await fetch("https://api.frankfurter.app/latest?from=USD&to=EUR,JPY,GBP,CAD,SEK,CHF");
        if (!r.ok) throw new Error(`status ${r.status}`);
        const j = await r.json();
        if (!j.rates || !j.rates.EUR) throw new Error("no rates");
        // Higher rate = weaker USD; invert for a rough DXY direction
        return Math.round((1 / j.rates.EUR) * 10000) / 10000;
      }),
      sp500: await fetchSafe(async () => {
        const r = await fetch("https://stooq.com/q/l/?s=^spx&f=sd2t2ohlcv&h&e=csv");
        if (!r.ok) throw new Error(`status ${r.status}`);
        const csv = await r.text();
        const lines = csv.trim().split("\n");
        if (lines.length < 2) throw new Error("no data");
        const cols = lines[1].split(",");
        const close = parseFloat(cols[6]);
        if (isNaN(close)) throw new Error("invalid close");
        return Math.round(close * 100) / 100;
      }),
    },
  };
}
