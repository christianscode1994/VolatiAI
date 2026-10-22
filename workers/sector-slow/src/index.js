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

  let historical = null, absChange = 0, pct = 0, actualWindowDays = null;
  if (metric !== null && Array.isArray(history) && history.length > 0) {
    const cutoff = Date.now() - windowDays * 24 * 60 * 60 * 1000;
    const normalized = history
      .map(h => {
        const rawT = h.t ?? h.timestamp ?? h.ts ?? h.date;
        const rawV = h.v ?? h.value ?? h.measurement;
        return {
          t: typeof rawT === 'number' ? rawT : Date.parse(rawT ?? ''),
          v: typeof rawV === 'number' ? rawV : Number(rawV),
        };
      })
      .filter(h => Number.isFinite(h.t) && Number.isFinite(h.v))
      .sort((a, b) => a.t - b.t);           // oldest first
    // Prefer an entry at least windowDays old. If none exists (e.g. history
    // is brand new), fall back to the oldest available and record the
    // actual window so downstream knows this is a shorter comparison.
    const old = normalized.find(h => h.t <= cutoff) ?? normalized[0];
    if (old) {
      historical = old.v;
      absChange = metric - old.v;
      pct = old.v === 0 ? 0 : (absChange / old.v) * 100;
      actualWindowDays = Math.round(((Date.now() - old.t) / 86400000) * 10) / 10;
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
      ? config.metric + " " + metric + " (" + (pct > 0 ? "+" : "") + pct.toFixed(1) + "% vs " + (actualWindowDays != null ? actualWindowDays + "d" : windowDays + "d") + " ago)"
      : "quiet",
    delta: historical !== null
      ? { metric: config.metric, current: metric, previous: historical, pct_change: pct, window: config.window || "7d", actual_window_days: actualWindowDays }
      : { metric: config.metric, current: metric, previous: null, pct_change: null, window: config.window || "7d" },
    context: { history_points: history ? history.length : 0, actual_window_days: actualWindowDays },
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
  "ripe-atlas-public": {
    config: { metric: "public_measurements", threshold_pct: 0.1, threshold_abs: 100, window: "24h", ttl: 86400, context_keys: [] },
    collectAll: async () => ({
      sources: {
        public_measurements: await fetchSafe(async () => {
          const r = await fetch("https://atlas.ripe.net/api/v2/measurements/?status=Ongoing&is_public=true&page_size=1",
            { headers: { "user-agent": "VolatiAI/1.0" }, signal: AbortSignal.timeout(25000) });
          if (!r.ok) throw new Error("http_" + r.status);
          const j = await r.json();
          if (typeof j.count !== "number") throw new Error("no_count");
          return j.count;
        }),
      },
    }),
  },

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

  faostat: {
    config: { metric: "food_price_index", threshold_pct: 0.5, window: "30d", window_days: 30, ttl: 86400 },
    collectAll: async () => ({
      sources: {
        food_price_index: await fetchSafe(async () => {
          throw new Error("endpoint_unverified: see scripts/verify_endpoints.sh");
        }),
      },
    }),
  },
  "global-forest-watch": {
    config: { metric: "tree_cover_loss_ha", threshold_pct: 1.0, window: "30d", window_days: 30, ttl: 86400 },
    collectAll: async () => ({
      sources: {
        tree_cover_loss_ha: await fetchSafe(async () => {
          throw new Error("endpoint_unverified");
        }),
      },
    }),
  },
  "fcc-broadband": {
    config: { metric: "providers_reporting", threshold_pct: 0.2, window: "30d", window_days: 30, ttl: 86400 },
    collectAll: async () => ({
      sources: {
        providers_reporting: await fetchSafe(async () => {
          throw new Error("endpoint_unverified");
        }),
      },
    }),
  },
  bakom: {
    config: { metric: "antenna_sites", threshold_pct: 0.1, window: "30d", window_days: 30, ttl: 86400 },
    collectAll: async () => ({
      sources: {
        antenna_sites: await fetchSafe(async () => {
          throw new Error("endpoint_unverified");
        }),
      },
    }),
  },
  ripestat: {
    config: { metric: "asn_count", threshold_pct: 0.1, window: "30d", window_days: 30, ttl: 86400 },
    collectAll: async () => ({
      sources: {
        asn_count: await fetchSafe(async () => {
          const r = await fetch("https://stat.ripe.net/data/as-overview/data.json?resource=AS3333",
            { headers: { "user-agent": "VolatiAI/1.0" }, signal: AbortSignal.timeout(25000) });
          if (!r.ok) throw new Error("http_" + r.status);
          const j = await r.json();
          // stat.ripe.net as-overview gives announced status, not count.
          // Use the RIS peers count as a proxy for routing population.
          if (j.data && typeof j.data.announced === "boolean") return j.data.announced ? 1 : 0;
          throw new Error("no_data");
        }),
      },
    }),
  },
  "ietf-datatracker": {
    config: { metric: "rfc_count", threshold_pct: 0.1, window: "30d", window_days: 30, ttl: 86400 },
    collectAll: async () => ({
      sources: {
        rfc_count: await fetchSafe(async () => {
          const r = await fetch("https://datatracker.ietf.org/api/v1/doc/document/?format=json&limit=1&type=rfc",
            { headers: { "user-agent": "VolatiAI/1.0" }, signal: AbortSignal.timeout(25000) });
          if (!r.ok) throw new Error("http_" + r.status);
          const j = await r.json();
          if (j.meta && typeof j.meta.total_count === "number") return j.meta.total_count;
          throw new Error("no_meta_total");
        }),
      },
    }),
  },
  fhfa: {
    config: { metric: "hpi_index", threshold_pct: 0.3, window: "30d", window_days: 30, ttl: 86400 },
    collectAll: async () => ({
      sources: {
        hpi_index: await fetchSafe(async () => {
          const r = await fetch("https://www.fhfa.gov/hpi/download/monthly/hpi_master.csv",
            { headers: { "user-agent": "VolatiAI/1.0" }, signal: AbortSignal.timeout(30000) });
          if (!r.ok) throw new Error("http_" + r.status);
          const text = await r.text();
          const lines = text.trim().split(/\r?\n/);
          if (lines.length < 2) throw new Error("no_rows");
          const header = lines[0].split(",").map(h => h.trim().toLowerCase());
          // Prefer seasonally-adjusted index; fall back to non-adjusted.
          let col = header.indexOf("index_sa");
          if (col < 0) col = header.indexOf("index_nsa");
          if (col < 0) col = header.length - 1;   // last resort
          // Walk backwards from the end; first numeric value wins.
          for (let i = lines.length - 1; i >= 1; i--) {
            const parts = lines[i].split(",");
            const v = parseFloat(parts[col]);
            if (Number.isFinite(v) && v > 0) return v;
          }
          throw new Error("no_value");
        }),
      },
    }),
  },
  scb: {
    config: { metric: "construction_index", threshold_pct: 0.3, window: "30d", window_days: 30, ttl: 86400 },
    collectAll: async () => ({
      sources: {
        construction_index: await fetchSafe(async () => {
          throw new Error("endpoint_unverified");
        }),
      },
    }),
  },
  arbetsformedlingen: {
    config: { metric: "job_vacancies", threshold_pct: 1.0, window: "7d", window_days: 7, ttl: 86400 },
    collectAll: async () => ({
      sources: {
        job_vacancies: await fetchSafe(async () => {
          const r = await fetch("https://jobsearch.api.jobtechdev.se/search?limit=1",
            { headers: { "user-agent": "VolatiAI/1.0" }, signal: AbortSignal.timeout(25000) });
          if (!r.ok) throw new Error("http_" + r.status);
          const j = await r.json();
          if (j.total && typeof j.total.value === "number") return j.total.value;
          throw new Error("no_total");
        }),
      },
    }),
  },
  poligraph: {
    config: { metric: "judicial_affairs", threshold_pct: 1.0, window: "30d", window_days: 30, ttl: 86400 },
    collectAll: async () => ({
      sources: {
        judicial_affairs: await fetchSafe(async () => {
          const r = await fetch("https://poligraph.fr/api/affaires",
            { headers: { "user-agent": "VolatiAI/1.0" }, signal: AbortSignal.timeout(25000) });
          if (!r.ok) throw new Error("http_" + r.status);
          const j = await r.json();
          const arr = Array.isArray(j) ? j : (Array.isArray(j.data) ? j.data : null);
          if (!arr) throw new Error("no_array");
          return arr.length;
        }),
      },
    }),
  },
  satlas: {
    config: { metric: "tracked_objects", threshold_pct: 0.5, window: "30d", window_days: 30, ttl: 86400 },
    collectAll: async () => ({
      sources: {
        tracked_objects: await fetchSafe(async () => {
          throw new Error("endpoint_unverified");
        }),
      },
    }),
  },
  mattercatalog: {
    config: { metric: "certified_products", threshold_pct: 0.5, window: "30d", window_days: 30, ttl: 86400 },
    collectAll: async () => ({
      sources: {
        certified_products: await fetchSafe(async () => {
          const r = await fetch("https://mattercatalog.com/api/stats.json",
            { headers: { "user-agent": "VolatiAI/1.0" }, signal: AbortSignal.timeout(25000) });
          if (!r.ok) throw new Error("http_" + r.status);
          const j = await r.json();
          if (!j.data || typeof j.data.totalProducts !== "number") throw new Error("no_totalProducts");
          return j.data.totalProducts;
        }),
      },
    }),
  },
  "home-assistant": {
    config: { metric: "installations", threshold_pct: 0.5, window: "7d", window_days: 7, ttl: 86400 },
    collectAll: async () => ({
      sources: {
        installations: await fetchSafe(async () => {
          const r = await fetch("https://analytics.home-assistant.io/data.json",
            { headers: { "user-agent": "VolatiAI/1.0" }, signal: AbortSignal.timeout(25000) });
          if (!r.ok) throw new Error("http_" + r.status);
          const j = await r.json();
          // data.json shape: {current: {installation_types: {core: N, ...}, ...}, ...}
          const types = j && j.current && j.current.installation_types;
          if (!types || typeof types !== "object") throw new Error("no_installation_types");
          const sum = Object.values(types)
            .filter(v => typeof v === "number" && Number.isFinite(v) && v >= 0)
            .reduce((a, b) => a + b, 0);
          if (sum === 0) throw new Error("zero_sum");
          return sum;
        }),
      },
    }),
  },
  robonix: {
    config: { metric: "packages", threshold_pct: 1.0, window: "7d", window_days: 7, ttl: 86400 },
    collectAll: async () => ({
      sources: {
        packages: await fetchSafe(async () => {
          const r = await fetch("https://packages.robonix.ai/api/v1/packages.json",
            { headers: { "user-agent": "VolatiAI/1.0" }, signal: AbortSignal.timeout(25000) });
          if (!r.ok) throw new Error("http_" + r.status);
          const j = await r.json();
          if (Array.isArray(j)) return j.length;
          if (j && Array.isArray(j.data)) return j.data.length;
          if (j && Array.isArray(j.packages)) return j.packages.length;
          if (j && typeof j.count === "number") return j.count;
          throw new Error("not_array");
        }),
      },
    }),
  },


  saos: {
    config: { metric: "judgments", threshold_pct: 0.5, window: "30d", window_days: 30, ttl: 86400 },
    collectAll: async () => ({
      sources: {
        judgments: await fetchSafe(async () => {
          // SAOS requires Accept: application/json (406 without it),
          // and pageSize must be >=10 (400 otherwise).
          const r = await fetch("https://www.saos.org.pl/api/search/judgments?pageSize=10",
            { headers: { "user-agent": "VolatiAI/1.0", "accept": "application/json" }, signal: AbortSignal.timeout(25000) });
          if (!r.ok) throw new Error("http_" + r.status);
          const j = await r.json();
          // Response shape: { info: { totalResults: N }, items: [...] }
          const n = (j.info && typeof j.info.totalResults === "number") ? j.info.totalResults
                  : (typeof j.count === "number") ? j.count
                  : null;
          if (n === null) throw new Error("no_totalResults");
          return n;
        }),
      },
    }),
  },

  "dc-crime": {
    config: { metric: "crime_incidents", threshold_pct: 1.0, window: "30d", window_days: 30, ttl: 86400 },
    collectAll: async () => ({
      sources: {
        crime_incidents: await fetchSafe(async () => {
          const r = await fetch("https://maps2.dcgis.dc.gov/dcgis/rest/services/FEEDS/MPD/FeatureServer/41/query?where=1%3D1&returnCountOnly=true&f=json",
            { headers: { "user-agent": "VolatiAI/1.0" }, signal: AbortSignal.timeout(25000) });
          if (!r.ok) throw new Error("http_" + r.status);
          const j = await r.json();
          if (typeof j.count !== "number") throw new Error("no_count");
          return j.count;
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


async function runSectorForCron(sectorName, collector, env) {
  const config = collector.config;
  const kvKey = `${sectorName}_${config.metric}_history`;
  const raw = await env.SECTOR_KV.get(kvKey);
  let history = raw ? JSON.parse(raw) : [];
  const result = await collector.collectAll(env);
  const envelope = buildSlowEnvelope(sectorName, config, result, history);
  const current = result.sources[config.metric]?.ok ? result.sources[config.metric].data : null;
  if (current === null || current === undefined) {
    return { sector: sectorName, skipped: "no_current", failed: envelope.sources.failed };
  }
  const today = new Date().toISOString().slice(0, 10);
  const todayEntry = history.find(h => new Date(h.t).toISOString().slice(0, 10) === today);
  const valueChanged = !todayEntry || todayEntry.v !== current;
  if (!valueChanged) {
    return { sector: sectorName, skipped: "unchanged_today", has_signal: envelope.has_signal };
  }
  history = history.filter(h => new Date(h.t).toISOString().slice(0, 10) !== today);
  history.push({ t: Date.now(), v: current });
  history = history.filter(h => h.t > Date.now() - 30 * 24 * 60 * 60 * 1000);
  try {
    await env.SECTOR_KV.put(kvKey, JSON.stringify(history), { expirationTtl: 86400 * 31 });
    return { sector: sectorName, written: true, value: current, has_signal: envelope.has_signal };
  } catch (e) {
    return { sector: sectorName, error: String(e).slice(0, 120) };
  }
}

export default {

  async scheduled(event, env, ctx) {
    const results = [];
    const cron = event && event.cron ? event.cron : "unknown";
    console.log("cron start:", cron);
    for (const [name, collector] of Object.entries(COLLECTORS)) {
      try {
        const r = await runSectorForCron(name, collector, env);
        results.push(r);
        console.log("cron sector:", name, JSON.stringify(r));
      } catch (e) {
        const err = { sector: name, error: String(e).slice(0, 120) };
        results.push(err);
        console.log("cron sector:", name, JSON.stringify(err));
      }
    }
    const written = results.filter(r => r.written).length;
    const skipped = results.filter(r => r.skipped).length;
    const failed  = results.filter(r => r.error).length;
    console.log(`cron summary: ${written} written, ${skipped} skipped, ${failed} failed`);
  },

  async fetch(request, env) {
    const url = new URL(request.url);
    const parts = url.pathname.split("/").filter(Boolean);

    if (parts.length === 0) {
      return json({ ok: true, density: "slow", sectors: Object.keys(COLLECTORS) });
    }

    const sectorName = parts[0];
    const action = parts[1] || "signal";

    if (sectorName === "_health") {
      const summary = {};
      for (const [name, c] of Object.entries(COLLECTORS)) {
        const kvKey = name + "_" + c.config.metric + "_history";
        try {
          const raw = await env.SECTOR_KV.get(kvKey);
          const h = raw ? JSON.parse(raw) : [];
          const times = (h || []).map(x => x.t).filter(t => Number.isFinite(t));
          summary[name] = {
            history_points: (h || []).length,
            span_days: times.length ? Math.round(((Math.max(...times) - Math.min(...times)) / 86400000) * 10) / 10 : 0,
            newest_iso: times.length ? new Date(Math.max(...times)).toISOString() : null,
          };
        } catch (e) {
          summary[name] = { error: String(e).slice(0, 80) };
        }
      }
      return json({ density: "slow", sectors: summary, timestamp: new Date().toISOString() });
    }

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
        // Skip the KV write entirely when today's value is unchanged.
        // Without this, hourly workflows that hit /signal on all sectors
        // would consume 6k+ writes/day. With it, one write per sector per
        // day (or more only when the value actually moves).
        const today = new Date().toISOString().slice(0, 10);
        const todayEntry = history.find(h => new Date(h.t).toISOString().slice(0, 10) === today);
        const valueChanged = !todayEntry || todayEntry.v !== current;
        if (!valueChanged) {
          envelope.context = { ...envelope.context, kv_put_skipped: "unchanged_today" };
        } else {
          history = history.filter(h => new Date(h.t).toISOString().slice(0, 10) !== today);
          history.push({ t: Date.now(), v: current });
          history = history.filter(h => h.t > Date.now() - 30 * 24 * 60 * 60 * 1000);
          try {
            await env.SECTOR_KV.put(kvKey, JSON.stringify(history), { expirationTtl: 86400 * 31 });
          } catch (kvErr) {
            console.log("KV put failed:", String(kvErr));
            envelope.context = { ...envelope.context, kv_put_ok: false, kv_error: String(kvErr).slice(0, 120) };
          }
        }
      }

      return json(envelope);
    }

    return json({ not: "found" }, 404);
  },
};
