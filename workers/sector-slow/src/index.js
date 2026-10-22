// sector-slow: consolidated worker for slow-trend sectors
// Compares against value WINDOW_DAYS ago (not last call)

const WINDOW_DAYS_DEFAULT = 7;

async function fetchSafe(fn) {
  try { return { ok: true, data: await fn() }; }
  catch (e) { return { ok: false, error: String(e).slice(0, 120) }; }
}

function buildSlowEnvelope(sector, config, result, history) {
  const sources = result.sources;
  const healthy = Object.values(sources).filter(s => s.ok).length;
  const total = Object.keys(sources).length;
  const failed = Object.entries(sources).filter(([, v]) => !v.ok).map(([k]) => k);

  const metric = sources[config.metric]?.ok ? sources[config.metric].data : null;
  const windowDays = config.window_days || WINDOW_DAYS_DEFAULT;

  let historical = null, absChange = 0, pct = 0;
  if (metric !== null && history && history.length > 0) {
    const cutoff = Date.now() - windowDays * 24 * 60 * 60 * 1000;
    const old = history.find(h => h.t <= cutoff);
    if (old && old.v !== null) {
      historical = old.v;
      absChange = metric - old.v;
      pct = old.v === 0 ? 0 : (absChange / old.v) * 100;
    }
  }

  const tp = config.threshold_pct || 0;
  const hasSignal = historical !== null && Math.abs(pct) >= tp;
  const severity = Math.abs(pct) >= tp * 2 ? "alert" : "notice";

  return {
    sector, density: "slow",
    has_signal: hasSignal,
    severity: hasSignal ? severity : "info",
    confidence: healthy / Math.max(total, 1),
    timestamp: new Date().toISOString(),
    summary: hasSignal
      ? config.metric + " " + metric + " (" + (pct > 0 ? "+" : "") + pct.toFixed(1) + "% vs " + windowDays + "d ago)"
      : "quiet",
    delta: historical !== null
      ? { metric: config.metric, current: metric, previous: historical, pct_change: pct, window: config.window || "7d" }
      : { metric: config.metric, current: metric, previous: null, pct_change: null, window: config.window || "7d" },
    context: { history_points: history ? history.length : 0 },
    sources: { total, healthy, failed },
    ttl_seconds: config.ttl || 86400,
  };
}


async function fetchWithRetry(url, opts = {}, maxRetries = 3) {
  let lastErr;
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const r = await fetch(url, opts);
      if (r.ok) return r;
      lastErr = new Error("status " + r.status);
    } catch (e) {
      lastErr = e;
    }
    if (attempt < maxRetries - 1) {
      await new Promise(res => setTimeout(res, 500 * (attempt + 1)));
    }
  }
  throw lastErr;
}

const COLLECTORS = {
  "rir-arin": {
    config: { metric: "ipv4_allocations", threshold_pct: 0.1, threshold_abs: 5, window: "24h", ttl: 86400, context_keys: [] },
    collectAll: async () => ({
      sources: {
        ipv4_allocations: await fetchSafe(async () => {
          const r = await fetch("https://ftp.arin.net/pub/stats/arin/delegated-arin-extended-latest",
            { headers: { "user-agent": "VolatiAI/1.0" }, signal: AbortSignal.timeout(25000) });
          if (!r.ok) throw new Error("http_" + r.status);
          const text = await r.text();
          let count = 0;
          for (const line of text.split("\n")) {
            if (line.includes("|ipv4|")) count++;
          }
          if (count === 0) throw new Error("no_records");
          return count;
        }),
      },
    }),
  },

  environment: {
    config: { metric: "co2_ppm", threshold_pct: 0.3, window: "7d", window_days: 7, ttl: 86400 },
    collectAll: async (env) => ({
      sources: {
        co2_ppm: await fetchSafe(async () => {
          const r = await fetch("https://global-warming.org/api/co2-api");
          if (!r.ok) throw new Error("status " + r.status);
          const j = await r.json();
          if (!j.co2?.length) throw new Error("no co2");
          const latest = j.co2[j.co2.length - 1];
          return Math.round(parseFloat(latest.trend) * 100) / 100;
        }),
      },
    }),
  },
  treasuries: {
    config: { metric: "yield_10y", threshold_pct: 5.0, window: "7d", window_days: 7, ttl: 86400 },
    collectAll: async (env) => ({
      sources: {
        yield_10y: await fetchSafe(async () => {
          // FRED CSV — requires User-Agent header (else 520)
          const r = await fetchWithRetry("https://fred.stlouisfed.org/graph/fredgraph.csv?id=DGS10&cosd=2026-01-01", {
            headers: { "User-Agent": "VolatiAI/1.0 (contact@volatiai.local)" }
          });
          if (!r.ok) throw new Error("status " + r.status);
          const csv = await r.text();
          const lines = csv.trim().split("\n").slice(1).filter(l => !l.endsWith(","));
          if (!lines.length) throw new Error("no data");
          const last = lines[lines.length - 1].split(",");
          const val = parseFloat(last[1]);
          if (isNaN(val)) throw new Error("invalid value");
          return val;
        }),
      },
    }),
  },
  gdp: {
    config: { metric: "gdp_se", threshold_pct: 2.0, window: "7d", window_days: 30, ttl: 86400 },
    collectAll: async (env) => ({
      sources: {
        gdp_se: await fetchSafe(async () => {
          const r = await fetch("https://api.worldbank.org/v2/country/SWE/indicator/NY.GDP.MKTP.CD?format=json&per_page=1&date=2024");
          if (!r.ok) throw new Error("status " + r.status);
          const j = await r.json();
          const val = j[1]?.[0]?.value;
          if (val === null || val === undefined) throw new Error("no gdp");
          return Math.round(val / 1e9 * 10) / 10;
        }),
      },
    }),
  },


  unemployment: {
    config: { metric: "unemployment_se", threshold_pct: 3.0, window: "30d", window_days: 30, ttl: 86400 },
    collectAll: async (env) => ({
      sources: {
        unemployment_se: await fetchSafe(async () => {
          const r = await fetch("https://api.worldbank.org/v2/country/SWE/indicator/SL.UEM.TOTL.ZS?format=json&per_page=1&date=2024");
          if (!r.ok) throw new Error("status " + r.status);
          const j = await r.json();
          const val = j[1]?.[0]?.value;
          if (val === null || val === undefined) throw new Error("no data");
          return Math.round(val * 10) / 10;
        }),
      },
    }),
  },

};

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "content-type": "application/json" },
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const parts = url.pathname.split("/").filter(Boolean);

    if (parts.length === 0) {
      return json({ ok: true, density: "slow", sectors: Object.keys(COLLECTORS) });
    }

    const sectorName = parts[0];
    const action = parts[1] || "signal";
    const collector = COLLECTORS[sectorName];

    if (!collector) return json({ error: "unknown sector", sector: sectorName }, 404);

    if (action === "health") {
      return json({ ok: true, sector: sectorName, density: "slow" });
    }

    if (action === "raw") {
      return json(await collector.collectAll(env));
    }

    if (action === "signal") {
      const result = await collector.collectAll(env);
      const config = collector.config;
      const kvKey = `${sectorName}_${config.metric}_history`;
      const raw = await env.SECTOR_KV.get(kvKey);
      let history = raw ? JSON.parse(raw) : [];

      const envelope = buildSlowEnvelope(sectorName, config, result, history);

      const current = result.sources[config.metric]?.ok ? result.sources[config.metric].data : null;
      if (current !== null && current !== undefined) {
        history.push({ t: Date.now(), v: current });
        history = history.filter(h => h.t > Date.now() - 30 * 24 * 60 * 60 * 1000);
        try {
          await env.SECTOR_KV.put(kvKey, JSON.stringify(history), { expirationTtl: 86400 * 31 });
        } catch (kvErr) {
          console.log("KV put failed:", String(kvErr));
        }
      }

      return json(envelope);
    }

    return json({ not: "found" }, 404);
  },
};
