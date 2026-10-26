// sector-slow: consolidated worker for slow-trend sectors
// Compares against value WINDOW_DAYS ago (not last call)

const WINDOW_DAYS_DEFAULT = 7;

import { coherenceScore, detrendedCoherence, detrendedResiduals, pearson, correlationPValue, correlationWarning, buildClaimGraph, arbitrate } from "./arbitration.js";

const DASHBOARD_HTML = `<!doctype html>
<html><head><meta charset="utf-8"><title>VolatiAI · sector-slow</title>
<style>
  body { font: 13px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; margin: 1.5em; color: #222; background: #fafafa; }
  h1 { font-weight: 600; margin: 0 0 0.4em; }
  .meta { color: #666; margin-bottom: 1.2em; }
  table { border-collapse: collapse; width: 100%; background: #fff; box-shadow: 0 1px 3px rgba(0,0,0,0.06); }
  th, td { padding: 6px 10px; text-align: left; border-bottom: 1px solid #eee; white-space: nowrap; }
  th { background: #f5f5f5; font-weight: 600; font-size: 12px; text-transform: uppercase; letter-spacing: 0.03em; }
  tr:hover td { background: #f8f8f8; }
  .ok { color: #16a34a; } .warn { color: #ca8a04; } .bad { color: #dc2626; font-weight: 600; } .idle { color: #888; }
  code { font-family: ui-monospace, monospace; font-size: 0.92em; }
  a { color: #2563eb; text-decoration: none; } a:hover { text-decoration: underline; }
  .note { color: #888; margin-top: 1em; font-size: 12px; }
</style></head>
<body>
<h1>VolatiAI · sector-slow</h1>
<div class="meta">Refreshed <span id="ts">&mdash;</span> · <a href="/_sectors">_sectors</a> · <a href="/_health">_health</a></div>
<table id="tbl"><thead><tr><th>sector</th><th>metric</th><th>n</th><th>last</th><th>prev</th><th>pct</th><th>thr</th><th>dist</th><th>age</th><th>links</th></tr></thead><tbody></tbody></table>
<p class="note">dist = |pct| &minus; threshold. Negative = below threshold (safe). &ge;0 = would fire. Sorted: closest to firing at top.</p>
<script>
async function load() {
  document.getElementById("ts").textContent = new Date().toISOString().slice(0,19).replace("T"," ") + " UTC";
  const tbody = document.querySelector("#tbl tbody");
  tbody.innerHTML = "";
  let data;
  try {
    const r = await fetch("/_health");
    data = await r.json();
  } catch (e) {
    tbody.innerHTML = '<tr><td colspan="10" class="bad">fetch failed: ' + e + '</td></tr>';
    return;
  }
  const rows = Object.entries(data.sectors).sort((a,b) => {
    const aD = a[1].distance_pct !== null && a[1].distance_pct !== undefined ? a[1].distance_pct : -Infinity;
    const bD = b[1].distance_pct !== null && b[1].distance_pct !== undefined ? b[1].distance_pct : -Infinity;
    if (aD !== bD) return bD - aD;
    return a[0].localeCompare(b[0]);
  });
  const EM = "\u2014";
  for (const [name, v] of rows) {
    const tr = document.createElement("tr");
    const age = v.newest_iso ? ((Date.now() - new Date(v.newest_iso).getTime()) / 3600000) : null;
    let ageCls = "idle", ageTxt = EM;
    if (age !== null) { ageTxt = age.toFixed(1) + "h"; ageCls = age < 25 ? "ok" : age < 48 ? "warn" : "bad"; }
    const pct = v.pct_change;
    const pctTxt = (pct === null || pct === undefined) ? EM : (pct >= 0 ? "+" : "") + pct.toFixed(2) + "%";
    const dist = v.distance_pct;
    const distTxt = (dist === null || dist === undefined) ? EM : dist.toFixed(2) + "%";
    const distCls = (dist === null || dist === undefined) ? "idle" : (dist >= 0 ? "bad" : dist >= -1 ? "warn" : "idle");
    tr.innerHTML = '<td><code>' + name + '</code></td>'
      + '<td class="idle">' + (v.metric || EM) + '</td>'
      + '<td>' + v.history_points + '</td>'
      + '<td>' + (v.last_value === null || v.last_value === undefined ? EM : v.last_value) + '</td>'
      + '<td class="idle">' + (v.prev_value === null || v.prev_value === undefined ? EM : v.prev_value) + '</td>'
      + '<td>' + pctTxt + '</td>'
      + '<td class="idle">' + (v.threshold_pct != null ? v.threshold_pct + "%" : EM) + '</td>'
      + '<td class="' + distCls + '">' + distTxt + '</td>'
      + '<td class="' + ageCls + '">' + ageTxt + '</td>'
      + '<td><a href="/' + name + '/signal">signal</a> &middot; <a href="/' + name + '/history">history</a> &middot; <a href="/' + name + '/raw">raw</a></td>';
    tbody.appendChild(tr);
  }
}
load();
setInterval(load, 60000);
</script>
</body></html>`;

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
    config: { metric: "public_measurements", threshold_pct: 5.0, threshold_abs: 100, window: "24h", ttl: 86400, context_keys: [] },
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
  arbetsformedlingen: {
    config: { metric: "job_vacancies", threshold_pct: 5.0, window: "7d", window_days: 7, ttl: 86400 },
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
    config: { metric: "packages", threshold_pct: 5.0, window: "7d", window_days: 7, ttl: 86400 },
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

  "met-artworks": {
    config: { metric: "total_artworks", threshold_pct: 5.0, window: "1d", window_days: 1, ttl: 86400 },
    collectAll: async () => ({
      sources: {
        total_artworks: await fetchSafe(async () => {
          const r = await fetch("https://collectionapi.metmuseum.org/public/collection/v1/objects",
            { headers: { "user-agent": "VolatiAI/1.0" }, signal: AbortSignal.timeout(25000) });
          if (!r.ok) throw new Error("http_" + r.status);
          const j = await r.json();
          if (typeof j.total !== "number") throw new Error("no_total: keys=" + Object.keys(j || {}).join(","));
          return j.total;
        }),
      },
    }),
  },
  "cern-opendata": {
    config: { metric: "total_records", threshold_pct: 5.0, window: "1d", window_days: 1, ttl: 86400 },
    collectAll: async () => ({
      sources: {
        total_records: await fetchSafe(async () => {
          const r = await fetch("https://opendata.cern.ch/api/records/?size=1",
            { headers: { "user-agent": "VolatiAI/1.0", "accept": "application/json" }, signal: AbortSignal.timeout(25000) });
          if (!r.ok) throw new Error("http_" + r.status);
          const j = await r.json();
          const raw = j?.hits?.total;
          const total = typeof raw === "number" ? raw
                      : (raw && typeof raw.value === "number") ? raw.value
                      : null;
          if (total === null) throw new Error("no_total: keys=" + Object.keys(j || {}).join(","));
          return total;
        }),
      },
    }),
  },
  "tweetfeed-c2": {
    config: { metric: "weekly_c2_ips", threshold_pct: 5.0, window: "7d", window_days: 7, ttl: 86400 },
    collectAll: async () => ({
      sources: {
        weekly_c2_ips: await fetchSafe(async () => {
          const r = await fetch("https://api.tweetfeed.live/v1/week/ip",
            { headers: { "user-agent": "VolatiAI/1.0", "accept": "application/json" }, signal: AbortSignal.timeout(25000) });
          if (!r.ok) throw new Error("http_" + r.status);
          const j = await r.json();
          if (!Array.isArray(j)) throw new Error("not_array: keys=" + Object.keys(j || {}).join(","));
          return j.length;
        }),
      },
    }),
  },
  "wikidata-triples": {
    config: { metric: "total_triples", threshold_pct: 5.0, window: "1d", window_days: 1, ttl: 86400 },
    collectAll: async () => ({
      sources: {
        total_triples: await fetchSafe(async () => {
          const q = "SELECT(COUNT(*) AS ?c) WHERE {?s ?p ?o}";
          const url = "https://query.wikidata.org/sparql?query=" + encodeURIComponent(q) + "&format=json";
          const r = await fetch(url,
            { headers: { "user-agent": "VolatiAI/1.0", "accept": "application/sparql-results+json" }, signal: AbortSignal.timeout(25000) });
          if (!r.ok) throw new Error("http_" + r.status);
          const j = await r.json();
          const raw = j?.results?.bindings?.[0]?.c?.value;
          const total = typeof raw === "string" ? parseInt(raw, 10) : raw;
          if (!Number.isFinite(total)) throw new Error("no_count");
          return total;
        }),
      },
    }),
  },
  "ballotwatch-bills": {
    config: { metric: "total_bills", threshold_pct: 5.0, window: "1d", window_days: 1, ttl: 86400 },
    collectAll: async () => ({
      sources: {
        total_bills: await fetchSafe(async () => {
          const r = await fetch("https://www.ballotwatch.io/api/v1/bills?limit=1",
            { headers: { "user-agent": "VolatiAI/1.0", "accept": "application/json" }, signal: AbortSignal.timeout(25000) });
          if (!r.ok) throw new Error("http_" + r.status);
          const j = await r.json();
          const raw = j?.pagination?.total ?? j?.pagination?.count ?? j?.meta?.total;
          const total = typeof raw === "number" ? raw : parseInt(raw, 10);
          if (!Number.isFinite(total)) throw new Error("no_total: pagination_keys=" + Object.keys(j?.pagination || {}).join(","));
          return total;
        }),
      },
    }),
  },
  "openfda-drug-recalls": {
    config: { metric: "drug_recalls", threshold_pct: 2.0, window: "30d", window_days: 30, ttl: 86400 },
    collectAll: async () => ({
      sources: {
        drug_recalls: await fetchSafe(async () => {
          const r = await fetch("https://api.fda.gov/drug/enforcement.json?limit=1",
            { headers: { "user-agent": "VolatiAI/1.0" }, signal: AbortSignal.timeout(25000) });
          if (!r.ok) throw new Error("http_" + r.status);
          const j = await r.json();
          const total = j?.meta?.results?.total;
          if (typeof total !== "number") throw new Error("no_total");
          return total;
        }),
      },
    }),
  },
  "openfda-food-recalls": {
    config: { metric: "food_recalls", threshold_pct: 2.0, window: "30d", window_days: 30, ttl: 86400 },
    collectAll: async () => ({
      sources: {
        food_recalls: await fetchSafe(async () => {
          const r = await fetch("https://api.fda.gov/food/enforcement.json?limit=1",
            { headers: { "user-agent": "VolatiAI/1.0" }, signal: AbortSignal.timeout(25000) });
          if (!r.ok) throw new Error("http_" + r.status);
          const j = await r.json();
          const total = j?.meta?.results?.total;
          if (typeof total !== "number") throw new Error("no_total");
          return total;
        }),
      },
    }),
  },
  "openfda-device-recalls": {
    config: { metric: "device_recalls", threshold_pct: 2.0, window: "30d", window_days: 30, ttl: 86400 },
    collectAll: async () => ({
      sources: {
        device_recalls: await fetchSafe(async () => {
          const r = await fetch("https://api.fda.gov/device/enforcement.json?limit=1",
            { headers: { "user-agent": "VolatiAI/1.0" }, signal: AbortSignal.timeout(25000) });
          if (!r.ok) throw new Error("http_" + r.status);
          const j = await r.json();
          const total = j?.meta?.results?.total;
          if (typeof total !== "number") throw new Error("no_total");
          return total;
        }),
      },
    }),
  },
  "cleveland-artworks": {
    config: { metric: "total_artworks", threshold_pct: 5.0, window: "1d", window_days: 1, ttl: 86400 },
    collectAll: async () => ({
      sources: {
        total_artworks: await fetchSafe(async () => {
          const r = await fetch("https://openaccess-api.clevelandart.org/api/artworks/?limit=1",
            { headers: { "user-agent": "VolatiAI/1.0" }, signal: AbortSignal.timeout(25000) });
          if (!r.ok) throw new Error("http_" + r.status);
          const j = await r.json();
          const total = j?.info?.total;
          if (typeof total !== "number") throw new Error("no_total");
          return total;
        }),
      },
    }),
  },
  "apis-guru-directory": {
    config: { metric: "num_apis", threshold_pct: 0.5, window: "30d", window_days: 30, ttl: 86400 },
    collectAll: async () => ({
      sources: {
        num_apis: await fetchSafe(async () => {
          const r = await fetch("https://api.apis.guru/v2/metrics.json",
            { headers: { "user-agent": "VolatiAI/1.0", "accept": "application/json" }, signal: AbortSignal.timeout(25000) });
          if (!r.ok) throw new Error("http_" + r.status);
          const j = await r.json();
          const total = j?.numAPIs;
          if (typeof total !== "number") throw new Error("no_numAPIs");
          return total;
        }),
      },
    }),
  },
  "usgs-earthquakes": {
    config: { metric: "earthquakes_since_2026", threshold_pct: 15.0, window: "1d", window_days: 1, ttl: 86400 },
    collectAll: async () => ({
      sources: {
        earthquakes_since_2026: await fetchSafe(async () => {
          const r = await fetch("https://earthquake.usgs.gov/fdsnws/event/1/count?format=geojson&starttime=2026-01-01",
            { headers: { "user-agent": "VolatiAI/1.0" }, signal: AbortSignal.timeout(25000) });
          if (!r.ok) throw new Error("http_" + r.status);
          const j = await r.json();
          if (typeof j.count !== "number") throw new Error("no_count: keys=" + Object.keys(j || {}).join(","));
          return j.count;
        }),
      },
    }),
  },
  "noaa-spaceweather-alerts": {
    config: { metric: "active_alerts", threshold_pct: 10.0, window: "7d", window_days: 7, ttl: 86400 },
    collectAll: async () => ({
      sources: {
        active_alerts: await fetchSafe(async () => {
          const r = await fetch("https://services.swpc.noaa.gov/products/alerts.json",
            { headers: { "user-agent": "VolatiAI/1.0", "accept": "application/json" }, signal: AbortSignal.timeout(25000) });
          if (!r.ok) throw new Error("http_" + r.status);
          const j = await r.json();
          if (!Array.isArray(j)) throw new Error("not_array: keys=" + Object.keys(j || {}).join(","));
          return j.length;
        }),
      },
    }),
  },
  "crossref-works": {
    config: { metric: "total_works", threshold_pct: 3.0, window: "1d", window_days: 1, ttl: 86400 },
    collectAll: async () => ({
      sources: {
        total_works: await fetchSafe(async () => {
          const r = await fetch("https://api.crossref.org/works?rows=0",
            { headers: { "user-agent": "VolatiAI/1.0", "accept": "application/json" }, signal: AbortSignal.timeout(25000) });
          if (!r.ok) throw new Error("http_" + r.status);
          const j = await r.json();
          const total = j?.message?.["total-results"];
          if (typeof total !== "number") throw new Error("no_total");
          return total;
        }),
      },
    }),
  },
  "doaj-articles": {
    config: { metric: "total_articles", threshold_pct: 3.0, window: "1d", window_days: 1, ttl: 86400 },
    collectAll: async () => ({
      sources: {
        total_articles: await fetchSafe(async () => {
          const r = await fetch("https://doaj.org/api/search/articles/*?pageSize=1",
            { headers: { "user-agent": "VolatiAI/1.0", "accept": "application/json" }, signal: AbortSignal.timeout(25000) });
          if (!r.ok) throw new Error("http_" + r.status);
          const j = await r.json();
          if (typeof j.total !== "number") throw new Error("no_total");
          return j.total;
        }),
      },
    }),
  },
  "datacite-dois": {
    config: { metric: "total_dois", threshold_pct: 8.0, window: "1d", window_days: 1, ttl: 86400 },
    collectAll: async () => ({
      sources: {
        total_dois: await fetchSafe(async () => {
          const r = await fetch("https://api.datacite.org/dois?page[size]=1",
            { headers: { "user-agent": "VolatiAI/1.0", "accept": "application/json" }, signal: AbortSignal.timeout(25000) });
          if (!r.ok) throw new Error("http_" + r.status);
          const j = await r.json();
          const total = j?.meta?.total ?? j?.meta?.totalCount;
          if (typeof total !== "number") throw new Error("no_total: meta_keys=" + Object.keys(j?.meta || {}).join(","));
          return total;
        }),
      },
    }),
  },
  "zenodo-records": {
    config: { metric: "total_records", threshold_pct: 5.0, window: "1d", window_days: 1, ttl: 86400 },
    collectAll: async () => ({
      sources: {
        total_records: await fetchSafe(async () => {
          const r = await fetch("https://zenodo.org/api/records?size=1",
            { headers: { "user-agent": "VolatiAI/1.0", "accept": "application/json" }, signal: AbortSignal.timeout(25000) });
          if (!r.ok) throw new Error("http_" + r.status);
          const j = await r.json();
          const total = j?.hits?.total;
          if (typeof total !== "number") throw new Error("no_total: hits_keys=" + Object.keys(j?.hits || {}).join(","));
          return total;
        }),
      },
    }),
  },
  "treasuries-gov": {
    config: { metric: "yield_10y", threshold_pct: 5.0, window: "7d", window_days: 7, ttl: 86400 },
    collectAll: async () => ({
      sources: {
        yield_10y: await fetchSafe(async () => {
          const year = new Date().getUTCFullYear();
          const url = `https://home.treasury.gov/resource-center/data-chart-center/interest-rates/daily-treasury-rates.csv/${year}/all?type=daily_treasury_yield_curve&field_tdr_date_value=${year}&page&_format=csv`;
          const r = await fetch(url, { headers: { "user-agent": "VolatiAI/1.0" }, signal: AbortSignal.timeout(25000) });
          if (!r.ok) throw new Error("http_" + r.status);
          const text = await r.text();
          const lines = text.trim().split(/\r?\n/);
          if (lines.length < 2) throw new Error("no_rows");
          const header = lines[0].split(",").map(h => h.trim().replace(/^"|"$/g, ""));
          const tenYrIdx = header.findIndex(h => h === "10 Yr");
          if (tenYrIdx < 0) throw new Error("no_10Yr_col: " + header.join("|"));
          for (let i = 1; i < lines.length; i++) {
            const parts = lines[i].split(",");
            const v = parseFloat(parts[tenYrIdx].replace(/"/g, ""));
            if (Number.isFinite(v) && v > 0) return v;
          }
          throw new Error("no_value");
        }),
      },
    }),
  },
  "usgs-earthquakes-emsc": {
    config: { metric: "earthquakes_since_2026", threshold_pct: 15.0, window: "1d", window_days: 1, ttl: 86400 },
    collectAll: async () => ({
      sources: {
        earthquakes_since_2026: await fetchSafe(async () => {
          // EMSC (European-Mediterranean Seismological Centre) FDSN-compatible
          // count endpoint. Same metric name as usgs-earthquakes so the
          // _correlation same_metric flag fires and _claim_graph adds a
          // cross-source provenance edge between the two claims.
          const r = await fetch("https://www.seismicportal.eu/fdsnws/event/1/count?starttime=2026-01-01&format=text",
            { headers: { "user-agent": "VolatiAI/1.0" }, signal: AbortSignal.timeout(25000) });
          if (!r.ok) throw new Error("http_" + r.status);
          const text = (await r.text()).trim();
          const n = parseInt(text, 10);
          if (!Number.isFinite(n) || n <= 0) throw new Error("no_count: body=" + text.slice(0, 80));
          return n;
        }),
      },
    }),
  },
  "nvd-cve-count": {
    config: { metric: "total_cves", threshold_pct: 10.0, window: "1d", window_days: 1, ttl: 86400 },
    collectAll: async () => ({
      sources: {
        total_cves: await fetchSafe(async () => {
          // NVD API 2.0 — returns totalResults for the whole CVE catalog.
          const r = await fetch("https://services.nvd.nist.gov/rest/json/cves/2.0?resultsPerPage=1",
            { headers: { "user-agent": "VolatiAI/1.0" }, signal: AbortSignal.timeout(25000) });
          if (!r.ok) throw new Error("http_" + r.status);
          const j = await r.json();
          const total = j?.totalResults;
          if (typeof total !== "number") throw new Error("no_totalResults");
          return total;
        }),
      },
    }),
  },
  "cisa-kev-count": {
    config: { metric: "known_exploited", threshold_pct: 2.0, window: "30d", window_days: 30, ttl: 86400 },
    collectAll: async () => ({
      sources: {
        known_exploited: await fetchSafe(async () => {
          const r = await fetch("https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json",
            { headers: { "user-agent": "VolatiAI/1.0" }, signal: AbortSignal.timeout(25000) });
          if (!r.ok) throw new Error("http_" + r.status);
          const j = await r.json();
          const count = j?.count;
          if (typeof count !== "number") throw new Error("no_count");
          return count;
        }),
      },
    }),
  },
  "phishunt-domains": {
    config: { metric: "active_phishings", threshold_pct: 5.0, window: "7d", window_days: 7, ttl: 86400 },
    collectAll: async () => ({
      sources: {
        active_phishings: await fetchSafe(async () => {
          // phishunt.io — CC0 1.0, no auth, no key. Paginated JSON.
          const r = await fetch("https://phishunt.io/api/v1/domains?limit=1",
            { headers: { "user-agent": "VolatiAI/1.0", "accept": "application/json" }, signal: AbortSignal.timeout(25000) });
          if (!r.ok) throw new Error("http_" + r.status);
          const j = await r.json();
          // Try common pagination shapes
          const total = j?.meta?.total
                     ?? j?.pagination?.total
                     ?? j?.total
                     ?? (Array.isArray(j?.data) ? j.data.length : null);
          if (typeof total !== "number") throw new Error("no_total: keys=" + Object.keys(j || {}).join(","));
          return total;
        }),
      },
    }),
  },
  "gleif-leis": {
    config: { metric: "total_leis", threshold_pct: 5.0, window: "1d", window_days: 1, ttl: 86400 },
    collectAll: async () => ({
      sources: {
        total_leis: await fetchSafe(async () => {
          // GLEIF LEI registry — CC0, keyless, live count of legal entities
          // with a Legal Entity Identifier. URL-encoded brackets because
          // some environments mangle the raw [ ] form.
          const r = await fetch("https://api.gleif.org/api/v1/lei-records?page%5Bsize%5D=1",
            { headers: { "user-agent": "VolatiAI/1.0", "accept": "application/vnd.api+json" }, signal: AbortSignal.timeout(25000) });
          if (!r.ok) throw new Error("http_" + r.status);
          const j = await r.json();
          const total = j?.meta?.pagination?.total;
          if (typeof total !== "number") throw new Error("no_total: meta_keys=" + Object.keys(j?.meta || {}).join(","));
          return total;
        }),
      },
    }),
  },
  "frankfurter-eurusd": {
    config: { metric: "eur_usd", threshold_pct: 0.3, window: "1d", window_days: 1, ttl: 86400 },
    collectAll: async () => ({
      sources: {
        eur_usd: await fetchSafe(async () => {
          const r = await fetch("https://api.frankfurter.dev/v1/latest?base=EUR&symbols=USD",
            { headers: { "user-agent": "VolatiAI/1.0" }, signal: AbortSignal.timeout(15000) });
          if (!r.ok) throw new Error("http_" + r.status);
          const j = await r.json();
          const v = j?.rates?.USD;
          if (typeof v !== "number") throw new Error("no_rate: keys=" + Object.keys(j?.rates || {}).join(","));
          return v;
        }),
      },
    }),
  },
  "frankfurter-eursek": {
    config: { metric: "eur_sek", threshold_pct: 0.3, window: "1d", window_days: 1, ttl: 86400 },
    collectAll: async () => ({
      sources: {
        eur_sek: await fetchSafe(async () => {
          const r = await fetch("https://api.frankfurter.dev/v1/latest?base=EUR&symbols=SEK",
            { headers: { "user-agent": "VolatiAI/1.0" }, signal: AbortSignal.timeout(15000) });
          if (!r.ok) throw new Error("http_" + r.status);
          const j = await r.json();
          const v = j?.rates?.SEK;
          if (typeof v !== "number") throw new Error("no_rate");
          return v;
        }),
      },
    }),
  },
  "nbp-gold-spot": {
    config: { metric: "pln_per_gram", threshold_pct: 1.0, window: "1d", window_days: 1, ttl: 86400 },
    collectAll: async () => ({
      sources: {
        pln_per_gram: await fetchSafe(async () => {
          const r = await fetch("https://api.nbp.pl/api/cenyzlota/?format=json",
            { headers: { "user-agent": "VolatiAI/1.0" }, signal: AbortSignal.timeout(15000) });
          if (!r.ok) throw new Error("http_" + r.status);
          const j = await r.json();
          const v = Array.isArray(j) && j[0]?.cena;
          if (typeof v !== "number") throw new Error("no_price");
          return v;
        }),
      },
    }),
  },
  "worldbank-se-gdp": {
    config: { metric: "gdp_usd", threshold_pct: 0.5, window: "365d", window_days: 365, ttl: 604800 },
    collectAll: async () => ({
      sources: {
        gdp_usd: await fetchSafe(async () => {
          const r = await fetch("https://api.worldbank.org/v2/country/SE/indicator/NY.GDP.MKTP.CD?format=json&per_page=10",
            { headers: { "user-agent": "VolatiAI/1.0" }, signal: AbortSignal.timeout(15000) });
          if (!r.ok) throw new Error("http_" + r.status);
          const j = await r.json();
          const rows = Array.isArray(j?.[1]) ? j[1] : [];
          const row = rows.find(x => x && typeof x.value === "number");
          if (!row) throw new Error("no_value");
          return row.value;
        }),
      },
    }),
  },
  "coinbase-btc-usd": {
    config: { metric: "btc_usd", threshold_pct: 5.0, window: "1d", window_days: 1, ttl: 3600 },
    collectAll: async () => ({
      sources: {
        btc_usd: await fetchSafe(async () => {
          const r = await fetch("https://api.exchange.coinbase.com/products/BTC-USD/ticker",
            { headers: { "user-agent": "VolatiAI/1.0" }, signal: AbortSignal.timeout(15000) });
          if (!r.ok) throw new Error("http_" + r.status);
          const j = await r.json();
          const v = parseFloat(j?.price);
          if (!Number.isFinite(v)) throw new Error("no_price");
          return v;
        }),
      },
    }),
  },
  "defillama-protocol-count": {
    config: { metric: "protocol_count", threshold_pct: 1.0, window: "7d", window_days: 7, ttl: 86400 },
    collectAll: async () => ({
      sources: {
        protocol_count: await fetchSafe(async () => {
          const r = await fetch("https://api.llama.fi/protocols",
            { headers: { "user-agent": "VolatiAI/1.0" }, signal: AbortSignal.timeout(30000) });
          if (!r.ok) throw new Error("http_" + r.status);
          const j = await r.json();
          if (!Array.isArray(j)) throw new Error("not_array");
          return j.length;
        }),
      },
    }),
  },
  "coinbase-btc-volume24h": {
    config: { metric: "btc_quote_volume_usd", threshold_pct: 25, window: "1d", window_days: 1, ttl: 3600 },
    collectAll: async () => ({
      sources: {
        btc_quote_volume_usd: await fetchSafe(async () => {
          const r = await fetch("https://api.exchange.coinbase.com/products/BTC-USD/stats",
            { headers: { "user-agent": "VolatiAI/1.0 (christianscode1994@gmail.com)" }, signal: AbortSignal.timeout(15000) });
          if (!r.ok) throw new Error("http_" + r.status);
          const j = await r.json();
          const vol = parseFloat(j?.volume);
          const price = parseFloat(j?.last);
          if (!Number.isFinite(vol) || !Number.isFinite(price)) throw new Error("bad_stats");
          return vol * price;
        }),
      },
    }),
  },
  "worldbank-us-unemployment": {
    config: { metric: "unemployment_pct", threshold_pct: 2.0, window: "365d", window_days: 365, ttl: 604800 },
    collectAll: async () => ({
      sources: {
        unemployment_pct: await fetchSafe(async () => {
          const r = await fetch("https://api.worldbank.org/v2/country/US/indicator/SL.UEM.TOTL.ZS?format=json&per_page=10",
            { headers: { "user-agent": "VolatiAI/1.0" }, signal: AbortSignal.timeout(15000) });
          if (!r.ok) throw new Error("http_" + r.status);
          const j = await r.json();
          const rows = Array.isArray(j?.[1]) ? j[1] : [];
          const row = rows.find(x => x && typeof x.value === "number");
          if (!row) throw new Error("no_value");
          return row.value;
        }),
      },
    }),
  },
  "dbnomics-us-debt": {
    config: { metric: "debt_pct_gdp", threshold_pct: 0.5, window: "365d", window_days: 365, ttl: 604800 },
    collectAll: async () => ({
      sources: {
        debt_pct_gdp: await fetchSafe(async () => {
          const r = await fetch("https://api.db.nomics.world/v22/series/IMF/WEO:2024-10/USA.GGXWDG_NGDP.pcent_gdp?observations=1",
            { headers: { "user-agent": "VolatiAI/1.0 (christianscode1994@gmail.com)" }, signal: AbortSignal.timeout(20000) });
          if (!r.ok) throw new Error("http_" + r.status);
          const j = await r.json();
          const doc = j?.series?.docs?.[0];
          const v = doc?.value?.[doc.value.length - 1];
          if (typeof v !== "number") throw new Error("no_value");
          return v;
        }),
      },
    }),
  },
  "kraken-btc-usd": {
    config: { metric: "btc_usd", threshold_pct: 5.0, window: "1d", window_days: 1, ttl: 3600 },
    collectAll: async () => ({
      sources: {
        btc_usd: await fetchSafe(async () => {
          const r = await fetch("https://api.kraken.com/0/public/Ticker?pair=XBTUSD",
            { headers: { "user-agent": "VolatiAI/1.0" }, signal: AbortSignal.timeout(15000) });
          if (!r.ok) throw new Error("http_" + r.status);
          const j = await r.json();
          if (Array.isArray(j?.error) && j.error.length) throw new Error("kraken_" + j.error.join(","));
          const result = j?.result || {};
          const key = Object.keys(result)[0];
          const v = parseFloat(result[key]?.c?.[0]);
          if (!Number.isFinite(v)) throw new Error("no_price");
          return v;
        }),
      },
    }),
  },
  "kraken-sol-usd": {
    config: { metric: "sol_usd", threshold_pct: 5.0, window: "1d", window_days: 1, ttl: 3600 },
    collectAll: async () => ({
      sources: {
        sol_usd: await fetchSafe(async () => {
          const r = await fetch("https://api.kraken.com/0/public/Ticker?pair=SOLUSD",
            { headers: { "user-agent": "VolatiAI/1.0" }, signal: AbortSignal.timeout(15000) });
          if (!r.ok) throw new Error("http_" + r.status);
          const j = await r.json();
          if (Array.isArray(j?.error) && j.error.length) throw new Error("kraken_" + j.error.join(","));
          const result = j?.result || {};
          const key = Object.keys(result)[0];
          const v = parseFloat(result[key]?.c?.[0]);
          if (!Number.isFinite(v)) throw new Error("no_price");
          return v;
        }),
      },
    }),
  },

  "kraken-xrp-usd": {
    config: { metric: "xrp_usd", threshold_pct: 5.0, window: "1d", window_days: 1, ttl: 3600 },
    collectAll: async () => ({
      sources: {
        xrp_usd: await fetchSafe(async () => {
          const r = await fetch("https://api.kraken.com/0/public/Ticker?pair=XRPUSD",
            { headers: { "user-agent": "VolatiAI/1.0" }, signal: AbortSignal.timeout(15000) });
          if (!r.ok) throw new Error("http_" + r.status);
          const j = await r.json();
          if (Array.isArray(j?.error) && j.error.length) throw new Error("kraken_" + j.error.join(","));
          const result = j?.result || {};
          const key = Object.keys(result)[0];
          const v = parseFloat(result[key]?.c?.[0]);
          if (!Number.isFinite(v)) throw new Error("no_price");
          return v;
        }),
      },
    }),
  },
  "kraken-ada-usd": {
    config: { metric: "ada_usd", threshold_pct: 5.0, window: "1d", window_days: 1, ttl: 3600 },
    collectAll: async () => ({
      sources: {
        ada_usd: await fetchSafe(async () => {
          const r = await fetch("https://api.kraken.com/0/public/Ticker?pair=ADAUSD",
            { headers: { "user-agent": "VolatiAI/1.0" }, signal: AbortSignal.timeout(15000) });
          if (!r.ok) throw new Error("http_" + r.status);
          const j = await r.json();
          if (Array.isArray(j?.error) && j.error.length) throw new Error("kraken_" + j.error.join(","));
          const result = j?.result || {};
          const key = Object.keys(result)[0];
          const v = parseFloat(result[key]?.c?.[0]);
          if (!Number.isFinite(v)) throw new Error("no_price");
          return v;
        }),
      },
    }),
  },
  "kraken-doge-usd": {
    config: { metric: "doge_usd", threshold_pct: 5.0, window: "1d", window_days: 1, ttl: 3600 },
    collectAll: async () => ({
      sources: {
        doge_usd: await fetchSafe(async () => {
          const r = await fetch("https://api.kraken.com/0/public/Ticker?pair=DOGEUSD",
            { headers: { "user-agent": "VolatiAI/1.0" }, signal: AbortSignal.timeout(15000) });
          if (!r.ok) throw new Error("http_" + r.status);
          const j = await r.json();
          if (Array.isArray(j?.error) && j.error.length) throw new Error("kraken_" + j.error.join(","));
          const result = j?.result || {};
          const key = Object.keys(result)[0];
          const v = parseFloat(result[key]?.c?.[0]);
          if (!Number.isFinite(v)) throw new Error("no_price");
          return v;
        }),
      },
    }),
  },
  "kraken-dot-usd": {
    config: { metric: "dot_usd", threshold_pct: 5.0, window: "1d", window_days: 1, ttl: 3600 },
    collectAll: async () => ({
      sources: {
        dot_usd: await fetchSafe(async () => {
          const r = await fetch("https://api.kraken.com/0/public/Ticker?pair=DOTUSD",
            { headers: { "user-agent": "VolatiAI/1.0" }, signal: AbortSignal.timeout(15000) });
          if (!r.ok) throw new Error("http_" + r.status);
          const j = await r.json();
          if (Array.isArray(j?.error) && j.error.length) throw new Error("kraken_" + j.error.join(","));
          const result = j?.result || {};
          const key = Object.keys(result)[0];
          const v = parseFloat(result[key]?.c?.[0]);
          if (!Number.isFinite(v)) throw new Error("no_price");
          return v;
        }),
      },
    }),
  },
  "kraken-link-usd": {
    config: { metric: "link_usd", threshold_pct: 5.0, window: "1d", window_days: 1, ttl: 3600 },
    collectAll: async () => ({
      sources: {
        link_usd: await fetchSafe(async () => {
          const r = await fetch("https://api.kraken.com/0/public/Ticker?pair=LINKUSD",
            { headers: { "user-agent": "VolatiAI/1.0" }, signal: AbortSignal.timeout(15000) });
          if (!r.ok) throw new Error("http_" + r.status);
          const j = await r.json();
          if (Array.isArray(j?.error) && j.error.length) throw new Error("kraken_" + j.error.join(","));
          const result = j?.result || {};
          const key = Object.keys(result)[0];
          const v = parseFloat(result[key]?.c?.[0]);
          if (!Number.isFinite(v)) throw new Error("no_price");
          return v;
        }),
      },
    }),
  },
  "kraken-eth-usd": {
    config: { metric: "eth_usd", threshold_pct: 5.0, window: "1d", window_days: 1, ttl: 3600 },
    collectAll: async () => ({
      sources: {
        eth_usd: await fetchSafe(async () => {
          const r = await fetch("https://api.kraken.com/0/public/Ticker?pair=ETHUSD",
            { headers: { "user-agent": "VolatiAI/1.0" }, signal: AbortSignal.timeout(15000) });
          if (!r.ok) throw new Error("http_" + r.status);
          const j = await r.json();
          if (Array.isArray(j?.error) && j.error.length) throw new Error("kraken_" + j.error.join(","));
          const result = j?.result || {};
          const key = Object.keys(result)[0];
          const v = parseFloat(result[key]?.c?.[0]);
          if (!Number.isFinite(v)) throw new Error("no_price");
          return v;
        }),
      },
    }),
  },
  "coinbase-eth-usd": {
    config: { metric: "eth_usd", threshold_pct: 5.0, window: "1d", window_days: 1, ttl: 3600 },
    collectAll: async () => ({
      sources: {
        eth_usd: await fetchSafe(async () => {
          const r = await fetch("https://api.exchange.coinbase.com/products/ETH-USD/ticker",
            { headers: { "user-agent": "VolatiAI/1.0" }, signal: AbortSignal.timeout(15000) });
          if (!r.ok) throw new Error("http_" + r.status);
          const j = await r.json();
          const v = parseFloat(j?.price);
          if (!Number.isFinite(v)) throw new Error("no_price");
          return v;
        }),
      },
    }),
  },
  "btc-exchange-spread": {
    config: { metric: "spread_pct", threshold_pct: 500, window: "1h", window_days: 1, ttl: 1800 },
    collectAll: async () => ({
      sources: {
        spread_pct: await fetchSafe(async () => {
          const [kr, cb] = await Promise.all([
            fetch("https://api.kraken.com/0/public/Ticker?pair=XBTUSD",
              { headers: { "user-agent": "VolatiAI/1.0" }, signal: AbortSignal.timeout(15000) })
              .then(r => { if (!r.ok) throw new Error("kraken_http_" + r.status); return r.json(); }),
            fetch("https://api.exchange.coinbase.com/products/BTC-USD/ticker",
              { headers: { "user-agent": "VolatiAI/1.0" }, signal: AbortSignal.timeout(15000) })
              .then(r => { if (!r.ok) throw new Error("coinbase_http_" + r.status); return r.json(); }),
          ]);
          const kResult = kr?.result || {};
          const kKey = Object.keys(kResult)[0];
          const kPrice = parseFloat(kResult[kKey]?.c?.[0]);
          const cbPrice = parseFloat(cb?.price);
          if (!Number.isFinite(kPrice) || !Number.isFinite(cbPrice)) throw new Error("missing_price");
          const mid = (kPrice + cbPrice) / 2;
          return Math.abs(kPrice - cbPrice) / mid * 100;
        }),
      },
    }),
  },


  "fred-dgs10": {
    config: { metric: "dgs10", threshold_pct: 5.0, window: "7d", window_days: 7, ttl: 86400 },
    collectAll: async () => ({
      sources: {
        dgs10: await fetchSafe(async () => {
          const r = await fetch("https://fred.stlouisfed.org/graph/fredgraph.csv?id=DGS10&cosd=2026-09-24",
            { headers: { "user-agent": "VolatiAI/1.0 (christianscode1994@gmail.com)" }, signal: AbortSignal.timeout(20000) });
          if (!r.ok) throw new Error("http_" + r.status);
          const text = await r.text();
          const lines = text.trim().split("\n").filter(l => l && !l.startsWith("observation_date") && !l.endsWith(","));
          const last = lines[lines.length - 1];
          const v = parseFloat(last.split(",").pop());
          if (!Number.isFinite(v)) throw new Error("no_value");
          return v;
        }),
      },
    }),
  },
  "fred-fedfunds": {
    config: { metric: "fedfunds", threshold_pct: 2.0, window: "30d", window_days: 30, ttl: 86400 },
    collectAll: async () => ({
      sources: {
        fedfunds: await fetchSafe(async () => {
          const r = await fetch("https://fred.stlouisfed.org/graph/fredgraph.csv?id=FEDFUNDS&cosd=2026-09-24",
            { headers: { "user-agent": "VolatiAI/1.0 (christianscode1994@gmail.com)" }, signal: AbortSignal.timeout(20000) });
          if (!r.ok) throw new Error("http_" + r.status);
          const text = await r.text();
          const lines = text.trim().split("\n").filter(l => l && !l.startsWith("observation_date") && !l.endsWith(","));
          const last = lines[lines.length - 1];
          const v = parseFloat(last.split(",").pop());
          if (!Number.isFinite(v)) throw new Error("no_value");
          return v;
        }),
      },
    }),
  },
  "eth-exchange-spread": {
    config: { metric: "spread_pct", threshold_pct: 300, window: "1h", window_days: 1, ttl: 1800 },
    collectAll: async () => ({
      sources: {
        spread_pct: await fetchSafe(async () => {
          const [kr, cb] = await Promise.all([
            fetch("https://api.kraken.com/0/public/Ticker?pair=ETHUSD",
              { headers: { "user-agent": "VolatiAI/1.0" }, signal: AbortSignal.timeout(15000) })
              .then(r => { if (!r.ok) throw new Error("kraken_http_" + r.status); return r.json(); }),
            fetch("https://api.exchange.coinbase.com/products/ETH-USD/ticker",
              { headers: { "user-agent": "VolatiAI/1.0" }, signal: AbortSignal.timeout(15000) })
              .then(r => { if (!r.ok) throw new Error("coinbase_http_" + r.status); return r.json(); }),
          ]);
          const kResult = kr?.result || {};
          const kKey = Object.keys(kResult)[0];
          const kPrice = parseFloat(kResult[kKey]?.c?.[0]);
          const cbPrice = parseFloat(cb?.price);
          if (!Number.isFinite(kPrice) || !Number.isFinite(cbPrice)) throw new Error("missing_price");
          const mid = (kPrice + cbPrice) / 2;
          return Math.abs(kPrice - cbPrice) / mid * 100;
        }),
      },
    }),
  },


  "stablecoin-total-supply": {
    config: { metric: "total_usd", threshold_pct: 2.0, window: "1d", window_days: 1, ttl: 3600 },
    collectAll: async () => ({
      sources: {
        total_usd: await fetchSafe(async () => {
          const r = await fetch("https://stablecoins.llama.fi/stablecoins?includePrices=true",
            { headers: { "user-agent": "VolatiAI/1.0" }, signal: AbortSignal.timeout(20000) });
          if (!r.ok) throw new Error("http_" + r.status);
          const j = await r.json();
          const total = (j.peggedAssets || []).reduce((s, a) => s + ((a.circulating && a.circulating.peggedUSD) || 0), 0);
          if (!Number.isFinite(total) || total <= 0) throw new Error("no_total");
          return total;
        }),
      },
    }),
  },
  "stablecoin-usdt-supply": {
    config: { metric: "usdt_usd", threshold_pct: 1.5, window: "1d", window_days: 1, ttl: 3600 },
    collectAll: async () => ({
      sources: {
        usdt_usd: await fetchSafe(async () => {
          const r = await fetch("https://stablecoins.llama.fi/stablecoins?includePrices=true",
            { headers: { "user-agent": "VolatiAI/1.0" }, signal: AbortSignal.timeout(20000) });
          if (!r.ok) throw new Error("http_" + r.status);
          const j = await r.json();
          const a = (j.peggedAssets || []).find(x => x.symbol === "USDT");
          const v = a && a.circulating && a.circulating.peggedUSD;
          if (!Number.isFinite(v) || v <= 0) throw new Error("no_usdt");
          return v;
        }),
      },
    }),
  },
  "stablecoin-usdc-supply": {
    config: { metric: "usdc_usd", threshold_pct: 1.5, window: "1d", window_days: 1, ttl: 3600 },
    collectAll: async () => ({
      sources: {
        usdc_usd: await fetchSafe(async () => {
          const r = await fetch("https://stablecoins.llama.fi/stablecoins?includePrices=true",
            { headers: { "user-agent": "VolatiAI/1.0" }, signal: AbortSignal.timeout(20000) });
          if (!r.ok) throw new Error("http_" + r.status);
          const j = await r.json();
          const a = (j.peggedAssets || []).find(x => x.symbol === "USDC");
          const v = a && a.circulating && a.circulating.peggedUSD;
          if (!Number.isFinite(v) || v <= 0) throw new Error("no_usdc");
          return v;
        }),
      },
    }),
  },
  "dex-total-volume-24h": {
    config: { metric: "total24h", threshold_pct: 20.0, window: "1d", window_days: 1, ttl: 3600 },
    collectAll: async () => ({
      sources: {
        total24h: await fetchSafe(async () => {
          const r = await fetch("https://api.llama.fi/overview/dexs?excludeTotalDataChart=true",
            { headers: { "user-agent": "VolatiAI/1.0" }, signal: AbortSignal.timeout(20000) });
          if (!r.ok) throw new Error("http_" + r.status);
          const j = await r.json();
          const v = j.total24h;
          if (!Number.isFinite(v)) throw new Error("no_total24h");
          return v;
        }),
      },
    }),
  },
  "dex-uniswap-volume": {
    config: { metric: "uniswap_24h", threshold_pct: 25.0, window: "1d", window_days: 1, ttl: 3600 },
    collectAll: async () => ({
      sources: {
        uniswap_24h: await fetchSafe(async () => {
          const r = await fetch("https://api.llama.fi/summary/dexs/uniswap",
            { headers: { "user-agent": "VolatiAI/1.0" }, signal: AbortSignal.timeout(20000) });
          if (!r.ok) throw new Error("http_" + r.status);
          const j = await r.json();
          const v = j.total24h;
          if (!Number.isFinite(v)) throw new Error("no_total24h");
          return v;
        }),
      },
    }),
  },
  "dex-ethereum-volume": {
    config: { metric: "eth_24h", threshold_pct: 25.0, window: "1d", window_days: 1, ttl: 3600 },
    collectAll: async () => ({
      sources: {
        eth_24h: await fetchSafe(async () => {
          const r = await fetch("https://api.llama.fi/overview/dexs/ethereum?excludeTotalDataChart=true",
            { headers: { "user-agent": "VolatiAI/1.0" }, signal: AbortSignal.timeout(20000) });
          if (!r.ok) throw new Error("http_" + r.status);
          const j = await r.json();
          const v = j.total24h;
          if (!Number.isFinite(v)) throw new Error("no_total24h");
          return v;
        }),
      },
    }),
  },
  "defi-total-tvl": {
    config: { metric: "tvl_usd", threshold_pct: 3.0, window: "1d", window_days: 1, ttl: 3600 },
    collectAll: async () => ({
      sources: {
        tvl_usd: await fetchSafe(async () => {
          const r = await fetch("https://api.llama.fi/v2/historicalChainTvl",
            { headers: { "user-agent": "VolatiAI/1.0" }, signal: AbortSignal.timeout(20000) });
          if (!r.ok) throw new Error("http_" + r.status);
          const j = await r.json();
          const last = Array.isArray(j) && j[j.length - 1];
          const v = last && last.tvl;
          if (!Number.isFinite(v)) throw new Error("no_tvl");
          return v;
        }),
      },
    }),
  },

  "defi-fees-aave": {
    config: { metric: "fees_24h_usd", threshold_pct: 20.0, window: "1d", window_days: 1, ttl: 3600 },
    collectAll: async () => ({
      sources: {
        fees_24h_usd: await fetchSafe(async () => {
          const r = await fetch("https://api.llama.fi/summary/fees/aave",
            { headers: { "user-agent": "VolatiAI/1.0" }, signal: AbortSignal.timeout(20000) });
          if (!r.ok) throw new Error("http_" + r.status);
          const j = await r.json();
          const v = j.total24h;
          if (typeof v !== "number") throw new Error("no_total24h: keys=" + Object.keys(j || {}).slice(0,5).join(","));
          return v;
        }),
      },
    }),
  },
  "defi-open-interest-total": {
    config: { metric: "oi_24h_usd", threshold_pct: 20.0, window: "1d", window_days: 1, ttl: 3600 },
    collectAll: async () => ({
      sources: {
        oi_24h_usd: await fetchSafe(async () => {
          const r = await fetch("https://api.llama.fi/overview/open-interest?excludeTotalDataChart=true",
            { headers: { "user-agent": "VolatiAI/1.0" }, signal: AbortSignal.timeout(20000) });
          if (!r.ok) throw new Error("http_" + r.status);
          const j = await r.json();
          const protocols = j.protocols || [];
          const total = protocols.reduce((sum, p) => sum + (p.total24h || 0), 0);
          if (!Number.isFinite(total) || total <= 0) throw new Error("no_oi: protocols=" + protocols.length);
          return total;
        }),
      },
    }),
  },
  "pypi-daily-requests": {
    config: { metric: "downloads", threshold_pct: 15.0, window: "1d", window_days: 1, ttl: 86400 },
    collectAll: async () => ({
      sources: {
        downloads: await fetchSafe(async () => {
          const r = await fetch("https://pypistats.org/api/packages/requests/overall",
            { headers: { "user-agent": "VolatiAI/1.0" }, signal: AbortSignal.timeout(20000) });
          if (!r.ok) throw new Error("http_" + r.status);
          const j = await r.json();
          const data = j.data || [];
          const withoutMirrors = data.filter(d => d.category === "without_mirrors");
          if (withoutMirrors.length === 0) throw new Error("no_data");
          const latest = withoutMirrors[withoutMirrors.length - 1];
          const v = latest.downloads;
          if (typeof v !== "number") throw new Error("no_downloads");
          return v;
        }),
      },
    }),
  },
  "usgs-streamflow-mississippi": {
    config: { metric: "discharge_cfs", threshold_pct: 25.0, window: "1d", window_days: 1, ttl: 86400 },
    collectAll: async () => ({
      sources: {
        discharge_cfs: await fetchSafe(async () => {
          const url = "https://waterservices.usgs.gov/nwis/dv/?format=json&sites=07010000&parameterCd=00060&period=P7D";
          const r = await fetch(url,
            { headers: { "user-agent": "VolatiAI/1.0" }, signal: AbortSignal.timeout(25000) });
          if (!r.ok) throw new Error("http_" + r.status);
          const j = await r.json();
          const series = j?.value?.timeSeries || [];
          if (series.length === 0) throw new Error("no_series");
          const values = series[0]?.values?.[0]?.value || [];
          if (values.length === 0) throw new Error("no_values");
          const latest = values[values.length - 1];
          const v = parseFloat(latest.value);
          if (!Number.isFinite(v)) throw new Error("no_discharge");
          return v;
        }),
      },
    }),
  },
  "ossf-scorecard-linux": {
    config: { metric: "score", threshold_pct: 5.0, window: "7d", window_days: 7, ttl: 604800 },
    collectAll: async () => ({
      sources: {
        score: await fetchSafe(async () => {
          const r = await fetch("https://api.securityscorecards.dev/projects/github.com/torvalds/linux",
            { headers: { "user-agent": "VolatiAI/1.0" }, signal: AbortSignal.timeout(20000) });
          if (!r.ok) throw new Error("http_" + r.status);
          const j = await r.json();
          const v = j.score;
          if (typeof v !== "number") throw new Error("no_score");
          return v;
        }),
      },
    }),
  },
  "ecosyste-ms-react": {
    config: { metric: "dependent_count", threshold_pct: 2.0, window: "7d", window_days: 7, ttl: 604800 },
    collectAll: async () => ({
      sources: {
        dependent_count: await fetchSafe(async () => {
          const r = await fetch("https://packages.ecosyste.ms/api/v1/registries/npmjs.org/packages/react",
            { headers: { "user-agent": "VolatiAI/1.0" }, signal: AbortSignal.timeout(20000) });
          if (!r.ok) throw new Error("http_" + r.status);
          const j = await r.json();
          const v = j.dependent_packages_count;
          if (typeof v !== "number") throw new Error("no_count");
          return v;
        }),
      },
    }),
  },
  "open-digger-openrank-vscode": {
    config: { metric: "openrank", threshold_pct: 5.0, window: "30d", window_days: 30, ttl: 86400 },
    collectAll: async () => ({
      sources: {
        openrank: await fetchSafe(async () => {
          const r = await fetch("https://oss.open-digger.cn/github/microsoft/vscode/openrank.json",
            { headers: { "user-agent": "VolatiAI/1.0" }, signal: AbortSignal.timeout(20000) });
          if (!r.ok) throw new Error("http_" + r.status);
          const j = await r.json();
          const months = Object.keys(j).filter(k => /^\d{4}-\d{2}$/.test(k)).sort();
          const latest = months[months.length - 1];
          const v = j[latest];
          if (typeof v !== "number") throw new Error("no_openrank");
          return v;
        }),
      },
    }),
  },
  "hackernews-top-scores": {
    config: { metric: "top10_score_sum", threshold_pct: 15.0, window: "1d", window_days: 1, ttl: 3600 },
    collectAll: async () => ({
      sources: {
        top10_score_sum: await fetchSafe(async () => {
          const r = await fetch("https://hacker-news.firebaseio.com/v0/topstories.json",
            { headers: { "user-agent": "VolatiAI/1.0" }, signal: AbortSignal.timeout(15000) });
          if (!r.ok) throw new Error("http_" + r.status);
          const ids = (await r.json()).slice(0, 10);
          const scores = await Promise.all(ids.map(async (id) => {
            const ir = await fetch("https://hacker-news.firebaseio.com/v0/item/" + id + ".json",
              { headers: { "user-agent": "VolatiAI/1.0" }, signal: AbortSignal.timeout(10000) });
            if (!ir.ok) return 0;
            const item = await ir.json();
            return item.score || 0;
          }));
          return scores.reduce((a, b) => a + b, 0);
        }),
      },
    }),
  },

  "osv-lodash-vuln-count": {
    config: { metric: "vuln_count", threshold_pct: 10.0, window: "7d", window_days: 7, ttl: 86400 },
    collectAll: async () => ({
      sources: {
        vuln_count: await fetchSafe(async () => {
          const r = await fetch("https://api.osv.dev/v1/query", {
            method: "POST",
            headers: { "content-type": "application/json", "user-agent": "VolatiAI/1.0" },
            body: JSON.stringify({ package: { name: "lodash", ecosystem: "npm" } }),
            signal: AbortSignal.timeout(20000)
          });
          if (!r.ok) throw new Error("http_" + r.status);
          const j = await r.json();
          const v = (j.vulns || []).length;
          if (typeof v !== "number") throw new Error("no_vulns");
          return v;
        }),
      },
    }),
  },
  "cisa-kev-total": {
    config: { metric: "kev_count", threshold_pct: 2.0, window: "7d", window_days: 7, ttl: 86400 },
    collectAll: async () => ({
      sources: {
        kev_count: await fetchSafe(async () => {
          const r = await fetch("https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json",
            { headers: { "user-agent": "VolatiAI/1.0" }, signal: AbortSignal.timeout(30000) });
          if (!r.ok) throw new Error("http_" + r.status);
          const j = await r.json();
          const v = (j.vulnerabilities || []).length;
          if (typeof v !== "number") throw new Error("no_count");
          return v;
        }),
      },
    }),
  },
  "epss-log4shell": {
    config: { metric: "epss", threshold_pct: 20.0, window: "1d", window_days: 1, ttl: 3600 },
    collectAll: async () => ({
      sources: {
        epss: await fetchSafe(async () => {
          const r = await fetch("https://api.first.org/data/v1/epss?cve=CVE-2021-44228",
            { headers: { "user-agent": "VolatiAI/1.0" }, signal: AbortSignal.timeout(15000) });
          if (!r.ok) throw new Error("http_" + r.status);
          const j = await r.json();
          const v = parseFloat(j.data?.[0]?.epss);
          if (!Number.isFinite(v)) throw new Error("no_epss");
          return v;
        }),
      },
    }),
  },
  "deps-dev-react-versions": {
    config: { metric: "version_count", threshold_pct: 5.0, window: "7d", window_days: 7, ttl: 86400 },
    collectAll: async () => ({
      sources: {
        version_count: await fetchSafe(async () => {
          const r = await fetch("https://api.deps.dev/v3/systems/npm/packages/react",
            { headers: { "user-agent": "VolatiAI/1.0" }, signal: AbortSignal.timeout(20000) });
          if (!r.ok) throw new Error("http_" + r.status);
          const j = await r.json();
          const v = (j.versions || []).length;
          if (typeof v !== "number") throw new Error("no_versions");
          return v;
        }),
      },
    }),
  },
  "clearlydefined-react-license": {
    config: { metric: "license_score", threshold_pct: 5.0, window: "7d", window_days: 7, ttl: 604800 },
    collectAll: async () => ({
      sources: {
        license_score: await fetchSafe(async () => {
          const r = await fetch("https://api.clearlydefined.io/definitions/npm/npmjs/-/react/18.2.0",
            { headers: { "user-agent": "VolatiAI/1.0" }, signal: AbortSignal.timeout(20000) });
          if (!r.ok) throw new Error("http_" + r.status);
          const j = await r.json();
          const v = j?.licensed?.score?.total;
          if (typeof v !== "number") throw new Error("no_score");
          return v;
        }),
      },
    }),
  },
  "hn-tech-sentiment": {
    config: { metric: "avg_score", threshold_pct: 15.0, window: "1d", window_days: 1, ttl: 3600 },
    collectAll: async () => ({
      sources: {
        avg_score: await fetchSafe(async () => {
          const r = await fetch("https://hn.algolia.com/api/v1/search?tags=story&hitsPerPage=50",
            { headers: { "user-agent": "VolatiAI/1.0" }, signal: AbortSignal.timeout(20000) });
          if (!r.ok) throw new Error("http_" + r.status);
          const j = await r.json();
          const scores = (j.hits || []).map(h => h.points).filter(n => typeof n === "number");
          if (scores.length === 0) throw new Error("no_scores");
          const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
          if (!Number.isFinite(avg)) throw new Error("bad_avg");
          return avg;
        }),
      },
    }),
  },
  "spaceflight-news-count": {
    config: { metric: "article_count", threshold_pct: 30.0, window: "1d", window_days: 1, ttl: 3600 },
    collectAll: async () => ({
      sources: {
        article_count: await fetchSafe(async () => {
          const r = await fetch("https://api.spaceflightnewsapi.net/v4/articles?limit=100&ordering=-published_at",
            { headers: { "user-agent": "VolatiAI/1.0" }, signal: AbortSignal.timeout(20000) });
          if (!r.ok) throw new Error("http_" + r.status);
          const j = await r.json();
          const v = j.count;
          if (typeof v !== "number") throw new Error("no_count");
          return v;
        }),
      },
    }),
  },
  "pypi-downloads-requests": {
    config: { metric: "last_day", threshold_pct: 10.0, window: "1d", window_days: 1, ttl: 86400 },
    collectAll: async () => ({
      sources: {
        last_day: await fetchSafe(async () => {
          const r = await fetch("https://pypistats.org/api/packages/requests/recent",
            { headers: { "user-agent": "VolatiAI/1.0" }, signal: AbortSignal.timeout(20000) });
          if (!r.ok) throw new Error("http_" + r.status);
          const j = await r.json();
          const v = j?.data?.last_day;
          if (typeof v !== "number") throw new Error("no_last_day");
          return v;
        }),
      },
    }),
  },
  "npm-downloads-react": {
    config: { metric: "downloads", threshold_pct: 10.0, window: "1d", window_days: 1, ttl: 86400 },
    collectAll: async () => ({
      sources: {
        downloads: await fetchSafe(async () => {
          const r = await fetch("https://api.npmjs.org/downloads/point/last-day/react",
            { headers: { "user-agent": "VolatiAI/1.0" }, signal: AbortSignal.timeout(20000) });
          if (!r.ok) throw new Error("http_" + r.status);
          const j = await r.json();
          const v = j.downloads;
          if (typeof v !== "number") throw new Error("no_downloads");
          return v;
        }),
      },
    }),
  },
  "librariesio-sourcerank-react": {
    config: { metric: "sourcerank", threshold_pct: 5.0, window: "7d", window_days: 7, ttl: 86400 },
    collectAll: async () => ({
      sources: {
        sourcerank: await fetchSafe(async () => {
          const r = await fetch("https://libraries.io/api/npm/react",
            { headers: { "user-agent": "VolatiAI/1.0" }, signal: AbortSignal.timeout(20000) });
          if (!r.ok) throw new Error("http_" + r.status);
          const j = await r.json();
          const v = j?.rank;
          if (typeof v !== "number") throw new Error("no_rank: keys=" + Object.keys(j || {}).slice(0,5).join(","));
          return v;
        }),
      },
    }),
  },
  "usgs-earthquake-count": {
    config: { metric: "m45_count", threshold_pct: 30.0, window: "1d", window_days: 1, ttl: 3600 },
    collectAll: async () => ({
      sources: {
        m45_count: await fetchSafe(async () => {
          const r = await fetch("https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/4.5_day.geojson",
            { headers: { "user-agent": "VolatiAI/1.0" }, signal: AbortSignal.timeout(25000) });
          if (!r.ok) throw new Error("http_" + r.status);
          const j = await r.json();
          const v = j?.metadata?.count;
          if (typeof v !== "number") throw new Error("no_count");
          return v;
        }),
      },
    }),
  },
  "eurostat-eu-unemployment": {
    config: { metric: "unemployment_pct", threshold_pct: 5.0, window: "30d", window_days: 30, ttl: 86400 },
    collectAll: async () => ({
      sources: {
        unemployment_pct: await fetchSafe(async () => {
          const url = "https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/une_rt_m?format=JSON&lang=EN&geo=EU27_2020&s_adj=SA&unit=PC_ACT&age=TOTAL&sex=T&sinceTimePeriod=2024-01";
          const r = await fetch(url,
            { headers: { "user-agent": "VolatiAI/1.0", "accept": "application/json" }, signal: AbortSignal.timeout(25000) });
          if (!r.ok) throw new Error("http_" + r.status);
          const j = await r.json();
          const val = j?.value;
          if (Array.isArray(val) && val.length > 0) return val[val.length - 1];
          if (val && typeof val === "object") {
            const keys = Object.keys(val).map(k => parseInt(k, 10)).sort((a, b) => a - b);
            return val[String(keys[keys.length - 1])];
          }
          throw new Error("no_value: keys=" + Object.keys(j || {}).slice(0, 5).join(","));
        }),
      },
    }),
  },

  "uk-carbon-intensity": {
    config: { metric: "gco2_kwh", threshold_pct: 15.0, window: "1d", window_days: 1, ttl: 3600 },
    collectAll: async () => ({
      sources: {
        gco2_kwh: await fetchSafe(async () => {
          const r = await fetch("https://api.carbonintensity.org.uk/intensity",
            { headers: { "user-agent": "VolatiAI/1.0", "accept": "application/json" }, signal: AbortSignal.timeout(20000) });
          if (!r.ok) throw new Error("http_" + r.status);
          const j = await r.json();
          const v = j?.data?.[0]?.intensity?.actual;
          if (typeof v !== "number") throw new Error("no_intensity: keys=" + Object.keys(j || {}).slice(0,3).join(","));
          return v;
        }),
      },
    }),
  },
  "usgs-elevated-volcanoes": {
    config: { metric: "elevated_count", threshold_pct: 20.0, window: "7d", window_days: 7, ttl: 86400 },
    collectAll: async () => ({
      sources: {
        elevated_count: await fetchSafe(async () => {
          const r = await fetch("https://volcanoes.usgs.gov/hans-public/api/volcano/getElevatedVolcanoes",
            { headers: { "user-agent": "VolatiAI/1.0", "accept": "application/json" }, signal: AbortSignal.timeout(20000) });
          if (!r.ok) throw new Error("http_" + r.status);
          const j = await r.json();
          if (Array.isArray(j)) return j.length;
          if (typeof j?.count === "number") return j.count;
          if (Array.isArray(j?.volcanoes)) return j.volcanoes.length;
          throw new Error("no_count: type=" + typeof j);
        }),
      },
    }),
  },
  "pocketworld-space-weather": {
    config: { metric: "event_count", threshold_pct: 50.0, window: "1d", window_days: 1, ttl: 3600 },
    collectAll: async () => ({
      sources: {
        event_count: await fetchSafe(async () => {
          const r = await fetch("https://pocketworld.org/api/space-weather",
            { headers: { "user-agent": "VolatiAI/1.0", "accept": "application/json" }, signal: AbortSignal.timeout(20000) });
          if (!r.ok) throw new Error("http_" + r.status);
          const j = await r.json();
          if (typeof j.count === "number") return j.count;
          if (Array.isArray(j.events)) return j.events.length;
          throw new Error("no_count: keys=" + Object.keys(j).slice(0,5).join(","));
        }),
      },
    }),
  },
  "feodo-c2-count": {
    config: { metric: "c2_count", threshold_pct: 5.0, window: "1d", window_days: 1, ttl: 86400 },
    collectAll: async () => ({
      sources: {
        c2_count: await fetchSafe(async () => {
          const r = await fetch("https://feodotracker.abuse.ch/downloads/ipblocklist.json",
            { headers: { "user-agent": "VolatiAI/1.0" }, signal: AbortSignal.timeout(20000) });
          if (!r.ok) throw new Error("http_" + r.status);
          const j = await r.json();
          if (!Array.isArray(j)) throw new Error("not_array");
          return j.length;
        }),
      },
    }),
  },

  "drug-approvals": {
    config: { metric: "latest_approval_id", threshold_pct: 1.0, window: "1d", window_days: 1, ttl: 3600 },
    collectAll: async () => ({
      sources: {
        latest_approval_id: await fetchSafe(async () => {
          const week_ago = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10).replace(/-/g, "");
          const today = new Date().toISOString().slice(0, 10).replace(/-/g, "");
          const url = `https://api.fda.gov/drug/drugsfda.json?search=submissions.submission_status_date:[${week_ago}+TO+${today}]+AND+submissions.submission_status:AP&limit=1&sort=submissions.submission_status_date:desc`;
          const r = await fetch(url,
            { headers: { "user-agent": "VolatiAI/1.0" }, signal: AbortSignal.timeout(25000) });
          if (!r.ok) throw new Error("http_" + r.status);
          const j = await r.json();
          const results = j?.results || [];
          if (results.length === 0) return "none";
          const latest = results[0];
          const id = `${latest.application_number || "?"}:${(latest.sponsor_name || "").slice(0, 40)}`;
          return id;
        }),
      },
    }),
  },

  "whiskyhunter-lot-count": {
    config: { metric: "all_auctions_lots_count", threshold_pct: 5.0, window: "7d", window_days: 7, ttl: 86400 },
    collectAll: async () => ({
      sources: {
        all_auctions_lots_count: await fetchSafe(async () => {
          const r = await fetch("https://whiskyhunter.net/api/auctions_data/?format=json",
            { headers: { "user-agent": "VolatiAI/1.0", "accept": "application/json" }, signal: AbortSignal.timeout(20000) });
          if (!r.ok) throw new Error("http_" + r.status);
          const j = await r.json();
          if (!Array.isArray(j) || j.length === 0) throw new Error("empty_array");
          const v = j[0]?.all_auctions_lots_count;
          if (typeof v !== "number") throw new Error("no_lots_count");
          return v;
        }),
      },
    }),
  },
  "shopify-allbirds-product-count": {
    config: { metric: "product_count", threshold_pct: 2.0, window: "7d", window_days: 7, ttl: 86400 },
    collectAll: async () => ({
      sources: {
        product_count: await fetchSafe(async () => {
          const r = await fetch("https://allbirds.com/products.json?limit=250",
            { headers: { "user-agent": "VolatiAI/1.0", "accept": "application/json" }, signal: AbortSignal.timeout(20000) });
          if (!r.ok) throw new Error("http_" + r.status);
          const j = await r.json();
          const products = j?.products || [];
          if (!Array.isArray(products)) throw new Error("no_products_array");
          return products.length;
        }),
      },
    }),
  },
  "cheapshark-deal-count": {
    config: { metric: "deal_count", threshold_pct: 10.0, window: "1d", window_days: 1, ttl: 3600 },
    collectAll: async () => ({
      sources: {
        deal_count: await fetchSafe(async () => {
          const r = await fetch("https://www.cheapshark.com/api/1.0/deals?storeID=1",
            { headers: { "user-agent": "VolatiAI/1.0", "accept": "application/json" }, signal: AbortSignal.timeout(20000) });
          if (!r.ok) throw new Error("http_" + r.status);
          const j = await r.json();
          if (!Array.isArray(j)) throw new Error("not_array");
          return j.length;
        }),
      },
    }),
  },

  "espn-nfl-score-count": {
    config: { metric: "game_count", threshold_pct: 50.0, window: "1d", window_days: 1, ttl: 3600 },
    collectAll: async () => ({
      sources: {
        game_count: await fetchSafe(async () => {
          const r = await fetch("https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard",
            { headers: { "user-agent": "VolatiAI/1.0" }, signal: AbortSignal.timeout(20000) });
          if (!r.ok) throw new Error("http_" + r.status);
          const j = await r.json();
          const events = j?.events || [];
          return events.length;
        }),
      },
    }),
  },
  "espn-nba-score-count": {
    config: { metric: "game_count", threshold_pct: 50.0, window: "1d", window_days: 1, ttl: 3600 },
    collectAll: async () => ({
      sources: {
        game_count: await fetchSafe(async () => {
          const r = await fetch("https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard",
            { headers: { "user-agent": "VolatiAI/1.0" }, signal: AbortSignal.timeout(20000) });
          if (!r.ok) throw new Error("http_" + r.status);
          const j = await r.json();
          const events = j?.events || [];
          return events.length;
        }),
      },
    }),
  },
  "open-meteo-berlin-temp": {
    config: { metric: "temp_c", threshold_pct: 20.0, window: "1d", window_days: 1, ttl: 3600 },
    collectAll: async () => ({
      sources: {
        temp_c: await fetchSafe(async () => {
          const r = await fetch("https://api.open-meteo.com/v1/forecast?latitude=52.52&longitude=13.41&current=temperature_2m",
            { headers: { "user-agent": "VolatiAI/1.0" }, signal: AbortSignal.timeout(15000) });
          if (!r.ok) throw new Error("http_" + r.status);
          const j = await r.json();
          const v = j?.current?.temperature_2m;
          if (typeof v !== "number") throw new Error("no_temp");
          return v;
        }),
      },
    }),
  },
  "steam-csgo-players": {
    config: { metric: "player_count", threshold_pct: 10.0, window: "1d", window_days: 1, ttl: 1800 },
    collectAll: async () => ({
      sources: {
        player_count: await fetchSafe(async () => {
          const r = await fetch("https://api.steampowered.com/ISteamUserStats/GetNumberOfCurrentPlayers/v1/?appid=730",
            { headers: { "user-agent": "VolatiAI/1.0" }, signal: AbortSignal.timeout(15000) });
          if (!r.ok) throw new Error("http_" + r.status);
          const j = await r.json();
          const v = j?.response?.player_count;
          if (typeof v !== "number") throw new Error("no_player_count");
          return v;
        }),
      },
    }),
  },
  "steam-dota2-players": {
    config: { metric: "player_count", threshold_pct: 10.0, window: "1d", window_days: 1, ttl: 1800 },
    collectAll: async () => ({
      sources: {
        player_count: await fetchSafe(async () => {
          const r = await fetch("https://api.steampowered.com/ISteamUserStats/GetNumberOfCurrentPlayers/v1/?appid=570",
            { headers: { "user-agent": "VolatiAI/1.0" }, signal: AbortSignal.timeout(15000) });
          if (!r.ok) throw new Error("http_" + r.status);
          const j = await r.json();
          const v = j?.response?.player_count;
          if (typeof v !== "number") throw new Error("no_player_count");
          return v;
        }),
      },
    }),
  },
  "geocables-incidents": {
    config: { metric: "incident_count", threshold_pct: 20.0, window: "1d", window_days: 1, ttl: 3600 },
    collectAll: async () => ({
      sources: {
        incident_count: await fetchSafe(async () => {
          const r = await fetch("https://geocables.com/api/v1/incidents",
            { headers: { "user-agent": "VolatiAI/1.0", "accept": "application/json" }, signal: AbortSignal.timeout(20000) });
          if (!r.ok) throw new Error("http_" + r.status);
          const j = await r.json();
          const data = j?.data || [];
          if (!Array.isArray(data)) throw new Error("no_data_array");
          return data.length;
        }),
      },
    }),
  },
  "nvd-new-cves-count": {
    config: { metric: "new_cves", threshold_pct: 5.0, window: "1d", window_days: 1, ttl: 86400 },
    collectAll: async () => ({
      sources: {
        new_cves: await fetchSafe(async () => {
          const since = new Date(Date.now() - 86400000).toISOString().replace(/\.\d{3}Z$/, '.000');
          const r = await fetch(`https://services.nvd.nist.gov/rest/json/cves/2.0?pubStartDate=${since}&pubEndDate=${new Date().toISOString().replace(/\.\d{3}Z$/, '.000')}`,
            { headers: { "user-agent": "VolatiAI/1.0" }, signal: AbortSignal.timeout(25000) });
          if (!r.ok) throw new Error("http_" + r.status);
          const j = await r.json();
          const v = j?.totalResults;
          if (typeof v !== "number") throw new Error("no_totalResults");
          return v;
        }),
      },
    }),
  },
  "github-recent-commits": {
    config: { metric: "commit_count", threshold_pct: 5.0, window: "1d", window_days: 1, ttl: 86400 },
    collectAll: async () => ({
      sources: {
        commit_count: await fetchSafe(async () => {
          const since = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
          const r = await fetch(`https://api.github.com/search/commits?q=committer-date:>=${since}`,
            { headers: { "user-agent": "VolatiAI/1.0", "accept": "application/vnd.github.cloak-preview" }, signal: AbortSignal.timeout(20000) });
          if (!r.ok) throw new Error("http_" + r.status);
          const j = await r.json();
          const v = j?.total_count;
          if (typeof v !== "number") throw new Error("no_total_count");
          return v;
        }),
      },
    }),
  },
  "open-meteo-pm25": {
    config: { metric: "pm25", threshold_pct: 20.0, window: "1d", window_days: 1, ttl: 86400 },
    collectAll: async () => ({
      sources: {
        pm25: await fetchSafe(async () => {
          const r = await fetch("https://air-quality-api.open-meteo.com/v1/air-quality?latitude=52.52&longitude=13.41&current=pm2_5");
          if (!r.ok) throw new Error("http_" + r.status);
          const j = await r.json();
          const v = j?.current?.pm2_5;
          if (typeof v !== "number") throw new Error("no_pm25");
          return v;
        }),
      },
    }),
  },
  "usgs-significant-quakes": {
    config: { metric: "quakes", threshold_pct: 50.0, window: "1d", window_days: 1, ttl: 86400 },
    collectAll: async () => ({
      sources: {
        quakes: await fetchSafe(async () => {
          const r = await fetch("https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/significant_day.geojson");
          if (!r.ok) throw new Error("http_" + r.status);
          const j = await r.json();
          return (j.features || []).length;
        }),
      },
    }),
  },
  "open-notify-astronauts": {
    config: { metric: "people", threshold_pct: 10.0, window: "1d", window_days: 1, ttl: 86400 },
    collectAll: async () => ({
      sources: {
        people: await fetchSafe(async () => {
          const r = await fetch("http://api.open-notify.org/astros.json");
          if (!r.ok) throw new Error("http_" + r.status);
          const j = await r.json();
          if (typeof j.number !== "number") throw new Error("no_number");
          return j.number;
        }),
      },
    }),
  },
  "tvmaze-us-schedule-count": {
    config: { metric: "episode_count", threshold_pct: 10.0, window: "1d", window_days: 1, ttl: 86400 },
    collectAll: async () => ({
      sources: {
        episode_count: await fetchSafe(async () => {
          const r = await fetch("https://api.tvmaze.com/schedule?country=US");
          if (!r.ok) throw new Error("http_" + r.status);
          const j = await r.json();
          if (!Array.isArray(j)) throw new Error("no_schedule");
          return j.length;
        }),
      },
    }),
  },
  "dailymotion-video-views": {
    config: { metric: "views", threshold_pct: 5.0, window: "1d", window_days: 1, ttl: 86400 },
    collectAll: async () => ({
      sources: {
        views: await fetchSafe(async () => {
          const r = await fetch("https://api.dailymotion.com/videos?search=technology&fields=views_total&limit=1");
          if (!r.ok) throw new Error("http_" + r.status);
          const j = await r.json();
          const v = j?.list?.[0]?.views_total;
          if (typeof v !== "number") throw new Error("no_views");
          return v;
        }),
      },
    }),
  },
  "iptv-org-channel-count": {
    config: { metric: "channel_count", threshold_pct: 1.0, window: "1d", window_days: 1, ttl: 86400 },
    collectAll: async () => ({
      sources: {
        channel_count: await fetchSafe(async () => {
          const r = await fetch("https://iptv-org.github.io/iptv/index.m3u");
          if (!r.ok) throw new Error("http_" + r.status);
          const text = await r.text();
          return (text.match(/^#EXTINF/gm) || []).length;
        }),
      },
    }),
  },
  "whitebit-btc-usdt": {
    config: { metric: "usd", threshold_pct: 3.0, window: "1h", window_days: 1, ttl: 900 },
    collectAll: async () => ({
      sources: {
        usd: await fetchSafe(async () => {
          const r = await fetch("https://whitebit.com/api/v1/public/ticker?market=BTC_USDT");
          if (!r.ok) throw new Error("http_" + r.status);
          const j = await r.json();
          if (!j.success || !j.result) throw new Error("bad_shape");
          const v = Number(j.result.last);
          if (!Number.isFinite(v) || v <= 0) throw new Error("no_last");
          return v;
        }),
      },
    }),
  },
  "usgs-significant-hour": {
    config: { metric: "quakes", threshold_pct: 100.0, window: "1h", window_days: 1, ttl: 900 },
    collectAll: async () => ({
      sources: {
        quakes: await fetchSafe(async () => {
          const r = await fetch("https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/significant_hour.geojson");
          if (!r.ok) throw new Error("http_" + r.status);
          const j = await r.json();
          if (!Array.isArray(j.features)) throw new Error("no_features");
          return j.features.length;
        }),
      },
    }),
  },
  "frankfurter-eur-usd": {
    config: { metric: "rate", threshold_pct: 1.0, window: "1d", window_days: 1, ttl: 3600 },
    collectAll: async () => ({ sources: { rate: await fetchSafe(async () => {
      const r = await fetch("https://api.frankfurter.dev/v1/latest?base=USD&symbols=EUR");
      if (!r.ok) throw new Error("http_" + r.status);
      const j = await r.json();
      const v = Number(j?.rates?.EUR);
      if (!Number.isFinite(v) || v <= 0) throw new Error("no_rate");
      return v;
    }) } }),
  },
  "openlibrary-ml-books": {
    config: { metric: "num_found", threshold_pct: 1.0, window: "1d", window_days: 1, ttl: 86400 },
    collectAll: async () => ({ sources: { num_found: await fetchSafe(async () => {
      const r = await fetch("https://openlibrary.org/search.json?q=machine+learning&limit=1");
      if (!r.ok) throw new Error("http_" + r.status);
      const j = await r.json();
      const v = Number(j?.numFound);
      if (!Number.isFinite(v) || v < 0) throw new Error("no_numFound");
      return v;
    }) } }),
  },
  "npm-scraper-packages": {
    config: { metric: "total", threshold_pct: 1.0, window: "1d", window_days: 1, ttl: 86400 },
    collectAll: async () => ({ sources: { total: await fetchSafe(async () => {
      const r = await fetch("https://registry.npmjs.org/-/v1/search?text=scraper&size=1");
      if (!r.ok) throw new Error("http_" + r.status);
      const j = await r.json();
      const v = Number(j?.total);
      if (!Number.isFinite(v) || v < 0) throw new Error("no_total");
      return v;
    }) } }),
  },
  "sunrise-berlin-daylength": {
    config: { metric: "seconds", threshold_pct: 5.0, window: "1d", window_days: 1, ttl: 86400 },
    collectAll: async () => ({ sources: { seconds: await fetchSafe(async () => {
      const r = await fetch("https://api.sunrise-sunset.org/json?lat=52.52&lng=13.41&formatted=0");
      if (!r.ok) throw new Error("http_" + r.status);
      const j = await r.json();
      const v = Number(j?.results?.day_length);
      if (!Number.isFinite(v) || v <= 0) throw new Error("no_daylength");
      return v;
    }) } }),
  },
  "worldbank-us-gdp": {
    config: { metric: "usd", threshold_pct: 0.5, window: "365d", window_days: 365, ttl: 604800 },
    collectAll: async () => ({ sources: { usd: await fetchSafe(async () => {
      const r = await fetch("https://api.worldbank.org/v2/country/US/indicator/NY.GDP.MKTP.CD?format=json&per_page=10",
        { headers: { "user-agent": "VolatiAI/1.0" }, signal: AbortSignal.timeout(15000) });
      if (!r.ok) throw new Error("http_" + r.status);
      const j = await r.json();
      const rows = Array.isArray(j?.[1]) ? j[1] : [];
      const row = rows.find(x => x && typeof x.value === "number");
      if (!row) throw new Error("no_gdp");
      return Number(row.value);
    }) } }),
  },
  "crossref-deep-learning": {
    config: { metric: "total", threshold_pct: 1.0, window: "1d", window_days: 1, ttl: 86400 },
    collectAll: async () => ({ sources: { total: await fetchSafe(async () => {
      const r = await fetch("https://api.crossref.org/works?query=deep+learning&rows=1");
      if (!r.ok) throw new Error("http_" + r.status);
      const j = await r.json();
      const v = Number(j?.["message"]?.["total-results"]);
      if (!Number.isFinite(v) || v < 0) throw new Error("no_total");
      return v;
    }) } }),
  },
  "pubmed-covid-papers": {
    config: { metric: "count", threshold_pct: 1.0, window: "1d", window_days: 1, ttl: 86400 },
    collectAll: async () => ({ sources: { count: await fetchSafe(async () => {
      const r = await fetch("https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=pubmed&term=covid&retmode=json&retmax=1");
      if (!r.ok) throw new Error("http_" + r.status);
      const j = await r.json();
      const v = Number(j?.esearchresult?.count);
      if (!Number.isFinite(v) || v < 0) throw new Error("no_count");
      return v;
    }) } }),
  },
  "pypistats-fastapi-downloads": {
    config: { metric: "last_day", threshold_pct: 5.0, window: "1d", window_days: 1, ttl: 86400 },
    collectAll: async () => ({ sources: { last_day: await fetchSafe(async () => {
      const r = await fetch("https://pypistats.org/api/packages/fastapi/recent");
      if (!r.ok) throw new Error("http_" + r.status);
      const j = await r.json();
      const v = Number(j?.data?.last_day);
      if (!Number.isFinite(v) || v < 0) throw new Error("no_last_day");
      return v;
    }) } }),
  },
  "openverse-cat-images": {
    config: { metric: "result_count", threshold_pct: 2.0, window: "1d", window_days: 1, ttl: 86400 },
    collectAll: async () => ({ sources: { result_count: await fetchSafe(async () => {
      const r = await fetch("https://api.openverse.org/v1/images/?q=cat&page_size=1");
      if (!r.ok) throw new Error("http_" + r.status);
      const j = await r.json();
      const v = Number(j?.result_count);
      if (!Number.isFinite(v) || v < 0) throw new Error("no_result_count");
      return v;
    }) } }),
  },
  "zippopotam-10001-places": {
    config: { metric: "places", threshold_pct: 1.0, window: "1d", window_days: 1, ttl: 86400 },
    collectAll: async () => ({ sources: { places: await fetchSafe(async () => {
      const r = await fetch("https://api.zippopotam.us/us/10001");
      if (!r.ok) throw new Error("http_" + r.status);
      const j = await r.json();
      if (!Array.isArray(j?.places)) throw new Error("no_places");
      return j.places.length;
    }) } }),
  },
  "7timer-berlin-temp": {
    config: { metric: "temp2m", threshold_pct: 10.0, window: "1d", window_days: 1, ttl: 3600 },
    collectAll: async () => ({ sources: { temp2m: await fetchSafe(async () => {
      const r = await fetch("https://www.7timer.info/bin/api.pl?lon=13.41&lat=52.52&product=civil&output=json");
      if (!r.ok) throw new Error("http_" + r.status);
      const j = await r.json();
      const v = Number(j?.dataseries?.[0]?.temp2m);
      if (!Number.isFinite(v)) throw new Error("no_temp");
      return v;
    }) } }),
  },
  "pypi-requests-releases": {
    config: { metric: "releases", threshold_pct: 1.0, window: "1d", window_days: 1, ttl: 86400 },
    collectAll: async () => ({ sources: { releases: await fetchSafe(async () => {
      const r = await fetch("https://pypi.org/pypi/requests/json");
      if (!r.ok) throw new Error("http_" + r.status);
      const j = await r.json();
      if (!j?.releases || typeof j.releases !== "object") throw new Error("no_releases");
      return Object.keys(j.releases).length;
    }) } }),
  },
  "randomuser-heartbeat": {
    config: { metric: "results", threshold_pct: 100.0, window: "1d", window_days: 1, ttl: 3600 },
    collectAll: async () => ({ sources: { results: await fetchSafe(async () => {
      const r = await fetch("https://randomuser.me/api/?results=3");
      if (!r.ok) throw new Error("http_" + r.status);
      const j = await r.json();
      if (!Array.isArray(j?.results)) throw new Error("no_results");
      return j.results.length;
    }) } }),
  },
  "coinmarketcap-btc-usd": {
    config: { metric: "usd", threshold_pct: 5.0, window: "1d", window_days: 1, ttl: 900 },
    collectAll: async () => ({ sources: { usd: await fetchSafe(async () => {
      const r = await fetch("https://pro-api.coinmarketcap.com/public-api/v1/simple/price?ids=1&convert=USD");
      if (!r.ok) throw new Error("http_" + r.status);
      const j = await r.json();
      const v = Number(j?.data?.[0]?.price);
      if (!Number.isFinite(v) || v <= 0) throw new Error("no_price");
      return v;
    }) } }),
  },
  "allratestoday-usd-eur": {
    config: { metric: "rate", threshold_pct: 2.0, window: "1d", window_days: 1, ttl: 3600 },
    collectAll: async () => ({ sources: { rate: await fetchSafe(async () => {
      const r = await fetch("https://allratestoday.com/api/open/latest/USD");
      if (!r.ok) throw new Error("http_" + r.status);
      const j = await r.json();
      const v = Number(j?.rates?.EUR ?? j?.EUR);
      if (!Number.isFinite(v) || v <= 0) throw new Error("no_rate");
      return v;
    }) } }),
  },
  "github-torvalds-followers": {
    config: { metric: "count", threshold_pct: 1.0, window: "1d", window_days: 1, ttl: 86400 },
    collectAll: async () => ({ sources: { count: await fetchSafe(async () => {
      const r = await fetch("https://api.github.com/users/torvalds", { headers: { "user-agent": "VolatiAI/1.0" } });
      if (!r.ok) throw new Error("http_" + r.status);
      const j = await r.json();
      const v = Number(j?.followers);
      if (!Number.isFinite(v) || v < 0) throw new Error("no_followers");
      return v;
    }) } }),
  },
  "shodan-google-dns-ports": {
    config: { metric: "count", threshold_pct: 10.0, window: "1d", window_days: 1, ttl: 86400 },
    collectAll: async () => ({ sources: { count: await fetchSafe(async () => {
      const r = await fetch("https://internetdb.shodan.io/8.8.8.8");
      if (!r.ok) throw new Error("http_" + r.status);
      const j = await r.json();
      if (!Array.isArray(j?.ports)) throw new Error("no_ports");
      return j.ports.length;
    }) } }),
  },
  "wikipedia-bitcoin-extract-len": {
    config: { metric: "chars", threshold_pct: 5.0, window: "1d", window_days: 1, ttl: 86400 },
    collectAll: async () => ({ sources: { chars: await fetchSafe(async () => {
      const r = await fetch("https://en.wikipedia.org/w/api.php?action=query&titles=Bitcoin&prop=extracts&exintro&format=json&explaintext=1", { headers: { "user-agent": "VolatiAI/1.0 (https://fourieranalys.se; admin@fourieranalys.se)" } });
      if (!r.ok) throw new Error("http_" + r.status);
      const j = await r.json();
      const pages = j?.query?.pages;
      if (!pages || typeof pages !== "object") throw new Error("no_pages");
      const first = Object.values(pages)[0];
      const v = first?.extract?.length;
      if (!Number.isFinite(v) || v <= 0) throw new Error("no_extract");
      return v;
    }) } }),
  },
  "wttr-dhaka-temp": {
    config: { metric: "temp_c", threshold_pct: 10.0, window: "1d", window_days: 1, ttl: 3600 },
    collectAll: async () => ({ sources: { temp_c: await fetchSafe(async () => {
      const r = await fetch("https://wttr.in/Dhaka?format=j1");
      if (!r.ok) throw new Error("http_" + r.status);
      const j = await r.json();
      const v = Number(j?.current_condition?.[0]?.temp_C);
      if (!Number.isFinite(v)) throw new Error("no_temp");
      return v;
    }) } }),
  },
  "ensembl-brca1-gene": {
    config: { metric: "strand", threshold_pct: 100.0, window: "1d", window_days: 1, ttl: 86400 },
    collectAll: async () => ({ sources: { strand: await fetchSafe(async () => {
      const r = await fetch("https://rest.ensembl.org/lookup/symbol/homo_sapiens/BRCA1?content-type=application/json");
      if (!r.ok) throw new Error("http_" + r.status);
      const j = await r.json();
      const v = Number(j?.strand);
      if (!Number.isFinite(v)) throw new Error("no_strand");
      return v;
    }) } }),
  },
  "mygene-brca1-hits": {
    config: { metric: "hits", threshold_pct: 5.0, window: "1d", window_days: 1, ttl: 86400 },
    collectAll: async () => ({ sources: { hits: await fetchSafe(async () => {
      const r = await fetch("https://mygene.info/v3/query?q=symbol:BRCA1&species=human");
      if (!r.ok) throw new Error("http_" + r.status);
      const j = await r.json();
      const v = Number(j?.total);
      if (!Number.isFinite(v)) throw new Error("no_total");
      return v;
    }) } }),
  },
  "myvariant-rs113488022-hits": {
    config: { metric: "hits", threshold_pct: 5.0, window: "1d", window_days: 1, ttl: 86400 },
    collectAll: async () => ({ sources: { hits: await fetchSafe(async () => {
      const r = await fetch("https://myvariant.info/v1/query?q=dbsnp.rsid:rs113488022");
      if (!r.ok) throw new Error("http_" + r.status);
      const j = await r.json();
      const v = Number(j?.total);
      if (!Number.isFinite(v)) throw new Error("no_total");
      return v;
    }) } }),
  },
  "europepmc-crispr-therapy": {
    config: { metric: "hitCount", threshold_pct: 5.0, window: "1d", window_days: 1, ttl: 86400 },
    collectAll: async () => ({ sources: { hitCount: await fetchSafe(async () => {
      const r = await fetch("https://www.ebi.ac.uk/europepmc/webservices/rest/search?query=CRISPR%20gene%20therapy&format=json");
      if (!r.ok) throw new Error("http_" + r.status);
      const j = await r.json();
      const v = Number(j?.hitCount);
      if (!Number.isFinite(v)) throw new Error("no_hitCount");
      return v;
    }) } }),
  },
  "open-mindfulness-resource-count": {
    config: { metric: "resource_count", threshold_pct: 5.0, window: "1d", window_days: 1, ttl: 86400 },
    collectAll: async () => ({ sources: { resource_count: await fetchSafe(async () => {
      const r = await fetch("https://api.theholisticcare.com/v1/resources");
      if (!r.ok) throw new Error("http_" + r.status);
      const j = await r.json();
      if (!Array.isArray(j?.data)) throw new Error("no_data");
      return j.data.length;
    }) } }),
  },
  "affirmations-length": {
    config: { metric: "affirmation_length", threshold_pct: 20.0, window: "1d", window_days: 1, ttl: 86400 },
    collectAll: async () => ({ sources: { affirmation_length: await fetchSafe(async () => {
      const r = await fetch("https://www.affirmations.dev/");
      if (!r.ok) throw new Error("http_" + r.status);
      const j = await r.json();
      const v = j?.affirmation?.length;
      if (!Number.isFinite(v) || v <= 0) throw new Error("no_affirmation");
      return v;
    }) } }),
  },
  "cdc-covid-total-deaths": {
    config: { metric: "deaths", threshold_pct: 5.0, window: "1d", window_days: 1, ttl: 86400 },
    collectAll: async () => ({ sources: { deaths: await fetchSafe(async () => {
      const r = await fetch("https://data.cdc.gov/resource/9bhg-hcku.json?$limit=1");
      if (!r.ok) throw new Error("http_" + r.status);
      const j = await r.json();
      const v = Number(j?.[0]?.total_deaths);
      if (!Number.isFinite(v) || v <= 0) throw new Error("no_total_deaths");
      return v;
    }) } }),
  },
  "who-gho-indicator-count": {
    config: { metric: "indicator_count", threshold_pct: 1.0, window: "1d", window_days: 1, ttl: 86400 },
    collectAll: async () => ({ sources: { indicator_count: await fetchSafe(async () => {
      const r = await fetch("https://ghoapi.azureedge.net/api/Indicator");
      if (!r.ok) throw new Error("http_" + r.status);
      const j = await r.json();
      if (!Array.isArray(j?.value)) throw new Error("no_value");
      return j.value.length;
    }) } }),
  },
  "viruswatch-disease-count": {
    config: { metric: "disease_count", threshold_pct: 5.0, window: "1d", window_days: 1, ttl: 86400 },
    collectAll: async () => ({ sources: { disease_count: await fetchSafe(async () => {
      const r = await fetch("https://api.viruswatch.health/v1/diseases");
      if (!r.ok) throw new Error("http_" + r.status);
      const j = await r.json();
      const v = Object.keys(j?.diseases || {}).length;
      if (v === 0) throw new Error("no_diseases");
      return v;
    }) } }),
  },
  "pubmed-acupuncture-papers": {
    config: { metric: "count", threshold_pct: 5.0, window: "1d", window_days: 1, ttl: 86400 },
    collectAll: async () => ({ sources: { count: await fetchSafe(async () => {
      const r = await fetch("https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=pubmed&term=acupuncture&retmode=json");
      if (!r.ok) throw new Error("http_" + r.status);
      const j = await r.json();
      const v = Number(j?.esearchresult?.count);
      if (!Number.isFinite(v)) throw new Error("no_count");
      return v;
    }) } }),
  },
  "pubmed-meditation-papers": {
    config: { metric: "count", threshold_pct: 5.0, window: "1d", window_days: 1, ttl: 86400 },
    collectAll: async () => ({ sources: { count: await fetchSafe(async () => {
      const r = await fetch("https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=pubmed&term=meditation&retmode=json");
      if (!r.ok) throw new Error("http_" + r.status);
      const j = await r.json();
      const v = Number(j?.esearchresult?.count);
      if (!Number.isFinite(v)) throw new Error("no_count");
      return v;
    }) } }),
  },
  "langpop-python-composite-score": {
    config: { metric: "score", threshold_pct: 5.0, window: "1d", window_days: 1, ttl: 86400 },
    collectAll: async () => ({ sources: { score: await fetchSafe(async () => {
      const r = await fetch("https://langpop.com/api/v1/rankings");
      if (!r.ok) throw new Error("http_" + r.status);
      const j = await r.json();
      const arr = j?.data;
      if (!Array.isArray(arr)) throw new Error("no_data");
      const py = arr.find(x => String(x?.language || "").toLowerCase() === "python");
      if (!py) throw new Error("no_python");
      const v = Number(py.composite_score);
      if (!Number.isFinite(v) || v < 0) throw new Error("no_score");
      return v;
    }) } }),
  },
  "dcentral-miner-count": {
    config: { metric: "count", threshold_pct: 5.0, window: "1d", window_days: 1, ttl: 86400 },
    collectAll: async () => ({ sources: { count: await fetchSafe(async () => {
      const r = await fetch("https://d-central.tech/wp-json/dc/v1/miners");
      if (!r.ok) throw new Error("http_" + r.status);
      const j = await r.json();
      const v = Number(j?.total);
      if (!Number.isFinite(v) || v < 0) throw new Error("no_total");
      return v;
    }) } }),
  },
  "uk-carbon-intensity-now": {
    config: { metric: "gco2_per_kwh", threshold_pct: 20.0, window: "1d", window_days: 1, ttl: 1800 },
    collectAll: async () => ({ sources: { gco2_per_kwh: await fetchSafe(async () => {
      const r = await fetch("https://api.carbonintensity.org.uk/intensity");
      if (!r.ok) throw new Error("http_" + r.status);
      const j = await r.json();
      const int = j?.data?.[0]?.intensity;
      if (!int) throw new Error("no_intensity");
      const raw = int.actual !== null ? int.actual : int.forecast;
      const v = Number(raw);
      if (!Number.isFinite(v) || v < 0) throw new Error("no_value");
      return v;
    }) } }),
  },
  "corona-zahlen-germany-week-incidence": {
    config: { metric: "per_100k", threshold_pct: 10.0, window: "1d", window_days: 1, ttl: 86400 },
    collectAll: async () => ({ sources: { per_100k: await fetchSafe(async () => {
      const r = await fetch("https://api.corona-zahlen.org/germany");
      if (!r.ok) throw new Error("http_" + r.status);
      const j = await r.json();
      const v = Number(j?.weekIncidence);
      if (!Number.isFinite(v) || v < 0) throw new Error("no_incidence");
      return v;
    }) } }),
  },
  "gbif-homo-sapiens-key": {
    config: { metric: "usage_key", threshold_pct: 100.0, window: "1d", window_days: 1, ttl: 86400 },
    collectAll: async () => ({ sources: { usage_key: await fetchSafe(async () => {
      const r = await fetch("https://api.gbif.org/v1/species/match?name=Homo+sapiens");
      if (!r.ok) throw new Error("http_" + r.status);
      const j = await r.json();
      const v = Number(j?.usageKey);
      if (!Number.isFinite(v) || v <= 0) throw new Error("no_usageKey");
      return v;
    }) } }),
  },
  "clinicaltrials-total-studies": {
    config: { metric: "count", threshold_pct: 0.5, window: "1d", window_days: 1, ttl: 86400 },
    collectAll: async () => ({ sources: { count: await fetchSafe(async () => {
      const r = await fetch("https://clinicaltrials.gov/api/v2/studies?pageSize=1&countTotal=true");
      if (!r.ok) throw new Error("http_" + r.status);
      const j = await r.json();
      const v = Number(j?.totalCount);
      if (!Number.isFinite(v) || v < 0) throw new Error("no_total");
      return v;
    }) } }),
  },
  "south-tyrol-accommodations": {
    config: { metric: "count", threshold_pct: 2.0, window: "1d", window_days: 1, ttl: 86400 },
    collectAll: async () => ({ sources: { count: await fetchSafe(async () => {
      const r = await fetch("https://tourism.api.opendatahub.com/v1/Accommodation?pagesize=1");
      if (!r.ok) throw new Error("http_" + r.status);
      const j = await r.json();
      const v = Number(j?.TotalResults);
      if (!Number.isFinite(v) || v < 0) throw new Error("no_total");
      return v;
    }) } }),
  },
  "fdic-insured-banks": {
    config: { metric: "count", threshold_pct: 0.5, window: "30d", window_days: 30, ttl: 604800 },
    collectAll: async () => ({ sources: { count: await fetchSafe(async () => {
      const r = await fetch("https://api.fdic.gov/banks/institutions?limit=1");
      if (!r.ok) throw new Error("http_" + r.status);
      const j = await r.json();
      const v = Number(j?.meta?.total);
      if (!Number.isFinite(v) || v <= 0) throw new Error("no_total");
      return v;
    }) } }),
  },
  "circle-x402-resources": {
    config: { metric: "count", threshold_pct: 10.0, window: "1d", window_days: 1, ttl: 86400 },
    collectAll: async () => ({ sources: { count: await fetchSafe(async () => {
      const r = await fetch("https://api.circle.com/v2/x402/discovery/resources?limit=100");
      if (!r.ok) throw new Error("http_" + r.status);
      const j = await r.json();
      const total = Number(j?.pagination?.total);
      if (!Number.isFinite(total) || total < 0) throw new Error("no_total");
      return total;
    }) } }),
  },
  "nyfed-sofr-rate": {
    config: { metric: "rate", threshold_pct: 2.0, window: "1d", window_days: 1, ttl: 86400 },
    collectAll: async () => ({ sources: { rate: await fetchSafe(async () => {
      const r = await fetch("https://markets.newyorkfed.org/api/rates/secured/sofr/last/1.json");
      if (!r.ok) throw new Error("http_" + r.status);
      const j = await r.json();
      const rate = j?.refRates?.[0]?.percentRate;
      const v = Number(rate);
      if (!Number.isFinite(v) || v <= 0) throw new Error("no_rate");
      return v;
    }) } }),
  },
  "bts-us-canada-truck-crossings": {
    config: { metric: "trucks", threshold_pct: 10.0, window: "30d", window_days: 30, ttl: 86400 },
    collectAll: async () => ({ sources: { trucks: await fetchSafe(async () => {
      const where = encodeURIComponent("border='US-Canada Border' AND measure='Trucks'");
      const url = "https://data.bts.gov/resource/keg4-3bc2.json?$where=" + where + "&$select=date,sum(value)+as+total&$group=date&$order=date+DESC&$limit=1";
      const r = await fetch(url);
      if (!r.ok) throw new Error("http_" + r.status);
      const j = await r.json();
      if (!Array.isArray(j) || !j.length) throw new Error("no_data");
      const total = String(j[0]?.total || "").replace(/,/g, "");
      const v = Number(total);
      if (!Number.isFinite(v) || v <= 0) throw new Error("no_total");
      return v;
    }) } }),
  },
  "bts-containership-capacity": {
    config: { metric: "teus", threshold_pct: 10.0, window: "30d", window_days: 30, ttl: 86400 },
    collectAll: async () => ({ sources: { teus: await fetchSafe(async () => {
      const where = encodeURIComponent("indicator='Capacity of Containerships Calling at U.S. Ports (in TEUs)'");
      const url = "https://data.bts.gov/resource/y5ut-ibwt.json?$where=" + where + "&$select=date,value1&$order=date+DESC&$limit=1";
      const r = await fetch(url);
      if (!r.ok) throw new Error("http_" + r.status);
      const j = await r.json();
      if (!Array.isArray(j) || !j.length) throw new Error("no_data");
      const v = Number(String(j[0]?.value1 || "").replace(/,/g, ""));
      if (!Number.isFinite(v) || v <= 0) throw new Error("no_value");
      return v;
    }) } }),
  },
  "eurostat-inland-waterway-freight": {
    config: { metric: "tonnes", threshold_pct: 5.0, window: "90d", window_days: 90, ttl: 604800 },
    collectAll: async () => ({ sources: { tonnes: await fetchSafe(async () => {
      const r = await fetch("https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/ttr00007?format=JSON&lang=EN");
      if (!r.ok) throw new Error("http_" + r.status);
      const j = await r.json();
      const vals = Object.values(j?.value || {}).filter(v => typeof v === "number" && v > 0);
      if (!vals.length) throw new Error("no_values");
      const total = vals.reduce((s, v) => s + v, 0);
      if (total <= 0) throw new Error("no_total");
      return total;
    }) } }),
  },
};



// ─── Ed25519 signing for /latest ───
async function sha256Hex(buf) {
  const h = await crypto.subtle.digest("SHA-256", buf);
  return [...new Uint8Array(h)].map(b => b.toString(16).padStart(2, "0")).join("");
}

async function signLatest(payload, env) {
  const privPem = env.VOLATI_ED25519_PRIV;
  if (!privPem) return null;
  try {
    const b64 = privPem
      .replace(/-----BEGIN PRIVATE KEY-----/g, "")
      .replace(/-----END PRIVATE KEY-----/g, "")
      .replace(/\s+/g, "");
    const pkcs8 = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
    const key = await crypto.subtle.importKey(
      "pkcs8", pkcs8,
      { name: "Ed25519" },
      false,
      ["sign"]
    );
    function canonical(obj) {
      if (obj === null || typeof obj !== "object") return JSON.stringify(obj);
      if (Array.isArray(obj)) return "[" + obj.map(canonical).join(",") + "]";
      const keys = Object.keys(obj).sort();
      return "{" + keys.map(k => JSON.stringify(k) + ":" + canonical(obj[k])).join(",") + "}";
    }
    const signable = { ...payload };
    delete signable.signature;
    const bytes = new TextEncoder().encode(canonical(signable) + "\n");
    const sig = await crypto.subtle.sign("Ed25519", key, bytes);
    const sigB64 = btoa(String.fromCharCode(...new Uint8Array(sig)));
    return {
      alg: "Ed25519",
      key_id: "volati-2026-01",
      value: sigB64,
      canonical_sha256: await sha256Hex(bytes),
};
  } catch (e) {
    console.error("sign_failed", String(e));
    return null;
  }
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: {
      "content-type": "application/json",
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "GET, OPTIONS",
    },
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
  history = history.filter(h => h.t > Date.now() - 90 * 24 * 60 * 60 * 1000);
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
    const summary = {
      timestamp: new Date().toISOString(),
      source: "cron",
      cron,
      total: results.length,
      written, skipped, failed,
      results,
    };
    try {
      await env.SECTOR_KV.put("_last_cron_run", JSON.stringify(summary), { expirationTtl: 86400 * 7 });
    } catch (e) {
      console.log("cron status write failed:", String(e));
    }
    console.log(`cron summary: ${written} written, ${skipped} skipped, ${failed} failed`);
  },

  async fetch(request, env) {
    const url = new URL(request.url);
    const parts = url.pathname.split("/").filter(Boolean);

    // ─── POST /publish-hash — client stores last-published message hash ───
    if (parts[0] === "publish-hash") {
      if (request.method !== "POST") {
        return json({ error: "method_not_allowed", allow: "POST" }, 405);
      }
      try {
        const body = await request.json();
        const hash = body && body.hash;
        if (typeof hash !== "string" || hash.length < 8 || hash.length > 128) {
          return json({ error: "invalid_hash" }, 400);
        }
        await env.SECTOR_KV.put("_last_publish_hash", hash, { expirationTtl: 86400 * 30 });
        return json({ ok: true, hash, stored_at: new Date().toISOString() });
      } catch (e) {
        return json({ error: "put_failed", message: String(e && e.message || e) }, 500);
      }
    }

    // ─── /metrics — read-only health from history timestamps ───
    if (parts[0] === "metrics") {
      try {
        const force = url.searchParams.get("force") === "1";
        if (!force) {
          const cached = await env.SECTOR_KV.get("_metrics_cache", "json");
          if (cached) return json(cached);
        }
        const list = await env.SECTOR_KV.list({ limit: 1000 });
        const histKeys = list.keys.filter(k => k.name.endsWith("_history") && !k.name.startsWith("_"));
        const now = Date.now();
        const H24 = 24 * 3600 * 1000;
        const H7D = 7 * H24;
        const H30D = 30 * H24;
        let healthy = 0, stale24 = 0, stale7d = 0, stale30d = 0;
        const stale = [];
        const BATCH = 25;
        for (let i = 0; i < histKeys.length; i += BATCH) {
          const batch = histKeys.slice(i, i + BATCH);
          const hists = await Promise.all(batch.map(k => env.SECTOR_KV.get(k.name, "json")));
          batch.forEach((k, j) => {
            const hist = hists[j];
            if (!Array.isArray(hist) || hist.length === 0) return;
            const last = hist[hist.length - 1];
            const age = now - (last.t || 0);
            const sector = k.name.replace(/_history$/, "").replace(/_([a-z_]+)$/, "");
            if (age < H24) healthy++;
            else if (age < H7D) { stale24++; stale.push({sector, age_hours: Math.round(age/3600000), tier: "24h"}); }
            else if (age < H30D) { stale7d++; stale.push({sector, age_hours: Math.round(age/3600000), tier: "7d"}); }
            else { stale30d++; stale.push({sector, age_hours: Math.round(age/3600000), tier: "30d"}); }
          });
        }
        stale.sort((a, b) => b.age_hours - a.age_hours);
        const result = {
          ts: new Date().toISOString(),
          total_with_history: histKeys.length,
          healthy_24h: healthy,
          stale_24h: stale24,
          stale_7d: stale7d,
          stale_30d: stale30d,
          stale_sectors: stale.slice(0, 20),
          _cached_at: new Date().toISOString(),
        };
        // Cache 120s (KV minimum TTL is 60s)
        await env.SECTOR_KV.put("_metrics_cache", JSON.stringify(result), { expirationTtl: 120 });
        return json(result);
      } catch (e) {
        return json({ error: "metrics_failed", message: String(e && e.message || e) }, 500);
      }
    }

    // ─── /history/<sector> — full history array, for client charts ───
    if (parts[0] === "history" && parts[1]) {
      try {
        const sector = parts[1];
        const list = await env.SECTOR_KV.list({ prefix: `${sector}_`, limit: 10 });
        const key = list.keys.find(k => k.name.endsWith("_history"));
        if (!key) return json({ error: "not_found", sector }, 404);
        const hist = await env.SECTOR_KV.get(key.name, "json");
        if (!Array.isArray(hist)) return json({ error: "no_history", sector }, 404);
        return json({
          sector,
          metric: key.name.replace(`_history`, "").replace(`${sector}_`, ""),
          points: hist.length,
          first: hist[0]?.t || null,
          last: hist[hist.length - 1]?.t || null,
          history: hist,
        });
      } catch (e) {
        return json({ error: "history_failed", message: String(e && e.message || e) }, 500);
      }
    }

    // ─── /status — pipeline health ───
    if (parts[0] === "status") {
      try {
        const list = await env.SECTOR_KV.list({ limit: 1000 });
        const histKeys = list.keys.filter(k => k.name.endsWith("_history"));
        const meta = await env.SECTOR_KV.get("_last_cron_run", "json");
        const lastPublishHash = await env.SECTOR_KV.get("_last_publish_hash");
        return json({
          ts: new Date().toISOString(),
          worker: "sector-slow",
          density: env.DENSITY || null,
          kv_total_keys: list.keys.length,
          kv_history_keys: histKeys.length,
          kv_other_keys: list.keys.length - histKeys.length,
          last_cron: meta || null,
          last_publish_hash: lastPublishHash || null,
        });
      } catch (e) {
        return json({ error: "status_failed", message: String(e && e.message || e) }, 500);
      }
    }


    // ─── /latest — batch summary from KV, no upstream fetches ───
    if (parts[0] === "latest") {
      try {
        // Always read from history keys — consistent shape, no cron dependency
        const list = await env.SECTOR_KV.list({ limit: 1000 });
        const histKeys = list.keys
          .filter(k => k.name.endsWith("_history") && !k.name.startsWith("_"));

        const rows = [];
        // Parallel KV reads in batches of 25 to avoid connection thrash
        const BATCH = 25;
        for (let i = 0; i < histKeys.length; i += BATCH) {
          const batch = histKeys.slice(i, i + BATCH);
          const hists = await Promise.all(batch.map(k => env.SECTOR_KV.get(k.name, "json")));
          batch.forEach((k, j) => {
            const hist = hists[j];
            if (!Array.isArray(hist) || hist.length === 0) return;
            const last = hist[hist.length - 1];
            const prev = hist.length > 1 ? hist[hist.length - 2] : last;
            const pct = prev.v !== 0 ? ((last.v - prev.v) / prev.v) * 100 : 0;
            // Key pattern: <sector>_<metric>_history.
            // Sector names use dashes (never underscores), so split on FIRST _.
            const withoutSuffix = k.name.replace(/_history$/, "");
            const firstUnderscore = withoutSuffix.indexOf("_");
            const sector = firstUnderscore === -1 ? withoutSuffix : withoutSuffix.substring(0, firstUnderscore);
            const absPct = Math.abs(pct);
            const sev = absPct >= 15 ? "critical"
                      : absPct >= 5  ? "warn" : "info";
            rows.push({
              sector, current: last.v, previous: prev.v, pct_change: pct,
              pts: hist.length, t: last.t,
              has_signal: sev !== "info", severity: sev,
            });
          });
        }
        const _latest = {
          ts: new Date().toISOString(),
          count: rows.length,
          with_history: rows.length,
          alerting: 0,
          source: "kv_list",
          rows,
        };
        const _sig = await signLatest(_latest, env);
        if (_sig) _latest.signature = _sig;
        return json(_latest);
      } catch (e) {
        return json({ error: "latest_failed", message: String(e && e.message || e) }, 500);
      }
    }

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
          const sorted = (h || [])
            .filter(x => x && Number.isFinite(x.t) && Number.isFinite(x.v))
            .sort((a, b) => a.t - b.t);
          const times = sorted.map(x => x.t);
          const last = sorted.length >= 1 ? sorted[sorted.length - 1] : null;
          const prev = sorted.length >= 2 ? sorted[sorted.length - 2] : null;
          const pctChange = (last && prev && prev.v !== 0)
            ? ((last.v - prev.v) / Math.abs(prev.v)) * 100
            : null;
          const threshold = c.config.threshold_pct || 0;
          const distancePct = pctChange !== null ? Math.abs(pctChange) - threshold : null;
          summary[name] = {
            metric: c.config.metric,
            history_points: sorted.length,
            span_days: times.length ? Math.round(((Math.max(...times) - Math.min(...times)) / 86400000) * 10) / 10 : 0,
            newest_iso: times.length ? new Date(Math.max(...times)).toISOString() : null,
            last_value: last ? last.v : null,
            prev_value: prev ? prev.v : null,
            pct_change: pctChange,
            threshold_pct: threshold,
            distance_pct: distancePct,
          };
        } catch (e) {
          summary[name] = { error: String(e).slice(0, 80) };
        }
      }
      return json({ density: "slow", sectors: summary, timestamp: new Date().toISOString() });
    }

    if (sectorName === "_sweep") {
      const start = Date.now();
      const results = [];
      for (const [name, collector] of Object.entries(COLLECTORS)) {
        const t0 = Date.now();
        try {
          const r = await runSectorForCron(name, collector, env);
          results.push({ ...r, ms: Date.now() - t0 });
        } catch (e) {
          results.push({ sector: name, error: String(e).slice(0, 120), ms: Date.now() - t0 });
        }
      }
      const summary = {
        timestamp: new Date().toISOString(),
        source: "manual_sweep",
        elapsed_ms: Date.now() - start,
        total: results.length,
        written: results.filter(r => r.written).length,
        skipped: results.filter(r => r.skipped).length,
        failed: results.filter(r => r.error).length,
        results,
      };
      try {
        await env.SECTOR_KV.put("_last_cron_run", JSON.stringify(summary), { expirationTtl: 86400 * 7 });
      } catch (e) {
        summary.kv_error = String(e).slice(0, 120);
      }
      return json(summary);
    }

    if (sectorName === "_cron_status") {
      try {
        const raw = await env.SECTOR_KV.get("_last_cron_run");
        if (!raw) return json({ ok: false, message: "no cron run recorded yet" });
        return json({ ok: true, last_run: JSON.parse(raw) });
      } catch (e) {
        return json({ ok: false, error: String(e).slice(0, 120) }, 500);
      }
    }

    if (sectorName === "_graph_snapshot") {
      const snapshot = {};
      for (const [name, c] of Object.entries(COLLECTORS)) {
        const kvKey = name + "_" + c.config.metric + "_history";
        try {
          const raw = await env.SECTOR_KV.get(kvKey);
          const h = raw ? JSON.parse(raw) : [];
          const sorted = (h || []).filter(x => x && Number.isFinite(x.t) && Number.isFinite(x.v)).sort((a,b) => a.t - b.t);
          snapshot[name] = {
            metric: c.config.metric,
            threshold_pct: c.config.threshold_pct || 0,
            points: sorted.length,
            first: sorted[0] ? { t: sorted[0].t, v: sorted[0].v } : null,
            last: sorted[sorted.length-1] ? { t: sorted[sorted.length-1].t, v: sorted[sorted.length-1].v } : null,
            values: sorted.map(x => ({ t: x.t, v: x.v })),
          };
        } catch (e) {
          snapshot[name] = { error: String(e).slice(0, 80) };
        }
      }
      return json({ timestamp: new Date().toISOString(), sector_count: Object.keys(snapshot).length, sectors: snapshot });
    }

    if (sectorName === "_coherence") {
      // Per-sector coherence: is the current value consistent with its
      // own history? Returns 0-1 confidence, or null for sectors with
      // fewer than 2 historical observations.
      const result = {};
      for (const [name, c] of Object.entries(COLLECTORS)) {
        const kvKey = name + "_" + c.config.metric + "_history";
        try {
          const raw = await env.SECTOR_KV.get(kvKey);
          const h = raw ? JSON.parse(raw) : [];
          const sorted = (h || [])
            .filter(x => x && Number.isFinite(x.t) && Number.isFinite(x.v))
            .sort((a, b) => a.t - b.t);
          const current = sorted.length >= 1 ? sorted[sorted.length - 1].v : null;
          const rawScore = coherenceScore(sorted, current);
          const detScore = detrendedCoherence(sorted, current);
          result[name] = {
            metric: c.config.metric,
            points: sorted.length,
            current,
            coherence: rawScore === null ? null : Math.round(rawScore * 1000) / 1000,
            detrended: detScore === null ? null : Math.round(detScore * 1000) / 1000,
            verdict: rawScore === null
                   ? (sorted.length === 0 ? "no_data" : "insufficient_data")
                   : rawScore >= 0.85 ? "confirmed"
                   : rawScore >= 0.5  ? "likely"
                   : "outlier",
            detrended_verdict: detScore === null
                   ? (sorted.length === 0 ? "no_data" : "insufficient_data")
                   : detScore >= 0.85 ? "confirmed"
                   : detScore >= 0.5  ? "likely"
                   : "outlier",
          };
        } catch (e) {
          result[name] = { error: String(e).slice(0, 80) };
        }
      }
      return json({
        timestamp: new Date().toISOString(),
        sector_count: Object.keys(result).length,
        sectors: result,
      });
    }

    if (sectorName === "_claim_graph") {
      // Build the claim graph from all sector history, then run arbitration.
      // Same data the truth-worker consumes, computed inline (no HTTP hop).
      const snapshot = { sectors: {} };
      for (const [name, c] of Object.entries(COLLECTORS)) {
        const kvKey = name + "_" + c.config.metric + "_history";
        try {
          const raw = await env.SECTOR_KV.get(kvKey);
          const h = raw ? JSON.parse(raw) : [];
          const sorted = (h || [])
            .filter(x => x && Number.isFinite(x.t) && Number.isFinite(x.v))
            .sort((a, b) => a.t - b.t);
          snapshot.sectors[name] = {
            metric: c.config.metric,
            values: sorted,
          };
        } catch (e) {
          snapshot.sectors[name] = { metric: c.config.metric, values: [], error: String(e).slice(0, 80) };
        }
      }
      const windows = {};
      for (const [name, c] of Object.entries(COLLECTORS)) {
        windows[name] = c.config.window_days || 7;
      }
      const graph = buildClaimGraph(snapshot, {}, windows);
      const verdicts = arbitrate(graph);
      return json({
        timestamp: new Date().toISOString(),
        nodes: graph.nodes.length,
        edges: graph.edges.length,
        claims: verdicts.length,
        verdicts,
      });
    }

    const collector = COLLECTORS[sectorName];

    if (sectorName === "_sectors") {
      const meta = {};
      for (const [name, c] of Object.entries(COLLECTORS)) {
        meta[name] = {
          metric: c.config.metric,
          threshold_pct: c.config.threshold_pct,
          window: c.config.window,
          window_days: c.config.window_days || WINDOW_DAYS_DEFAULT,
        };
      }
      return json({ density: "slow", count: Object.keys(COLLECTORS).length, sectors: meta });
    }

    if (sectorName === "dashboard") {
      return new Response(DASHBOARD_HTML, {
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    }

    if (sectorName === "_correlation") {
      // Load all sector histories with >= 30 points
      const histories = {};
      for (const [name, c] of Object.entries(COLLECTORS)) {
        const kvKey = name + "_" + c.config.metric + "_history";
        try {
          const raw = await env.SECTOR_KV.get(kvKey);
          if (!raw) continue;
          const h = JSON.parse(raw);
          const sorted = (h || [])
            .filter(x => x && Number.isFinite(x.t) && Number.isFinite(x.v))
            .sort((a, b) => a.t - b.t);
          if (sorted.length >= 30) {
            const det = detrendedResiduals(sorted);
            if (det) {
              histories[name] = {
                ts: det.ts,
                residuals: det.residuals,
                points: sorted.length,
              };
            }
          }
        } catch (e) { /* skip */ }
      }

      // Pairwise Pearson correlation on detrended residuals, aligned by common time window
      const names = Object.keys(histories);
      const pairs = [];
      for (let i = 0; i < names.length; i++) {
        for (let j = i + 1; j < names.length; j++) {
          const a = histories[names[i]];
          const b = histories[names[j]];
          // Align by rounding ts to nearest day (they should already align for backfills)
          const minLen = Math.min(a.residuals.length, b.residuals.length);
          // Take last minLen points (most recent align)
          const ar = a.residuals.slice(-minLen);
          const br = b.residuals.slice(-minLen);
          const r = pearson(ar, br);
          if (r !== null) {
            const absR = Math.abs(r);
            const pValue = correlationPValue(r, minLen);
            const warning = correlationWarning(names[i], names[j], absR, pValue);
            pairs.push({
              a: names[i],
              b: names[j],
              r: Math.round(r * 1000) / 1000,
              abs_r: Math.round(absR * 1000) / 1000,
              n: minLen,
              p_value: pValue !== null ? Math.round(pValue * 10000) / 10000 : null,
              bonferroni_significant: pValue !== null && pValue < (0.05 / ((names.length * (names.length - 1)) / 2)),
              same_metric: (COLLECTORS[names[i]]?.config?.metric || "") === (COLLECTORS[names[j]]?.config?.metric || "") && (COLLECTORS[names[i]]?.config?.metric !== undefined),
              warning: warning,
            });
          }
        }
      }
      pairs.sort((x, y) => y.abs_r - x.abs_r);

      return json({
        timestamp: new Date().toISOString(),
        sectors: names.length,
        sector_names: names,
        pairs_count: pairs.length,
        pairs,
      });
    }

    if (sectorName === "_validate_history") {
      const findings = {};
      for (const [name, c] of Object.entries(COLLECTORS)) {
        const kvKey = name + "_" + c.config.metric + "_history";
        try {
          const raw = await env.SECTOR_KV.get(kvKey);
          if (!raw) continue;
          const h = (JSON.parse(raw) || []).filter(x => x && Number.isFinite(x.t) && Number.isFinite(x.v));
          if (h.length < 2) continue;

          const sorted = [...h].sort((a, b) => a.t - b.t);
          const values = sorted.map(x => x.v);
          const unique = new Set(values).size;
          const min = Math.min(...values);
          const max = Math.max(...values);
          const range = max - min;
          const mean = values.reduce((a, b) => a + b, 0) / values.length;
          const ratio = unique / values.length;

          const flags = [];
          if (unique === 1) flags.push("all_identical");
          else if (ratio < 0.1) flags.push("mostly_identical");
          if (range === 0) flags.push("zero_variance");

          for (let i = 1; i < sorted.length; i++) {
            const prev = sorted[i - 1].v;
            const jump = Math.abs(sorted[i].v - prev) / Math.max(Math.abs(prev), 1);
            if (jump > 0.2) {
              const d = new Date(sorted[i].t).toISOString().slice(0, 10);
              flags.push("step_" + d + "_" + Math.round(jump * 100) + "pct");
            }
          }

          findings[name] = {
            points: h.length,
            unique_values: unique,
            unique_ratio: Math.round(ratio * 1000) / 1000,
            min: Math.round(min * 100) / 100,
            max: Math.round(max * 100) / 100,
            range: Math.round(range * 100) / 100,
            mean: Math.round(mean * 100) / 100,
            flags: flags.length > 0 ? flags : null,
          };
        } catch (e) {
          findings[name] = { error: String(e).slice(0, 80) };
        }
      }
      const flagged = Object.entries(findings).filter(([, v]) => v.flags && v.flags.length > 0);
      return json({
        timestamp: new Date().toISOString(),
        total_with_history: Object.keys(findings).length,
        flagged_count: flagged.length,
        flagged: Object.fromEntries(flagged),
        all_findings: findings,
      });
    }

    if (!collector) return json({ error: "unknown sector", sector: sectorName }, 404);

    if (action === "health") {
      return json({ ok: true, sector: sectorName, density: "slow" });
    }

    if (action === "raw") {
      return json(await collector.collectAll(env));
    }

    if (action === "history") {
      const config = collector.config;
      const kvKey = `${sectorName}_${config.metric}_history`;
      try {
        const raw = await env.SECTOR_KV.get(kvKey);
        const history = raw ? JSON.parse(raw) : [];
        return json({
          sector: sectorName,
          metric: config.metric,
          points: history.length,
          history: history,
        });
      } catch (e) {
        return json({ sector: sectorName, error: String(e).slice(0, 120) }, 500);
      }
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
