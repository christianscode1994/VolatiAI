const SECTOR = "weather";

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

    const metric = result.sources["temp_stockholm"] && result.sources["temp_stockholm"].ok
      ? result.sources["temp_stockholm"].data
      : null;
    let prevStr = null;
    let absChange = 0;
    let pct = 0;
    if (metric !== null) {
      prevStr = await env.SECTOR_KV.get("weather_temp_stockholm");
      if (prevStr) {
        const prevNum = parseFloat(prevStr);
        absChange = metric - prevNum;
        pct = prevNum === 0 ? 0 : (absChange / prevNum) * 100;
      }
      await env.SECTOR_KV.put("weather_temp_stockholm", String(metric), { expirationTtl: 3600 });
    }

    const hasSignal = Math.abs(pct) >= 15.0 && Math.abs(absChange) >= 3.0;
    const sev = Math.abs(pct) >= (15.0 * 3) ? "alert" : "notice";

    return envelope({
      has_signal: hasSignal,
      severity: sev,
      summary: hasSignal
        ? "temp_stockholm " + metric + " (" + (pct > 0 ? "+" : "") + pct.toFixed(1) + "%)"
        : "quiet",
      delta: metric !== null
        ? { metric: "temp_stockholm", current: metric, previous: prevStr ? parseFloat(prevStr) : null, pct_change: pct, window: "24h" }
        : null,
      context: {
        wind_stockholm: result.sources["wind_stockholm"] && result.sources["wind_stockholm"].ok ? result.sources["wind_stockholm"].data : null
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
      temp_stockholm: await fetchSafe(async () => {
        const r = await fetch('https://api.open-meteo.com/v1/forecast?latitude=59.33&longitude=18.07&current=temperature_2m');
        const j = await r.json();
        if (!j.current || j.current.temperature_2m === undefined) throw new Error('no temp');
        return j.current.temperature_2m;
      }),
      wind_stockholm: await fetchSafe(async () => {
        const r = await fetch('https://api.open-meteo.com/v1/forecast?latitude=59.33&longitude=18.07&current=wind_speed_10m');
        const j = await r.json();
        return j.current && j.current.wind_speed_10m !== undefined ? j.current.wind_speed_10m : null;
      })
    },
  };
}
