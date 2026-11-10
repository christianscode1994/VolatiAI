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

// === Multi-source median arbitration ===
// Resolves a metric from 2+ independent sources. If they disagree by more
// than the sector's max_disagreement_pct, returns ok:false so has_signal
// won't fire. Preserves the {ok, data} shape the handler expects.
function multiSourceMedian(results, config = {}) {
  const maxDis = config.max_disagreement_pct ?? 20;
  const vals = results
    .filter(r => r && r.ok && typeof r.data === "number" && isFinite(r.data))
    .map(r => r.data);

  if (vals.length === 0) {
    return { ok: false, error: "no_valid_sources" };
  }

  if (vals.length === 1) {
    // Only one source responded — accept, but flag it
    return { ok: true, data: vals[0], single_source: true };
  }

  const sorted = [...vals].sort((a, b) => a - b);
  const median = sorted.length % 2
    ? sorted[Math.floor(sorted.length / 2)]
    : (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2;

  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
  const dis = mean !== 0 ? Math.abs(max - min) / Math.abs(mean) * 100 : 0;

  if (dis > maxDis) {
    return {
      ok: false,
      error: `disagreement_${dis.toFixed(1)}pct`,
      rejected_values: vals,
      disagreement_pct: dis,
    };
  }

  return {
    ok: true,
    data: median,
    source_count: vals.length,
    disagreement_pct: parseFloat(dis.toFixed(3)),
  };
}


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

function ghHeaders(env) {
  const h = { "User-Agent": "VolatiAI/1.0", "Accept": "application/vnd.github+json" };
  if (env && env.GITHUB_TOKEN) h["Authorization"] = "Bearer " + env.GITHUB_TOKEN;
  return h;
}

const COLLECTORS = {



  "npm-react-weekly-downloads": {
    config: { metric: "downloads", threshold_pct: 10, window: "7d", window_days: 7 },
    async collectAll(env) {
      const r = await fetch("https://api.npmjs.org/downloads/point/last-week/react", { headers: { "User-Agent": "VolatiAI/1.0" }, signal: AbortSignal.timeout(15000) });
      if (!r.ok) return { value: null, sources: { npm_react: { ok: false } } };
      const j = await r.json();
      return { value: typeof j?.downloads === "number" ? j.downloads : null, sources: { npm_react: { ok: typeof j?.downloads === "number" } } };
    },
  },
  "rubygems-rails-downloads": {
    config: { metric: "downloads", threshold_pct: 5, window: "30d", window_days: 30 },
    async collectAll(env) {
      const r = await fetch("https://rubygems.org/api/v1/gems/rails.json", { headers: { "User-Agent": "VolatiAI/1.0" }, signal: AbortSignal.timeout(15000) });
      if (!r.ok) return { value: null, sources: { rubygems: { ok: false } } };
      const j = await r.json();
      return { value: typeof j?.downloads === "number" ? j.downloads : null, sources: { rubygems: { ok: typeof j?.downloads === "number" } } };
    },
  },
  "ensembl-species-count": {
    config: { metric: "species_count", threshold_pct: 2, window: "90d", window_days: 90 },
    async collectAll(env) {
      const r = await fetch("https://rest.ensembl.org/info/species?content-type=application/json", { headers: { "User-Agent": "VolatiAI/1.0" }, signal: AbortSignal.timeout(20000) });
      if (!r.ok) return { value: null, sources: { ensembl: { ok: false } } };
      const j = await r.json();
      return { value: Array.isArray(j?.species) ? j.species.length : null, sources: { ensembl: { ok: Array.isArray(j?.species) } } };
    },
  },
  "openfda-device-event-total": {
    config: { metric: "event_count", threshold_pct: 3, window: "30d", window_days: 30 },
    async collectAll(env) {
      const r = await fetch("https://api.fda.gov/device/event.json?limit=1", { headers: { "User-Agent": "VolatiAI/1.0" }, signal: AbortSignal.timeout(20000) });
      if (!r.ok) return { value: null, sources: { openfda_device: { ok: false } } };
      const j = await r.json();
      return { value: typeof j?.meta?.results?.total === "number" ? j.meta.results.total : null, sources: { openfda_device: { ok: typeof j?.meta?.results?.total === "number" } } };
    },
  },
  "disease-sh-covid-cases": {
    config: { metric: "total_cases", threshold_pct: 2, window: "30d", window_days: 30 },
    async collectAll(env) {
      const r = await fetch("https://disease.sh/v3/covid-19/all", { headers: { "User-Agent": "VolatiAI/1.0" }, signal: AbortSignal.timeout(20000) });
      if (!r.ok) return { value: null, sources: { diseasesh: { ok: false } } };
      const j = await r.json();
      return { value: typeof j?.cases === "number" ? j.cases : null, sources: { diseasesh: { ok: typeof j?.cases === "number" } } };
    },
  },
  "usgs-quake-m5-count": {
    config: { metric: "quake_count", threshold_pct: 20, window: "30d", window_days: 30 },
    async collectAll(env) {
      const r = await fetch("https://earthquake.usgs.gov/fdsnws/event/1/count?format=geojson&minmagnitude=5", { headers: { "User-Agent": "VolatiAI/1.0" }, signal: AbortSignal.timeout(20000) });
      if (!r.ok) return { value: null, sources: { usgs_quake: { ok: false } } };
      const j = await r.json();
      return { value: typeof j?.count === "number" ? j.count : null, sources: { usgs_quake: { ok: typeof j?.count === "number" } }, context: { min_magnitude: 5 } };
    },
  },
  "github-status-indicator": {
    config: { metric: "status_code", threshold_pct: 50, window: "1d", window_days: 1 },
    async collectAll(env) {
      const r = await fetch("https://www.githubstatus.com/api/v2/status.json", { headers: { "User-Agent": "VolatiAI/1.0" }, signal: AbortSignal.timeout(15000) });
      if (!r.ok) return { value: null, sources: { ghstatus: { ok: false } } };
      const j = await r.json();
      const map = { "none": 0, "minor": 1, "major": 2, "critical": 3 };
      const n = map[j?.status?.indicator];
      return { value: typeof n === "number" ? n : null, sources: { ghstatus: { ok: typeof n === "number" } }, context: { indicator: j?.status?.indicator } };
    },
  },
  "cloudflare-status-indicator": {
    config: { metric: "status_code", threshold_pct: 50, window: "1d", window_days: 1 },
    async collectAll(env) {
      const r = await fetch("https://www.cloudflarestatus.com/api/v2/status.json", { headers: { "User-Agent": "VolatiAI/1.0" }, signal: AbortSignal.timeout(15000) });
      if (!r.ok) return { value: null, sources: { cfstatus: { ok: false } } };
      const j = await r.json();
      const map = { "none": 0, "minor": 1, "major": 2, "critical": 3 };
      const n = map[j?.status?.indicator];
      return { value: typeof n === "number" ? n : null, sources: { cfstatus: { ok: typeof n === "number" } }, context: { indicator: j?.status?.indicator } };
    },
  },
  "digitalocean-status-indicator": {
    config: { metric: "status_code", threshold_pct: 50, window: "1d", window_days: 1 },
    async collectAll(env) {
      const r = await fetch("https://status.digitalocean.com/index.json", { headers: { "User-Agent": "VolatiAI/1.0" }, signal: AbortSignal.timeout(15000) });
      if (!r.ok) return { value: null, sources: { dostatus: { ok: false } } };
      const j = await r.json();
      const map = { "none": 0, "minor": 1, "major": 2, "critical": 3 };
      const n = map[j?.status?.indicator];
      return { value: typeof n === "number" ? n : null, sources: { dostatus: { ok: typeof n === "number" } }, context: { indicator: j?.status?.indicator } };
    },
  },
  "sec-aapl-filings-90d": {
    config: { metric: "filing_count", threshold_pct: 10, window: "90d", window_days: 90 },
    async collectAll(env) {
      const url = "https://data.sec.gov/submissions/CIK0000320193.json";
      const r = await fetch(url, { headers: { "User-Agent": "VolatiAI/1.0 (contact@fourieranalys.workers.dev)" }, signal: AbortSignal.timeout(20000) });
      if (!r.ok) return { value: null, sources: { sec: { ok: false, error: `HTTP ${r.status}` } } };
      const j = await r.json();
      const forms = j?.filings?.recent?.form;
      const n = Array.isArray(forms) ? forms.length : null;
      return { value: n, sources: { sec: { ok: n !== null } }, context: { company: "Apple Inc", cik: "0000320193" } };
    },
  },
  "eurostat-hicp-count": {
    config: { metric: "datapoint_count", threshold_pct: 5, window: "30d", window_days: 30 },
    async collectAll(env) {
      const url = "https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/prc_hicp_manr?format=JSON";
      const r = await fetch(url, { headers: { "User-Agent": "VolatiAI/1.0" }, signal: AbortSignal.timeout(20000) });
      if (!r.ok) return { value: null, sources: { eurostat: { ok: false, error: `HTTP ${r.status}` } } };
      const j = await r.json();
      const n = j?.value ? Object.keys(j.value).length : null;
      return { value: n, sources: { eurostat: { ok: n !== null } }, context: { dataset: "HICP monthly annual rate" } };
    },
  },
  "bts-port-throughput-teu": {
    config: { metric: "container_teu", threshold_pct: 10, window: "30d", window_days: 30 },
    async collectAll(env) {
      const url = "https://data.bts.gov/resource/y5ut-ibwt.json?$limit=1&$order=date DESC";
      const r = await fetch(url, { headers: { "User-Agent": "VolatiAI/1.0" }, signal: AbortSignal.timeout(20000) });
      if (!r.ok) return { value: null, sources: { bts: { ok: false, error: `HTTP ${r.status}` } } };
      const arr = await r.json();
      const v = Array.isArray(arr) && arr[0]?.value1 ? parseFloat(arr[0].value1) : null;
      return { value: Number.isFinite(v) ? v : null, sources: { bts: { ok: Number.isFinite(v) } }, context: { metric: "US containership capacity TEU" } };
    },
  },
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
    config: { metric: "sol_usd", threshold_pct: 5, threshold_abs: 1, window: "24h", ttl: 7200, max_disagreement_pct: 10 },
    collectAll: async () => {
      const [kraken, coinbase] = await Promise.all([
        fetchSafe(async () => {
          const r = await fetch("https://api.kraken.com/0/public/Ticker?pair=SOLUSD",
            { headers: { "user-agent": "VolatiAI/1.0" }, signal: AbortSignal.timeout(15000) });
          const j = await r.json();
          return parseFloat(j.result.SOLUSD.c[0]);
        }),
        fetchSafe(async () => {
          const r = await fetch("https://api.exchange.coinbase.com/products/SOL-USD/ticker",
            { headers: { "user-agent": "VolatiAI/1.0" }, signal: AbortSignal.timeout(15000) });
          const j = await r.json();
          return parseFloat(j.price);
        }),
      ]);
      return {
        sources: {
          sol_usd: multiSourceMedian([kraken, coinbase], { max_disagreement_pct: 10 }),
        },
      };
    },
  },

  "kraken-xrp-usd": {
    config: { metric: "xrp_usd", threshold_pct: 5, threshold_abs: 0.05, window: "24h", ttl: 7200, max_disagreement_pct: 10 },
    collectAll: async () => {
      const [kraken, coinbase] = await Promise.all([
        fetchSafe(async () => {
          const r = await fetch("https://api.kraken.com/0/public/Ticker?pair=XRPUSD",
            { headers: { "user-agent": "VolatiAI/1.0" }, signal: AbortSignal.timeout(15000) });
          const j = await r.json();
          return parseFloat(j.result.XRPUSD.c[0]);
        }),
        fetchSafe(async () => {
          const r = await fetch("https://api.exchange.coinbase.com/products/XRP-USD/ticker",
            { headers: { "user-agent": "VolatiAI/1.0" }, signal: AbortSignal.timeout(15000) });
          const j = await r.json();
          return parseFloat(j.price);
        }),
      ]);
      return {
        sources: {
          xrp_usd: multiSourceMedian([kraken, coinbase], { max_disagreement_pct: 10 }),
        },
      };
    },
  },
  "kraken-ada-usd": {
    config: { metric: "ada_usd", threshold_pct: 5, threshold_abs: 0.01, window: "24h", ttl: 7200, max_disagreement_pct: 10 },
    collectAll: async () => {
      const [kraken, coinbase] = await Promise.all([
        fetchSafe(async () => {
          const r = await fetch("https://api.kraken.com/0/public/Ticker?pair=ADAUSD",
            { headers: { "user-agent": "VolatiAI/1.0" }, signal: AbortSignal.timeout(15000) });
          const j = await r.json();
          return parseFloat(j.result.ADAUSD.c[0]);
        }),
        fetchSafe(async () => {
          const r = await fetch("https://api.exchange.coinbase.com/products/ADA-USD/ticker",
            { headers: { "user-agent": "VolatiAI/1.0" }, signal: AbortSignal.timeout(15000) });
          const j = await r.json();
          return parseFloat(j.price);
        }),
      ]);
      return {
        sources: {
          ada_usd: multiSourceMedian([kraken, coinbase], { max_disagreement_pct: 10 }),
        },
      };
    },
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
    config: { metric: "dot_usd", threshold_pct: 5, threshold_abs: 0.5, window: "24h", ttl: 7200, max_disagreement_pct: 10 },
    collectAll: async () => {
      const [kraken, coinbase] = await Promise.all([
        fetchSafe(async () => {
          const r = await fetch("https://api.kraken.com/0/public/Ticker?pair=DOTUSD",
            { headers: { "user-agent": "VolatiAI/1.0" }, signal: AbortSignal.timeout(15000) });
          const j = await r.json();
          return parseFloat(j.result.DOTUSD.c[0]);
        }),
        fetchSafe(async () => {
          const r = await fetch("https://api.exchange.coinbase.com/products/DOT-USD/ticker",
            { headers: { "user-agent": "VolatiAI/1.0" }, signal: AbortSignal.timeout(15000) });
          const j = await r.json();
          return parseFloat(j.price);
        }),
      ]);
      return {
        sources: {
          dot_usd: multiSourceMedian([kraken, coinbase], { max_disagreement_pct: 10 }),
        },
      };
    },
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
  "btc-exchange-spread": {
    config: { metric: "btc_spread_pct", threshold_pct: 500, window: "1h", window_days: 1, ttl: 1800 },
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
    config: { metric: "eth_spread_pct", threshold_pct: 300, window: "1h", window_days: 1, ttl: 1800 },
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

  "drug-approvals-latest": {
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
  "gdacs-active-disasters": {
    config: { metric: "count", threshold_pct: 50.0, window: "1d", window_days: 1, ttl: 3600 },
    collectAll: async () => ({ sources: { count: await fetchSafe(async () => {
      const r = await fetch("https://www.gdacs.org/gdacsapi/api/events/geteventlist/SEARCH?limit=100");
      if (!r.ok) throw new Error("http_" + r.status);
      const j = await r.json();
      const features = j?.features;
      if (!Array.isArray(features)) throw new Error("no_features");
      return features.length;
    }) } }),
  },
  "geonet-nz-felt-quakes": {
    config: { metric: "count", threshold_pct: 30.0, window: "1d", window_days: 1, ttl: 3600 },
    collectAll: async () => ({ sources: { count: await fetchSafe(async () => {
      const r = await fetch("https://api.geonet.org.nz/quake?MMI=4");
      if (!r.ok) throw new Error("http_" + r.status);
      const j = await r.json();
      const features = j?.features;
      if (!Array.isArray(features)) throw new Error("no_features");
      return features.length;
    }) } }),
  },
  "idigbio-total-specimens": {
    config: { metric: "count", threshold_pct: 1.0, window: "30d", window_days: 30, ttl: 604800 },
    collectAll: async () => ({ sources: { count: await fetchSafe(async () => {
      const r = await fetch("https://search.idigbio.org/v2/search/records/?limit=1");
      if (!r.ok) throw new Error("http_" + r.status);
      const j = await r.json();
      const v = Number(j?.itemCount);
      if (!Number.isFinite(v) || v <= 0) throw new Error("no_itemCount");
      return v;
    }) } }),
  },
  "nhm-london-dataset-count": {
    config: { metric: "count", threshold_pct: 2.0, window: "7d", window_days: 7, ttl: 86400 },
    collectAll: async () => ({ sources: { count: await fetchSafe(async () => {
      const r = await fetch("https://data.nhm.ac.uk/api/3/action/package_search?rows=1");
      if (!r.ok) throw new Error("http_" + r.status);
      const j = await r.json();
      const v = Number(j?.result?.count);
      if (!Number.isFinite(v) || v <= 0) throw new Error("no_count");
      return v;
    }) } }),
  },
  "obis-marine-occurrences": {
    config: { metric: "total", threshold_pct: 4.0, window: "30d", window_days: 30, ttl: 604800 },
    collectAll: async () => ({ sources: { total: await fetchSafe(async () => {
      const r = await fetch("https://api.obis.org/v3/occurrence?size=1");
      if (!r.ok) throw new Error("http_" + r.status);
      const j = await r.json();
      const v = Number(j?.total);
      if (!Number.isFinite(v) || v <= 0) throw new Error("no_total");
      return v;
    }) } }),
  },
  "gleif-total-leis": {
    config: { metric: "total", threshold_pct: 4.0, window: "30d", window_days: 30, ttl: 604800 },
    collectAll: async () => ({ sources: { total: await fetchSafe(async () => {
      const r = await fetch("https://api.gleif.org/api/v1/lei-records?page%5Bsize%5D=1",
        { headers: { "user-agent": "VolatiAI/1.0 (admin@fourieranalys.se)" } });
      if (!r.ok) throw new Error("http_" + r.status);
      const j = await r.json();
      const v = Number(j?.meta?.pagination?.total);
      if (!Number.isFinite(v) || v <= 0) throw new Error("no_total");
      return v;
    }) } }),
  },
  "sec-aapl-filings-30d": {
    config: { metric: "count", threshold_pct: 50.0, window: "30d", window_days: 30, ttl: 86400 },
    collectAll: async () => ({ sources: { count: await fetchSafe(async () => {
      const r = await fetch("https://data.sec.gov/submissions/CIK0000320193.json",
        { headers: { "user-agent": "VolatiAI/1.0 (admin@fourieranalys.se)" } });
      if (!r.ok) throw new Error("http_" + r.status);
      const j = await r.json();
      const dates = j?.filings?.recent?.filingDate;
      if (!Array.isArray(dates)) throw new Error("no_filingDates");
      const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
      const recent = dates.filter(d => d >= cutoff);
      if (recent.length === 0) throw new Error("no_recent");
      return recent.length;
    }) } }),
  },
  "noaa-swpc-kp-index": {
    config: { metric: "kp", threshold_pct: 50.0, window: "1d", window_days: 1, ttl: 3600 },
    collectAll: async () => ({ sources: { kp: await fetchSafe(async () => {
      const r = await fetch("https://services.swpc.noaa.gov/products/noaa-planetary-k-index.json");
      if (!r.ok) throw new Error("http_" + r.status);
      const j = await r.json();
      if (!Array.isArray(j) || j.length === 0) throw new Error("no_data");
      const last = j[j.length - 1];
      const v = Number(last?.Kp);
      if (!Number.isFinite(v)) throw new Error("no_kp");
      return v;
    }) } }),
  },
  "bfs-swiss-dataset-count": {
    config: { metric: "count", threshold_pct: 2.0, window: "30d", window_days: 30, ttl: 604800 },
    collectAll: async () => ({ sources: { count: await fetchSafe(async () => {
      const r = await fetch("https://www.pxweb.bfs.admin.ch/api/v1/en/");
      if (!r.ok) throw new Error("http_" + r.status);
      const j = await r.json();
      if (!Array.isArray(j)) throw new Error("not_array");
      return j.length;
    }) } }),
  },
  "avoindata-fi-dataset-count": {
    config: { metric: "count", threshold_pct: 2.0, window: "30d", window_days: 30, ttl: 604800 },
    collectAll: async () => ({ sources: { count: await fetchSafe(async () => {
      const r = await fetch("https://avoindata.fi/data/api/3/action/package_search?rows=1");
      if (!r.ok) throw new Error("http_" + r.status);
      const j = await r.json();
      const v = Number(j?.result?.count);
      if (!Number.isFinite(v) || v <= 0) throw new Error("no_count");
      return v;
    }) } }),
  },
  "datafirst-african-surveys": {
    config: { metric: "total", threshold_pct: 2.0, window: "30d", window_days: 30, ttl: 604800 },
    collectAll: async () => ({ sources: { total: await fetchSafe(async () => {
      const r = await fetch("https://www.datafirst.uct.ac.za/dataportal/index.php/api/catalog?limit=1");
      if (!r.ok) throw new Error("http_" + r.status);
      const j = await r.json();
      const v = Number(j?.result?.total);
      if (!Number.isFinite(v) || v <= 0) throw new Error("no_total");
      return v;
    }) } }),
  },
  "geonet-nz-volcanic-alerts": {
    config: { metric: "count", threshold_pct: 20.0, window: "1d", window_days: 1, ttl: 3600 },
    collectAll: async () => ({ sources: { count: await fetchSafe(async () => {
      const r = await fetch("https://api.geonet.org.nz/volcano/val");
      if (!r.ok) throw new Error("http_" + r.status);
      const j = await r.json();
      const f = j?.features;
      if (!Array.isArray(f)) throw new Error("no_features");
      // Count volcanoes at alert level >= 2 (minor activity or higher)
      const active = f.filter(x => Number(x?.properties?.level) >= 2);
      return active.length;
    }) } }),
  },
  "miso-grid-total-load": {
    config: { metric: "mw", threshold_pct: 15.0, window: "1d", window_days: 1, ttl: 3600 },
    collectAll: async () => ({ sources: { mw: await fetchSafe(async () => {
      const r = await fetch("https://public-api.misoenergy.org/api/FuelMix");
      if (!r.ok) throw new Error("http_" + r.status);
      const j = await r.json();
      const v = Number(j?.TotalMW);
      if (!Number.isFinite(v) || v <= 0) throw new Error("no_total_mw");
      return v;
    }) } }),
  },
  "nws-active-severe-alerts": {
    config: { metric: "count", threshold_pct: 50.0, window: "1d", window_days: 1, ttl: 3600 },
    collectAll: async () => ({ sources: { count: await fetchSafe(async () => {
      const r = await fetch("https://api.weather.gov/alerts/active?severity=Severe",
        { headers: { "user-agent": "VolatiAI/1.0 (admin@fourieranalys.se)" } });
      if (!r.ok) throw new Error("http_" + r.status);
      const j = await r.json();
      const f = j?.features;
      if (!Array.isArray(f)) throw new Error("no_features");
      return f.length;
    }) } }),
  },
  "energinet-dk-carbon-intensity": {
    config: { metric: "gco2_per_kwh", threshold_pct: 50.0, window: "1d", window_days: 1, ttl: 1800 },
    collectAll: async () => ({ sources: { gco2_per_kwh: await fetchSafe(async () => {
      const r = await fetch("https://api.energidataservice.dk/dataset/PowerSystemRightNow?limit=1");
      if (!r.ok) throw new Error("http_" + r.status);
      const j = await r.json();
      const v = Number(j?.records?.[0]?.CO2Emission);
      if (!Number.isFinite(v) || v < 0) throw new Error("no_co2");
      return v;
    }) } }),
  },
  "baltic-wave-height": {
    config: { metric: "m", threshold_pct: 50.0, window: "1d", window_days: 1, ttl: 1800 },
    collectAll: async () => ({ sources: { m: await fetchSafe(async () => {
      const r = await fetch("https://marine-api.open-meteo.com/v1/marine?latitude=54.3&longitude=10.1&current=wave_height");
      if (!r.ok) throw new Error("http_" + r.status);
      const j = await r.json();
      const v = Number(j?.current?.wave_height);
      if (!Number.isFinite(v) || v < 0) throw new Error("no_wave_height");
      return v;
    }) } }),
  },
  "gutendex-english-ebooks": {
    config: { metric: "count", threshold_pct: 2.0, window: "30d", window_days: 30, ttl: 604800 },
    collectAll: async () => ({ sources: { count: await fetchSafe(async () => {
      const r = await fetch("https://gutendex.com/books?languages=en&page=1");
      if (!r.ok) throw new Error("http_" + r.status);
      const j = await r.json();
      const v = Number(j?.count);
      if (!Number.isFinite(v) || v <= 0) throw new Error("no_count");
      return v;
    }) } }),
  },
  "benchgecko-model-count": {
    config: { metric: "model_count", threshold_pct: 5, window: "7d", window_days: 7, ttl: 86400, context_keys: [] },
    async collectAll(env) {
      const r = await fetch("https://benchgecko.ai/api/v1/models?limit=1", { headers: { "User-Agent": "VolatiAI/1.0", "Accept": "application/json" }, signal: AbortSignal.timeout(20000) });
      if (!r.ok) return { value: null, sources: { benchgecko: { ok: false, error: `HTTP ${r.status}` } } };
      const j = await r.json();
      const n = typeof j?.meta?.total === "number" ? j.meta.total : null;
      return { value: n, sources: { benchgecko: { ok: typeof n === "number" } } };
    },
  },
  "faa-uas-facility-grid-count": {
    config: { metric: "grid_cells", threshold_pct: 2, window: "30d", window_days: 30, ttl: 86400, context_keys: [] },
    async collectAll(env) {
      const r = await fetch("https://services6.arcgis.com/ssFJjBXIUyZDrSYZ/arcgis/rest/services/FAA_UAS_FacilityMap_Data_V5/FeatureServer/0/query?where=1%3D1&returnCountOnly=true&f=json", { headers: { "User-Agent": "VolatiAI/1.0" }, signal: AbortSignal.timeout(20000) });
      if (!r.ok) return { value: null, sources: { faa_uas: { ok: false, error: `HTTP ${r.status}` } } };
      const j = await r.json();
      const n = typeof j?.count === "number" ? j.count : null;
      return { value: n, sources: { faa_uas: { ok: typeof n === "number" } } };
    },
  },
  "cbp-border-wait-times": {
    config: { metric: "ports_in_feed", threshold_pct: 10, window: "24h", ttl: 3600, context_keys: [] },
    async collectAll(env) {
      const r = await fetch("https://bwt.cbp.gov/api/bwtnew", { headers: { "User-Agent": "VolatiAI/1.0", "Accept": "application/json" }, signal: AbortSignal.timeout(25000) });
      if (!r.ok) return { value: null, sources: { cbp_bwt: { ok: false, error: `HTTP ${r.status}` } } };
      const j = await r.json();
      const arr = Array.isArray(j) ? j : (Array.isArray(j?.ports) ? j.ports : (Array.isArray(j?.data) ? j.data : null));
      if (!arr) return { value: null, sources: { cbp_bwt: { ok: false, error: "unexpected_shape: keys=" + Object.keys(j || {}).slice(0, 8).join(",") } } };
      return { value: arr.length, sources: { cbp_bwt: { ok: true } } };
    },
  },
  "us-drought-monitor": {
    config: { metric: "drought_area_pct", threshold_pct: 10, window: "7d", window_days: 7, ttl: 86400, context_keys: [] },
    async collectAll(env) {
      const fmt = d => `${d.getUTCMonth() + 1}/${d.getUTCDate()}/${d.getUTCFullYear()}`;
      const start = new Date(Date.now() - 14 * 86400e3);
      const url = "https://usdmdataservices.unl.edu/api/USStatistics/GetDroughtSeverityStatisticsByAreaPercent?aoi=us&startdate=" + fmt(start) + "&enddate=" + fmt(new Date()) + "&statisticsType=1";
      const r = await fetch(url, { headers: { "User-Agent": "VolatiAI/1.0", "Accept": "application/json" }, signal: AbortSignal.timeout(25000) });
      if (!r.ok) return { value: null, sources: { usdm: { ok: false, error: `HTTP ${r.status}` } } };
      const j = await r.json();
      const arr = Array.isArray(j) ? j : (Array.isArray(j?.data) ? j.data : null);
      if (!arr || arr.length === 0) return { value: null, sources: { usdm: { ok: false, error: "unexpected_shape: keys=" + Object.keys(j || {}).slice(0, 8).join(",") } } };
      const last = arr[arr.length - 1];
      const pick = k => typeof last?.[k] === "number" ? last[k] : (typeof last?.[k.toUpperCase()] === "number" ? last[k.toUpperCase()] : null);
      const parts = ["d1", "d2", "d3", "d4"].map(pick);
      if (parts.some(v => v === null)) return { value: null, sources: { usdm: { ok: false, error: "no_d_fields: keys=" + Object.keys(last || {}).join(",") } } };
      const total = parts.reduce((a, b) => a + b, 0);
      return { value: Math.round(total * 100) / 100, sources: { usdm: { ok: true } } };
    },
  },
  "openvan-fuel-countries": {
    config: { metric: "countries_with_lpg", threshold_pct: 10, window: "7d", window_days: 7, ttl: 86400, context_keys: [] },
    async collectAll(env) {
      const r = await fetch("https://openvan.camp/api/fuel/prices", { headers: { "User-Agent": "VolatiAI/1.0", "Accept": "application/json" }, signal: AbortSignal.timeout(25000) });
      if (!r.ok) return { value: null, sources: { openvan: { ok: false, error: `HTTP ${r.status}` } } };
      const j = await r.json();
      const root = j?.data ?? j?.prices ?? j;
      const countries = (root && typeof root === "object" && !Array.isArray(root)) ? Object.values(root) : null;
      if (!countries) return { value: null, sources: { openvan: { ok: false, error: "unexpected_shape: keys=" + Object.keys(j || {}).slice(0, 8).join(",") } } };
      const withLpg = countries.filter(c => c && typeof c === "object" && c.prices && typeof c.prices.lpg === "number" && c.prices.lpg > 0).length;
      return { value: withLpg, sources: { openvan: { ok: true } } };
    },
  },
  "unhcr-displacement": {
    config: { metric: "refugees", threshold_pct: 2, window: "90d", window_days: 90, ttl: 86400, context_keys: [] },
    async collectAll(env) {
      const r = await fetch("https://api.unhcr.org/population/v1/population/?limit=1&year=2024", { headers: { "User-Agent": "VolatiAI/1.0", "Accept": "application/json" }, signal: AbortSignal.timeout(25000) });
      if (!r.ok) return { value: null, sources: { unhcr: { ok: false, error: `HTTP ${r.status}` } } };
      const j = await r.json();
      const n = typeof j?.items?.[0]?.refugees === "number" ? j.items[0].refugees : null;
      return { value: n, sources: { unhcr: { ok: typeof n === "number" } } };
    },
  },
  "cern-opendata-records": {
    config: { metric: "record_count", threshold_pct: 1, window: "30d", window_days: 30, ttl: 86400, context_keys: [] },
    async collectAll(env) {
      const r = await fetch("https://opendata.cern.ch/api/records/?size=1", { headers: { "User-Agent": "VolatiAI/1.0", "Accept": "application/json" }, signal: AbortSignal.timeout(25000) });
      if (!r.ok) return { value: null, sources: { cern_opendata: { ok: false, error: `HTTP ${r.status}` } } };
      const j = await r.json();
      const n = typeof j?.aggregations?.availability?.doc_count === "number" ? j.aggregations.availability.doc_count : null;
      return { value: n, sources: { cern_opendata: { ok: typeof n === "number" } } };
    },
  },
  "digitraffic-port-calls": {
    config: { metric: "port_call_records", threshold_pct: 15, window: "24h", ttl: 1800, context_keys: [] },
    async collectAll(env) {
      const r = await fetch("https://meri.digitraffic.fi/api/port-call/v1/port-calls", { headers: { "User-Agent": "VolatiAI/1.0", "Accept": "application/json" }, signal: AbortSignal.timeout(25000) });
      if (!r.ok) return { value: null, sources: { digitraffic: { ok: false, error: `HTTP ${r.status}` } } };
      const j = await r.json();
      const n = Array.isArray(j?.portCalls) ? j.portCalls.length : null;
      return { value: n, sources: { digitraffic: { ok: typeof n === "number" } } };
    },
  },
  "nrc-reactor-availability": {
    config: { metric: "fleet_availability_pct", threshold_pct: 5, window: "7d", window_days: 7, ttl: 86400, context_keys: [] },
    async collectAll(env) {
      const r = await fetch("https://nuclearchain.net/api/status.json", { headers: { "User-Agent": "VolatiAI/1.0", "Accept": "application/json" }, signal: AbortSignal.timeout(25000) });
      if (!r.ok) return { value: null, sources: { nrc_reactors: { ok: false, error: `HTTP ${r.status}` } } };
      const j = await r.json();
      const n = typeof j?.summary?.fleet_availability_pct === "number" ? j.summary.fleet_availability_pct : null;
      return { value: n, sources: { nrc_reactors: { ok: typeof n === "number" } } };
    },
  },
  "critical-materials-atlas": {
    config: { metric: "materials_tracked", threshold_pct: 5, window: "30d", window_days: 30, ttl: 86400, context_keys: [] },
    async collectAll(env) {
      const r = await fetch("https://criticalmaterialsatlas.org/out/cube_summary.json", { headers: { "User-Agent": "VolatiAI/1.0", "Accept": "application/json" }, signal: AbortSignal.timeout(25000) });
      if (!r.ok) return { value: null, sources: { cma: { ok: false, error: `HTTP ${r.status}` } } };
      const j = await r.json();
      const n = typeof j?.materials === "number" ? j.materials : null;
      return { value: n, sources: { cma: { ok: typeof n === "number" } } };
    },
  },
  "sec-aapl-quarterly-revenue": {
    config: { metric: "quarterly_revenue_usd", threshold_pct: 5, window: "7d", window_days: 7, ttl: 86400, context_keys: ["company"] },
    async collectAll(env) {
      const r = await fetch("https://data.sec.gov/api/xbrl/companyfacts/CIK0000320193.json", { headers: { "User-Agent": "VolatiAI/1.0 (compliance@volatiai.local)", "Accept": "application/json" }, signal: AbortSignal.timeout(25000) });
      if (!r.ok) return { value: null, sources: { sec_xbrl: { ok: false, error: `HTTP ${r.status}` } } };
      const j = await r.json();
      const facts = j?.facts?.["us-gaap"];
      const tags = ["RevenueFromContractWithCustomerExcludingAssessedTax", "Revenues", "RevenueFromContractWithCustomerIncludingAssessedTax"];
      let best = null;
      for (const tag of tags) {
        const entries = facts?.[tag]?.units?.USD;
        if (!Array.isArray(entries)) continue;
        for (const e of entries) {
          if (!e.start || !e.end || typeof e.val !== "number") continue;
          const days = (new Date(e.end).getTime() - new Date(e.start).getTime()) / 86400000;
          if (days < 80 || days > 100) continue;
          if (!best || e.end > best.end) best = e;
        }
        if (best) break;
      }
      const n = typeof best?.val === "number" ? best.val : null;
      return { value: n, sources: { sec_xbrl: { ok: typeof n === "number" } }, context: { company: "Apple Inc.", period_end: best?.end ?? null, form: best?.form ?? null } };
    },
  },
  "sec-msft-quarterly-revenue": {
    config: { metric: "quarterly_revenue_usd", threshold_pct: 5, window: "7d", window_days: 7, ttl: 86400, context_keys: ["company"] },
    async collectAll(env) {
      const r = await fetch("https://data.sec.gov/api/xbrl/companyfacts/CIK0000789019.json", { headers: { "User-Agent": "VolatiAI/1.0 (compliance@volatiai.local)", "Accept": "application/json" }, signal: AbortSignal.timeout(25000) });
      if (!r.ok) return { value: null, sources: { sec_xbrl: { ok: false, error: `HTTP ${r.status}` } } };
      const j = await r.json();
      const facts = j?.facts?.["us-gaap"];
      const tags = ["RevenueFromContractWithCustomerExcludingAssessedTax", "Revenues", "RevenueFromContractWithCustomerIncludingAssessedTax"];
      let best = null;
      for (const tag of tags) {
        const entries = facts?.[tag]?.units?.USD;
        if (!Array.isArray(entries)) continue;
        for (const e of entries) {
          if (!e.start || !e.end || typeof e.val !== "number") continue;
          const days = (new Date(e.end).getTime() - new Date(e.start).getTime()) / 86400000;
          if (days < 80 || days > 100) continue;
          if (!best || e.end > best.end) best = e;
        }
        if (best) break;
      }
      const n = typeof best?.val === "number" ? best.val : null;
      return { value: n, sources: { sec_xbrl: { ok: typeof n === "number" } }, context: { company: "Microsoft Corp.", period_end: best?.end ?? null, form: best?.form ?? null } };
    },
  },
  "sec-nvda-quarterly-revenue": {
    config: { metric: "quarterly_revenue_usd", threshold_pct: 5, window: "7d", window_days: 7, ttl: 86400, context_keys: ["company"] },
    async collectAll(env) {
      const r = await fetch("https://data.sec.gov/api/xbrl/companyfacts/CIK0001045810.json", { headers: { "User-Agent": "VolatiAI/1.0 (compliance@volatiai.local)", "Accept": "application/json" }, signal: AbortSignal.timeout(25000) });
      if (!r.ok) return { value: null, sources: { sec_xbrl: { ok: false, error: `HTTP ${r.status}` } } };
      const j = await r.json();
      const facts = j?.facts?.["us-gaap"];
      const tags = ["RevenueFromContractWithCustomerExcludingAssessedTax", "Revenues", "RevenueFromContractWithCustomerIncludingAssessedTax"];
      let best = null;
      for (const tag of tags) {
        const entries = facts?.[tag]?.units?.USD;
        if (!Array.isArray(entries)) continue;
        for (const e of entries) {
          if (!e.start || !e.end || typeof e.val !== "number") continue;
          const days = (new Date(e.end).getTime() - new Date(e.start).getTime()) / 86400000;
          if (days < 80 || days > 100) continue;
          if (!best || e.end > best.end) best = e;
        }
        if (best) break;
      }
      const n = typeof best?.val === "number" ? best.val : null;
      return { value: n, sources: { sec_xbrl: { ok: typeof n === "number" } }, context: { company: "NVIDIA Corp.", period_end: best?.end ?? null, form: best?.form ?? null } };
    },
  },
  "sec-jpm-quarterly-revenue": {
    config: { metric: "quarterly_revenue_usd", threshold_pct: 5, window: "7d", window_days: 7, ttl: 86400, context_keys: ["company"] },
    async collectAll(env) {
      const r = await fetch("https://data.sec.gov/api/xbrl/companyfacts/CIK0000019617.json", { headers: { "User-Agent": "VolatiAI/1.0 (compliance@volatiai.local)", "Accept": "application/json" }, signal: AbortSignal.timeout(25000) });
      if (!r.ok) return { value: null, sources: { sec_xbrl: { ok: false, error: `HTTP ${r.status}` } } };
      const j = await r.json();
      const facts = j?.facts?.["us-gaap"];
      const tags = ["RevenueFromContractWithCustomerExcludingAssessedTax", "Revenues", "RevenueFromContractWithCustomerIncludingAssessedTax"];
      let best = null;
      for (const tag of tags) {
        const entries = facts?.[tag]?.units?.USD;
        if (!Array.isArray(entries)) continue;
        for (const e of entries) {
          if (!e.start || !e.end || typeof e.val !== "number") continue;
          const days = (new Date(e.end).getTime() - new Date(e.start).getTime()) / 86400000;
          if (days < 80 || days > 100) continue;
          if (!best || e.end > best.end) best = e;
        }
        if (best) break;
      }
      const n = typeof best?.val === "number" ? best.val : null;
      return { value: n, sources: { sec_xbrl: { ok: typeof n === "number" } }, context: { company: "JPMorgan Chase & Co.", period_end: best?.end ?? null, form: best?.form ?? null } };
    },
  },
  "dribba-jobs-count": {
    config: { metric: "open_jobs", threshold_pct: 20, window: "7d", window_days: 7, ttl: 86400, context_keys: [] },
    async collectAll(env) {
      const r = await fetch("https://dribba.com/api/v1/jobs", { headers: { "User-Agent": "VolatiAI/1.0", "Accept": "application/json" }, signal: AbortSignal.timeout(20000) });
      if (!r.ok) return { value: null, sources: { dribba: { ok: false, error: `HTTP ${r.status}` } } };
      const j = await r.json();
      const n = typeof j?.total === "number" ? j.total : (Array.isArray(j?.items) ? j.items.length : null);
      return { value: n, sources: { dribba: { ok: typeof n === "number" } } };
    },
  },
  "wikimedia-chatgpt-pageviews": {
    config: { metric: "weekly_views", threshold_pct: 20, window: "7d", window_days: 7, ttl: 86400, context_keys: ["article"] },
    async collectAll(env) {
      const end = new Date();
      const start = new Date(Date.now() - 7 * 86400e3);
      const fmt = d => d.toISOString().slice(0, 10).replace(/-/g, "");
      const url = "https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article/en.wikipedia/all-access/user/ChatGPT/daily/" + fmt(start) + "/" + fmt(end);
      const r = await fetch(url, { headers: { "User-Agent": "VolatiAI/1.0 (contact@volatiai.local)", "Accept": "application/json" }, signal: AbortSignal.timeout(20000) });
      if (!r.ok) return { value: null, sources: { wikimedia: { ok: false, error: `HTTP ${r.status}` } } };
      const j = await r.json();
      const items = Array.isArray(j?.items) ? j.items : null;
      if (!items) return { value: null, sources: { wikimedia: { ok: false, error: "no_items" } } };
      const total = items.reduce((a, x) => a + (typeof x.views === "number" ? x.views : 0), 0);
      return { value: total, sources: { wikimedia: { ok: true } }, context: { article: "ChatGPT", days: items.length } };
    },
  },
  "github-google-repo-count": {
    config: { metric: "public_repos", threshold_pct: 5, window: "30d", window_days: 30, ttl: 86400, context_keys: ["org"] },
    async collectAll(env) {
      const r = await fetch("https://api.github.com/search/repositories?q=org:google&per_page=1", { headers: ghHeaders(env), signal: AbortSignal.timeout(20000) });
      if (!r.ok) return { value: null, sources: { github: { ok: false, error: `HTTP ${r.status}` } } };
      const j = await r.json();
      const n = typeof j?.total_count === "number" ? j.total_count : null;
      return { value: n, sources: { github: { ok: typeof n === "number" } }, context: { org: "google" } };
    },
  },
  "npm-nextjs-weekly-downloads": {
    config: { metric: "weekly_downloads", threshold_pct: 10, window: "7d", window_days: 7, ttl: 86400, context_keys: ["package"] },
    async collectAll(env) {
      const r = await fetch("https://api.npmjs.org/downloads/point/last-week/next", { headers: { "User-Agent": "VolatiAI/1.0", "Accept": "application/json" }, signal: AbortSignal.timeout(20000) });
      if (!r.ok) return { value: null, sources: { npm: { ok: false, error: `HTTP ${r.status}` } } };
      const j = await r.json();
      const n = typeof j?.downloads === "number" ? j.downloads : null;
      return { value: n, sources: { npm: { ok: typeof n === "number" } }, context: { package: "next" } };
    },
  },
  "crates-tokio-downloads": {
    config: { metric: "total_downloads", threshold_pct: 5, window: "30d", window_days: 30, ttl: 86400, context_keys: ["crate"] },
    async collectAll(env) {
      const r = await fetch("https://crates.io/api/v1/crates/tokio", { headers: { "User-Agent": "VolatiAI/1.0 (contact@volatiai.local)", "Accept": "application/json" }, signal: AbortSignal.timeout(20000) });
      if (!r.ok) return { value: null, sources: { crates_io: { ok: false, error: `HTTP ${r.status}` } } };
      const j = await r.json();
      const n = typeof j?.crate?.downloads === "number" ? j.crate.downloads : null;
      return { value: n, sources: { crates_io: { ok: typeof n === "number" } }, context: { crate: "tokio" } };
    },
  },
  "github-apple-repo-count": {
    config: { metric: "public_repos", threshold_pct: 5, window: "30d", window_days: 30, ttl: 86400, context_keys: ["org"] },
    async collectAll(env) {
      const r = await fetch("https://api.github.com/search/repositories?q=org:apple&per_page=1", { headers: ghHeaders(env), signal: AbortSignal.timeout(20000) });
      if (!r.ok) return { value: null, sources: { github: { ok: false, error: `HTTP ${r.status}` } } };
      const j = await r.json();
      const n = typeof j?.total_count === "number" ? j.total_count : null;
      return { value: n, sources: { github: { ok: typeof n === "number" } }, context: { org: "apple" } };
    },
  },
  "github-android-repo-count": {
    config: { metric: "public_repos", threshold_pct: 5, window: "30d", window_days: 30, ttl: 86400, context_keys: ["org"] },
    async collectAll(env) {
      const r = await fetch("https://api.github.com/search/repositories?q=org:android&per_page=1", { headers: ghHeaders(env), signal: AbortSignal.timeout(20000) });
      if (!r.ok) return { value: null, sources: { github: { ok: false, error: `HTTP ${r.status}` } } };
      const j = await r.json();
      const n = typeof j?.total_count === "number" ? j.total_count : null;
      return { value: n, sources: { github: { ok: typeof n === "number" } }, context: { org: "android" } };
    },
  },
  "github-microsoft-repo-count": {
    config: { metric: "public_repos", threshold_pct: 5, window: "30d", window_days: 30, ttl: 86400, context_keys: ["org"] },
    async collectAll(env) {
      const r = await fetch("https://api.github.com/search/repositories?q=org:microsoft&per_page=1", { headers: ghHeaders(env), signal: AbortSignal.timeout(20000) });
      if (!r.ok) return { value: null, sources: { github: { ok: false, error: `HTTP ${r.status}` } } };
      const j = await r.json();
      const n = typeof j?.total_count === "number" ? j.total_count : null;
      return { value: n, sources: { github: { ok: typeof n === "number" } }, context: { org: "microsoft" } };
    },
  },
  "github-linux-kernel-stars": {
    config: { metric: "stargazers", threshold_pct: 3, window: "30d", window_days: 30, ttl: 86400, context_keys: ["repo"] },
    async collectAll(env) {
      const r = await fetch("https://api.github.com/search/repositories?q=repo:torvalds/linux&per_page=1", { headers: ghHeaders(env), signal: AbortSignal.timeout(20000) });
      if (!r.ok) { const err = await r.text(); return { value: null, sources: { github: { ok: false, error: `HTTP ${r.status}: ${err.slice(0, 120)}` } } }; }
      const j = await r.json();
      const n = typeof j?.items?.[0]?.stargazers_count === "number" ? j.items[0].stargazers_count : null;
      return { value: n, sources: { github: { ok: typeof n === "number" } }, context: { repo: "torvalds/linux" } };
    },
  },
  "crates-io-total-crates": {
    config: { metric: "total_crates", threshold_pct: 2, window: "30d", window_days: 30, ttl: 86400, context_keys: [] },
    async collectAll(env) {
      const r = await fetch("https://crates.io/api/v1/summary", { headers: { "User-Agent": "VolatiAI/1.0 (contact@volatiai.local)", "Accept": "application/json" }, signal: AbortSignal.timeout(20000) });
      if (!r.ok) return { value: null, sources: { crates_io: { ok: false, error: `HTTP ${r.status}` } } };
      const j = await r.json();
      const n = typeof j?.num_crates === "number" ? j.num_crates : null;
      return { value: n, sources: { crates_io: { ok: typeof n === "number" } } };
    },
  },
  "github-solidity-repo-count": {
    config: { metric: "public_repos", threshold_pct: 3, window: "30d", window_days: 30, ttl: 86400, context_keys: ["language"] },
    async collectAll(env) {
      const r = await fetch("https://api.github.com/search/repositories?q=language:Solidity&per_page=1", { headers: ghHeaders(env), signal: AbortSignal.timeout(20000) });
      if (!r.ok) return { value: null, sources: { github: { ok: false, error: `HTTP ${r.status}` } } };
      const j = await r.json();
      const n = typeof j?.total_count === "number" ? j.total_count : null;
      return { value: n, sources: { github: { ok: typeof n === "number" } }, context: { language: "Solidity" } };
    },
  },
  "github-cpp-repo-count": {
    config: { metric: "public_repos", threshold_pct: 3, window: "30d", window_days: 30, ttl: 86400, context_keys: ["language"] },
    async collectAll(env) {
      const r = await fetch("https://api.github.com/search/repositories?q=language:C%2B%2B&per_page=1", { headers: ghHeaders(env), signal: AbortSignal.timeout(20000) });
      if (!r.ok) return { value: null, sources: { github: { ok: false, error: `HTTP ${r.status}` } } };
      const j = await r.json();
      const n = typeof j?.total_count === "number" ? j.total_count : null;
      return { value: n, sources: { github: { ok: typeof n === "number" } }, context: { language: "C++" } };
    },
  },
  "github-haskell-repo-count": {
    config: { metric: "public_repos", threshold_pct: 3, window: "30d", window_days: 30, ttl: 86400, context_keys: ["language"] },
    async collectAll(env) {
      const r = await fetch("https://api.github.com/search/repositories?q=language:Haskell&per_page=1", { headers: ghHeaders(env), signal: AbortSignal.timeout(20000) });
      if (!r.ok) return { value: null, sources: { github: { ok: false, error: `HTTP ${r.status}` } } };
      const j = await r.json();
      const n = typeof j?.total_count === "number" ? j.total_count : null;
      return { value: n, sources: { github: { ok: typeof n === "number" } }, context: { language: "Haskell" } };
    },
  },
  "packagist-laravel-downloads": {
    config: { metric: "total_downloads", threshold_pct: 10, window: "30d", window_days: 30, ttl: 86400, context_keys: ["package"] },
    async collectAll(env) {
      const r = await fetch("https://packagist.org/packages/laravel/framework.json", { headers: { "User-Agent": "VolatiAI/1.0", "Accept": "application/json" }, signal: AbortSignal.timeout(20000) });
      if (!r.ok) return { value: null, sources: { packagist: { ok: false, error: `HTTP ${r.status}` } } };
      const j = await r.json();
      const n = typeof j?.package?.downloads?.total === "number" ? j.package.downloads.total : null;
      return { value: n, sources: { packagist: { ok: typeof n === "number" } }, context: { package: "laravel/framework" } };
    },
  },
  "maven-kotlin-artifact-count": {
    config: { metric: "kotlin_artifacts", threshold_pct: 5, window: "30d", window_days: 30, ttl: 86400, context_keys: ["group"] },
    async collectAll(env) {
      const r = await fetch("https://search.maven.org/solrsearch/select?q=g:org.jetbrains.kotlin&rows=0&wt=json", { headers: { "User-Agent": "VolatiAI/1.0", "Accept": "application/json" }, signal: AbortSignal.timeout(20000) });
      if (!r.ok) return { value: null, sources: { maven_central: { ok: false, error: `HTTP ${r.status}` } } };
      const j = await r.json();
      const n = typeof j?.response?.numFound === "number" ? j.response.numFound : null;
      return { value: n, sources: { maven_central: { ok: typeof n === "number" } }, context: { group: "org.jetbrains.kotlin" } };
    },
  },
  "go-module-publishes-24h": {
    config: { metric: "new_versions_24h", threshold_pct: 20, window: "24h", ttl: 3600, context_keys: [] },
    async collectAll(env) {
      const since = new Date(Date.now() - 24 * 3600e3).toISOString();
      const r = await fetch("https://index.golang.org/index?since=" + encodeURIComponent(since) + "&limit=2000", { headers: { "User-Agent": "VolatiAI/1.0", "Accept": "application/json" }, signal: AbortSignal.timeout(25000) });
      if (!r.ok) return { value: null, sources: { go_index: { ok: false, error: `HTTP ${r.status}` } } };
      const text = await r.text();
      const lines = text.split("\n").filter(l => l.trim().length > 0);
      return { value: lines.length, sources: { go_index: { ok: true } }, context: { capped: lines.length === 2000 } };
    },
  },
  "nuget-package-count": {
    config: { metric: "total_packages", threshold_pct: 2, window: "30d", window_days: 30, ttl: 86400, context_keys: [] },
    async collectAll(env) {
      const r = await fetch("https://azuresearch-usnc.nuget.org/query?q=*&take=1", { headers: { "User-Agent": "VolatiAI/1.0", "Accept": "application/json" }, signal: AbortSignal.timeout(20000) });
      if (!r.ok) return { value: null, sources: { nuget: { ok: false, error: `HTTP ${r.status}` } } };
      const j = await r.json();
      const n = typeof j?.totalHits === "number" ? j.totalHits : null;
      return { value: n, sources: { nuget: { ok: typeof n === "number" } } };
    },
  },
  "cpan-release-count": {
    config: { metric: "total_releases", threshold_pct: 2, window: "30d", window_days: 30, ttl: 86400, context_keys: [] },
    async collectAll(env) {
      const r = await fetch("https://fastapi.metacpan.org/v1/release/_search?q=status:latest&size=0", { headers: { "User-Agent": "VolatiAI/1.0", "Accept": "application/json" }, signal: AbortSignal.timeout(20000) });
      if (!r.ok) return { value: null, sources: { cpan: { ok: false, error: `HTTP ${r.status}` } } };
      const j = await r.json();
      const n = typeof j?.hits?.total === "number" ? j.hits.total : (typeof j?.hits?.total?.value === "number" ? j.hits.total.value : null);
      return { value: n, sources: { cpan: { ok: typeof n === "number" } } };
    },
  },
  "cran-package-count": {
    config: { metric: "total_packages", threshold_pct: 2, window: "30d", window_days: 30, ttl: 86400, context_keys: [] },
    async collectAll(env) {
      const r = await fetch("https://cran.r-project.org/src/contrib/PACKAGES", { headers: { "User-Agent": "VolatiAI/1.0" }, signal: AbortSignal.timeout(25000) });
      if (!r.ok) return { value: null, sources: { cran: { ok: false, error: `HTTP ${r.status}` } } };
      const text = await r.text();
      const n = (text.match(/^Package:/gm) || []).length;
      return { value: n, sources: { cran: { ok: n > 0 } } };
    },
  },
  "clojars-artifact-count": {
    config: { metric: "matching_artifacts", threshold_pct: 5, window: "30d", window_days: 30, ttl: 86400, context_keys: ["query"] },
    async collectAll(env) {
      const r = await fetch("https://clojars.org/search?format=json&q=clojure", { headers: { "User-Agent": "VolatiAI/1.0", "Accept": "application/json" }, signal: AbortSignal.timeout(20000) });
      if (!r.ok) return { value: null, sources: { clojars: { ok: false, error: `HTTP ${r.status}` } } };
      const j = await r.json();
      const n = typeof j?.count === "number" ? j.count : (typeof j?.total === "number" ? j.total : (Array.isArray(j?.results) ? j.results.length : null));
      return { value: n, sources: { clojars: { ok: typeof n === "number" } }, context: { query: "clojure" } };
    },
  },
  "hex-phoenix-downloads": {
    config: { metric: "total_downloads", threshold_pct: 5, window: "30d", window_days: 30, ttl: 86400, context_keys: ["package"] },
    async collectAll(env) {
      const r = await fetch("https://hex.pm/api/packages/phoenix", { headers: { "User-Agent": "VolatiAI/1.0", "Accept": "application/json" }, signal: AbortSignal.timeout(20000) });
      if (!r.ok) return { value: null, sources: { hex: { ok: false, error: `HTTP ${r.status}` } } };
      const j = await r.json();
      const n = typeof j?.downloads?.all === "number" ? j.downloads.all : null;
      return { value: n, sources: { hex: { ok: typeof n === "number" } }, context: { package: "phoenix" } };
    },
  },
  "maven-scala-artifact-count": {
    config: { metric: "scala_artifacts", threshold_pct: 5, window: "30d", window_days: 30, ttl: 86400, context_keys: ["group"] },
    async collectAll(env) {
      const r = await fetch("https://search.maven.org/solrsearch/select?q=g:org.scala-lang&rows=0&wt=json", { headers: { "User-Agent": "VolatiAI/1.0", "Accept": "application/json" }, signal: AbortSignal.timeout(20000) });
      if (!r.ok) return { value: null, sources: { maven_scala: { ok: false, error: `HTTP ${r.status}` } } };
      const j = await r.json();
      const n = typeof j?.response?.numFound === "number" ? j.response.numFound : null;
      return { value: n, sources: { maven_scala: { ok: typeof n === "number" } }, context: { group: "org.scala-lang" } };
    },
  },
  "github-ocaml-repo-count": {
    config: { metric: "public_repos", threshold_pct: 3, window: "30d", window_days: 30, ttl: 86400, context_keys: ["language"] },
    async collectAll(env) {
      const r = await fetch("https://api.github.com/search/repositories?q=language:OCaml&per_page=1", { headers: ghHeaders(env), signal: AbortSignal.timeout(20000) });
      if (!r.ok) return { value: null, sources: { github: { ok: false, error: `HTTP ${r.status}` } } };
      const j = await r.json();
      const n = typeof j?.total_count === "number" ? j.total_count : null;
      return { value: n, sources: { github: { ok: typeof n === "number" } }, context: { language: "OCaml" } };
    },
  },
  "github-nim-repo-count": {
    config: { metric: "public_repos", threshold_pct: 3, window: "30d", window_days: 30, ttl: 86400, context_keys: ["language"] },
    async collectAll(env) {
      const r = await fetch("https://api.github.com/search/repositories?q=language:Nim&per_page=1", { headers: ghHeaders(env), signal: AbortSignal.timeout(20000) });
      if (!r.ok) return { value: null, sources: { github: { ok: false, error: `HTTP ${r.status}` } } };
      const j = await r.json();
      const n = typeof j?.total_count === "number" ? j.total_count : null;
      return { value: n, sources: { github: { ok: typeof n === "number" } }, context: { language: "Nim" } };
    },
  },
  "github-julia-repo-count": {
    config: { metric: "public_repos", threshold_pct: 3, window: "30d", window_days: 30, ttl: 86400, context_keys: ["language"] },
    async collectAll(env) {
      const r = await fetch("https://api.github.com/search/repositories?q=language:Julia&per_page=1", { headers: ghHeaders(env), signal: AbortSignal.timeout(20000) });
      if (!r.ok) return { value: null, sources: { github: { ok: false, error: `HTTP ${r.status}` } } };
      const j = await r.json();
      const n = typeof j?.total_count === "number" ? j.total_count : null;
      return { value: n, sources: { github: { ok: typeof n === "number" } }, context: { language: "Julia" } };
    },
  },
  "hackernews-ai-story-count": {
    config: { metric: "matching_stories", threshold_pct: 20, window: "7d", window_days: 7, ttl: 3600, context_keys: ["query"] },
    async collectAll(env) {
      const r = await fetch("https://hn.algolia.com/api/v1/search?query=AI&tags=story&hitsPerPage=1", { headers: { "User-Agent": "VolatiAI/1.0", "Accept": "application/json" }, signal: AbortSignal.timeout(20000) });
      if (!r.ok) return { value: null, sources: { hn_algolia: { ok: false, error: `HTTP ${r.status}` } } };
      const j = await r.json();
      const n = typeof j?.nbHits === "number" ? j.nbHits : null;
      return { value: n, sources: { hn_algolia: { ok: typeof n === "number" } }, context: { query: "AI" } };
    },
  },
  "mastodon-social-weekly-statuses": {
    config: { metric: "weekly_statuses", threshold_pct: 20, window: "7d", window_days: 7, ttl: 3600, context_keys: ["instance"] },
    async collectAll(env) {
      const r = await fetch("https://mastodon.social/api/v1/instance/activity", { headers: { "User-Agent": "VolatiAI/1.0", "Accept": "application/json" }, signal: AbortSignal.timeout(20000) });
      if (!r.ok) return { value: null, sources: { mastodon: { ok: false, error: `HTTP ${r.status}` } } };
      const j = await r.json();
      const latest = Array.isArray(j) && j.length > 0 ? j[j.length - 1] : null;
      const n = latest && typeof latest.statuses !== "undefined" ? Number(latest.statuses) : null;
      return { value: (typeof n === "number" && Number.isFinite(n)) ? n : null, sources: { mastodon: { ok: typeof n === "number" && Number.isFinite(n) } }, context: { instance: "mastodon.social", week: latest?.week ?? null } };
    },
  },
  "wikipedia-chatgpt-edit-count": {
    config: { metric: "total_edits", threshold_pct: 5, window: "30d", window_days: 30, ttl: 86400, context_keys: ["article"] },
    async collectAll(env) {
      const r = await fetch("https://en.wikipedia.org/w/rest.php/v1/page/ChatGPT/history/counts/edits", { headers: { "User-Agent": "VolatiAI/1.0 (contact@volatiai.local)", "Accept": "application/json" }, signal: AbortSignal.timeout(20000) });
      if (!r.ok) return { value: null, sources: { wikipedia: { ok: false, error: `HTTP ${r.status}` } } };
      const j = await r.json();
      const n = typeof j?.count === "number" ? j.count : (typeof j?.edits === "number" ? j.edits : null);
      return { value: n, sources: { wikipedia: { ok: typeof n === "number" } }, context: { article: "ChatGPT" } };
    },
  },
  "un-comtrade-us-exports": {
    config: { metric: "export_records", threshold_pct: 10, window: "30d", window_days: 30, ttl: 86400, context_keys: ["reporter", "period"] },
    async collectAll(env) {
      const r = await fetch("https://comtradeapi.un.org/public/v1/preview/C/A/HS?reporterCode=842&period=2023&cmdCode=TOTAL&flowCode=X", { headers: { "User-Agent": "VolatiAI/1.0", "Accept": "application/json" }, signal: AbortSignal.timeout(25000) });
      if (!r.ok) return { value: null, sources: { comtrade: { ok: false, error: `HTTP ${r.status}` } } };
      const j = await r.json();
      const data = Array.isArray(j?.data) ? j.data : null;
      if (!data) return { value: null, sources: { comtrade: { ok: false, error: "no_data" } } };
      const total = data.reduce((a, x) => a + (typeof x.primaryValue === "number" ? x.primaryValue : 0), 0);
      return { value: data.length, sources: { comtrade: { ok: true } }, context: { reporter: "USA", period: "2023", records: data.length, total_usd: total } };
    },
  },
  "gleif-lei-count": {
    config: { metric: "total_lei_records", threshold_pct: 1, window: "30d", window_days: 30, ttl: 86400, context_keys: [] },
    async collectAll(env) {
      const r = await fetch("https://api.gleif.org/api/v1/lei-records?page[size]=1", { headers: { "User-Agent": "VolatiAI/1.0", "Accept": "application/vnd.api+json" }, signal: AbortSignal.timeout(20000) });
      if (!r.ok) return { value: null, sources: { gleif: { ok: false, error: `HTTP ${r.status}` } } };
      const j = await r.json();
      const n = typeof j?.meta?.pagination?.total === "number" ? j.meta.pagination.total : null;
      return { value: n, sources: { gleif: { ok: typeof n === "number" } } };
    },
  },
  "brreg-norway-company-count": {
    config: { metric: "registered_entities", threshold_pct: 2, window: "30d", window_days: 30, ttl: 86400, context_keys: [] },
    async collectAll(env) {
      const r = await fetch("https://data.brreg.no/enhetsregisteret/api/enheter?size=1", { headers: { "User-Agent": "VolatiAI/1.0", "Accept": "application/json" }, signal: AbortSignal.timeout(20000) });
      if (!r.ok) return { value: null, sources: { brreg: { ok: false, error: `HTTP ${r.status}` } } };
      const j = await r.json();
      const n = typeof j?.page?.totalElements === "number" ? j.page.totalElements : null;
      return { value: n, sources: { brreg: { ok: typeof n === "number" } } };
    },
  },
  "worldbank-remittances": {
    config: { metric: "remittance_inflows_usd", threshold_pct: 10, window: "365d", window_days: 365, ttl: 86400, context_keys: ["country", "year"] },
    async collectAll(env) {
      const r = await fetch("https://api.worldbank.org/v2/country/US/indicator/BX.TRF.PWKR.CD.DT?format=json&per_page=1&date=2023", { headers: { "User-Agent": "VolatiAI/1.0", "Accept": "application/json" }, signal: AbortSignal.timeout(20000) });
      if (!r.ok) return { value: null, sources: { worldbank: { ok: false, error: `HTTP ${r.status}` } } };
      const j = await r.json();
      const v = Array.isArray(j) && Array.isArray(j[1]) && j[1][0] ? j[1][0].value : null;
      const n = typeof v === "number" ? v : null;
      return { value: n, sources: { worldbank: { ok: typeof n === "number" } }, context: { country: "USA", year: "2023" } };
    },
  },
  "worldbank-internet-users": {
    config: { metric: "internet_users_pct", threshold_pct: 2, window: "365d", window_days: 365, ttl: 86400, context_keys: ["country", "year"] },
    async collectAll(env) {
      const r = await fetch("https://api.worldbank.org/v2/country/US/indicator/IT.NET.USER.ZS?format=json&per_page=1&date=2023", { headers: { "User-Agent": "VolatiAI/1.0", "Accept": "application/json" }, signal: AbortSignal.timeout(20000) });
      if (!r.ok) return { value: null, sources: { worldbank: { ok: false, error: `HTTP ${r.status}` } } };
      const j = await r.json();
      const v = Array.isArray(j) && Array.isArray(j[1]) && j[1][0] ? j[1][0].value : null;
      const n = typeof v === "number" ? v : null;
      return { value: n, sources: { worldbank: { ok: typeof n === "number" } }, context: { country: "USA", year: "2023" } };
    },
  },
  "worldbank-urban-population": {
    config: { metric: "urban_population_pct", threshold_pct: 1, window: "365d", window_days: 365, ttl: 86400, context_keys: ["country", "year"] },
    async collectAll(env) {
      const r = await fetch("https://api.worldbank.org/v2/country/US/indicator/SP.URB.TOTL.IN.ZS?format=json&per_page=1&date=2023", { headers: { "User-Agent": "VolatiAI/1.0", "Accept": "application/json" }, signal: AbortSignal.timeout(20000) });
      if (!r.ok) return { value: null, sources: { worldbank: { ok: false, error: `HTTP ${r.status}` } } };
      const j = await r.json();
      const v = Array.isArray(j) && Array.isArray(j[1]) && j[1][0] ? j[1][0].value : null;
      const n = typeof v === "number" ? v : null;
      return { value: n, sources: { worldbank: { ok: typeof n === "number" } }, context: { country: "USA", year: "2023" } };
    },
  },
  "noaa-ndbc-active-stations": {
    config: { metric: "active_buoys", threshold_pct: 2, window: "30d", window_days: 30, ttl: 86400, context_keys: [] },
    async collectAll(env) {
      const r = await fetch("https://www.ndbc.noaa.gov/activestations.xml", { headers: { "User-Agent": "VolatiAI/1.0" }, signal: AbortSignal.timeout(20000) });
      if (!r.ok) return { value: null, sources: { ndbc: { ok: false, error: `HTTP ${r.status}` } } };
      const text = await r.text();
      const n = (text.match(/<station\b/g) || []).length;
      return { value: n > 0 ? n : null, sources: { ndbc: { ok: n > 0 } } };
    },
  },
  "defillama-total-tvl": {
    config: { metric: "total_chain_tvl_usd", threshold_pct: 10, window: "7d", window_days: 7, ttl: 3600, context_keys: [] },
    async collectAll(env) {
      const r = await fetch("https://api.llama.fi/v2/chains", { headers: { "User-Agent": "VolatiAI/1.0", "Accept": "application/json" }, signal: AbortSignal.timeout(25000) });
      if (!r.ok) return { value: null, sources: { defillama: { ok: false, error: `HTTP ${r.status}` } } };
      const j = await r.json();
      const n = Array.isArray(j) ? j.reduce((a, c) => a + (typeof c.tvl === "number" ? c.tvl : 0), 0) : null;
      return { value: n, sources: { defillama: { ok: typeof n === "number" } } };
    },
  },
  "defillama-chains-with-tvl": {
    config: { metric: "chains_count", threshold_pct: 2, window: "30d", window_days: 30, ttl: 86400, context_keys: [] },
    async collectAll(env) {
      const r = await fetch("https://api.llama.fi/v2/chains", { headers: { "User-Agent": "VolatiAI/1.0", "Accept": "application/json" }, signal: AbortSignal.timeout(25000) });
      if (!r.ok) return { value: null, sources: { defillama: { ok: false, error: `HTTP ${r.status}` } } };
      const j = await r.json();
      const n = Array.isArray(j) ? j.filter(c => typeof c.tvl === "number" && c.tvl > 0).length : null;
      return { value: n, sources: { defillama: { ok: typeof n === "number" } } };
    },
  },
  "defillama-stablecoin-supply": {
    config: { metric: "total_circulating_usd", threshold_pct: 5, window: "7d", window_days: 7, ttl: 3600, context_keys: [] },
    async collectAll(env) {
      const r = await fetch("https://stablecoins.llama.fi/stablecoins", { headers: { "User-Agent": "VolatiAI/1.0", "Accept": "application/json" }, signal: AbortSignal.timeout(25000) });
      if (!r.ok) return { value: null, sources: { defillama_stables: { ok: false, error: `HTTP ${r.status}` } } };
      const j = await r.json();
      const arr = Array.isArray(j?.peggedAssets) ? j.peggedAssets : null;
      if (!arr) return { value: null, sources: { defillama_stables: { ok: false, error: "no_peggedAssets" } } };
      const n = arr.reduce((a, c) => a + (typeof c?.circulating?.peggedUSD === "number" ? c.circulating.peggedUSD : 0), 0);
      return { value: n, sources: { defillama_stables: { ok: true } }, context: { assets: arr.length } };
    },
  },
  "defillama-eth-price": {
    config: { metric: "eth_usd", threshold_pct: 10, window: "24h", ttl: 3600, context_keys: ["asset"] },
    async collectAll(env) {
      const r = await fetch("https://coins.llama.fi/prices/current/coingecko:ethereum", { headers: { "User-Agent": "VolatiAI/1.0", "Accept": "application/json" }, signal: AbortSignal.timeout(20000) });
      if (!r.ok) return { value: null, sources: { llama_coins: { ok: false, error: `HTTP ${r.status}` } } };
      const j = await r.json();
      const p = j?.coins?.["coingecko:ethereum"]?.price;
      const n = typeof p === "number" ? p : null;
      return { value: n, sources: { llama_coins: { ok: typeof n === "number" } }, context: { asset: "ETH" } };
    },
  },
  "tzkt-tezos-level": {
    config: { metric: "block_level", threshold_pct: 0.1, window: "24h", ttl: 1800, context_keys: ["chain"] },
    async collectAll(env) {
      const r = await fetch("https://api.tzkt.io/v1/head", { headers: { "User-Agent": "VolatiAI/1.0", "Accept": "application/json" }, signal: AbortSignal.timeout(20000) });
      if (!r.ok) return { value: null, sources: { tzkt: { ok: false, error: `HTTP ${r.status}` } } };
      const j = await r.json();
      const n = typeof j?.level === "number" ? j.level : null;
      return { value: n, sources: { tzkt: { ok: typeof n === "number" } }, context: { chain: "tezos" } };
    },
  },
  "tzkt-tezos-bakers": {
    config: { metric: "active_bakers", threshold_pct: 2, window: "30d", window_days: 30, ttl: 86400, context_keys: ["chain"] },
    async collectAll(env) {
      const r = await fetch("https://api.tzkt.io/v1/statistics/current", { headers: { "User-Agent": "VolatiAI/1.0", "Accept": "application/json" }, signal: AbortSignal.timeout(20000) });
      if (!r.ok) return { value: null, sources: { tzkt: { ok: false, error: `HTTP ${r.status}` } } };
      const j = await r.json();
      const n = typeof j?.totalBakers === "number" ? j.totalBakers : null;
      return { value: n, sources: { tzkt: { ok: typeof n === "number" } }, context: { chain: "tezos" } };
    },
  },
  "l2beat-total-tvs": {
    config: { metric: "total_value_secured_usd", threshold_pct: 10, window: "7d", window_days: 7, ttl: 3600, context_keys: [] },
    async collectAll(env) {
      const r = await fetch("https://l2beat.com/api/scaling/summary", { headers: { "User-Agent": "VolatiAI/1.0", "Accept": "application/json" }, signal: AbortSignal.timeout(25000) });
      if (!r.ok) return { value: null, sources: { l2beat: { ok: false, error: `HTTP ${r.status}` } } };
      const j = await r.json();
      const rows = Array.isArray(j?.chart?.data) ? j.chart.data : null;
      if (!rows || rows.length === 0) return { value: null, sources: { l2beat: { ok: false, error: "no_chart" } } };
      const last = rows[rows.length - 1];
      const n = typeof last?.[1] === "number" ? (last[1] + (last[2] || 0) + (last[3] || 0)) : null;
      return { value: n, sources: { l2beat: { ok: typeof n === "number" } }, context: { rows: rows.length } };
    },
  },
  "l2beat-total-activity": {
    config: { metric: "daily_transactions", threshold_pct: 15, window: "24h", ttl: 3600, context_keys: [] },
    async collectAll(env) {
      const r = await fetch("https://l2beat.com/api/scaling/activity", { headers: { "User-Agent": "VolatiAI/1.0", "Accept": "application/json" }, signal: AbortSignal.timeout(25000) });
      if (!r.ok) return { value: null, sources: { l2beat: { ok: false, error: `HTTP ${r.status}` } } };
      const j = await r.json();
      const rows = Array.isArray(j?.data?.chart?.data) ? j.data.chart.data : null;
      if (!rows || rows.length === 0) return { value: null, sources: { l2beat: { ok: false, error: "no_chart" } } };
      const last = rows[rows.length - 1];
      const n = typeof last?.[1] === "number" ? last[1] : null;
      return { value: n, sources: { l2beat: { ok: typeof n === "number" } }, context: { rows: rows.length } };
    },
  },
  "mempool-btc-fastest-fee": {
    config: { metric: "fastest_fee_sat_vb", threshold_pct: 50, window: "24h", ttl: 1800, context_keys: ["chain"] },
    async collectAll(env) {
      const r = await fetch("https://mempool.space/api/v1/fees/recommended", { headers: { "User-Agent": "VolatiAI/1.0", "Accept": "application/json" }, signal: AbortSignal.timeout(20000) });
      if (!r.ok) return { value: null, sources: { mempool: { ok: false, error: `HTTP ${r.status}` } } };
      const j = await r.json();
      const n = typeof j?.fastestFee === "number" ? j.fastestFee : null;
      return { value: n, sources: { mempool: { ok: typeof n === "number" } }, context: { chain: "bitcoin" } };
    },
  },
  "nftx-collections-count": {
    config: { metric: "collections_tracked", threshold_pct: 5, window: "30d", window_days: 30, ttl: 86400, context_keys: [] },
    async collectAll(env) {
      const r = await fetch("https://api.nftx.io/v1/collections", { headers: { "User-Agent": "VolatiAI/1.0", "Accept": "application/json" }, signal: AbortSignal.timeout(25000) });
      if (!r.ok) return { value: null, sources: { nftx: { ok: false, error: `HTTP ${r.status}` } } };
      const j = await r.json();
      const n = Array.isArray(j?.data) ? j.data.length : null;
      return { value: n, sources: { nftx: { ok: typeof n === "number" } } };
    },
  },
  "bitcoin-mempool-count": {
    config: { metric: "mempool_tx_count", threshold_pct: 30, window: "24h", ttl: 1800, context_keys: ["chain"] },
    async collectAll(env) {
      const r = await fetch("https://mempool.space/api/mempool", { headers: { "User-Agent": "VolatiAI/1.0", "Accept": "application/json" }, signal: AbortSignal.timeout(20000) });
      if (!r.ok) return { value: null, sources: { mempool: { ok: false, error: `HTTP ${r.status}` } } };
      const j = await r.json();
      const n = typeof j?.count === "number" ? j.count : null;
      return { value: n, sources: { mempool: { ok: typeof n === "number" } }, context: { chain: "bitcoin" } };
    },
  },
  "ethereum-block-height": {
    config: { metric: "block_height", threshold_pct: 0.1, window: "24h", ttl: 1800, context_keys: ["chain"] },
    async collectAll(env) {
      const r = await fetch("https://ethereum-rpc.publicnode.com", {
        method: "POST",
        headers: { "Content-Type": "application/json", "User-Agent": "VolatiAI/1.0" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_blockNumber", params: [] }),
        signal: AbortSignal.timeout(20000),
      });
      if (!r.ok) return { value: null, sources: { publicnode: { ok: false, error: `HTTP ${r.status}` } } };
      const j = await r.json();
      const hex = j?.result;
      const n = typeof hex === "string" ? parseInt(hex, 16) : null;
      return { value: (Number.isFinite(n) ? n : null), sources: { publicnode: { ok: Number.isFinite(n) } }, context: { chain: "ethereum" } };
    },
  },
  "elm-package-count": {
    config: { metric: "total_packages", threshold_pct: 2, window: "30d", window_days: 30, ttl: 86400, context_keys: ["language"] },
    async collectAll(env) {
      const r = await fetch("https://package.elm-lang.org/all-packages", { headers: { "User-Agent": "VolatiAI/1.0", "Accept": "application/json" }, signal: AbortSignal.timeout(25000) });
      if (!r.ok) return { value: null, sources: { elm_registry: { ok: false, error: `HTTP ${r.status}` } } };
      const j = await r.json();
      const n = (j && typeof j === "object") ? Object.keys(j).length : null;
      return { value: n, sources: { elm_registry: { ok: typeof n === "number" } }, context: { language: "Elm" } };
    },
  },
  "nuget-fsharp-package-count": {
    config: { metric: "total_packages", threshold_pct: 2, window: "30d", window_days: 30, ttl: 86400, context_keys: ["language"] },
    async collectAll(env) {
      const r = await fetch("https://azuresearch-usnc.nuget.org/query?q=tags:Fsharp&take=1", { headers: { "User-Agent": "VolatiAI/1.0", "Accept": "application/json" }, signal: AbortSignal.timeout(20000) });
      if (!r.ok) return { value: null, sources: { nuget: { ok: false, error: `HTTP ${r.status}` } } };
      const j = await r.json();
      const n = typeof j?.totalHits === "number" ? j.totalHits : null;
      return { value: n, sources: { nuget: { ok: typeof n === "number" } }, context: { language: "F#" } };
    },
  },
  "github-lisp-repo-count": {
    config: { metric: "public_repos", threshold_pct: 3, window: "30d", window_days: 30, ttl: 86400, context_keys: ["language"] },
    async collectAll(env) {
      const r = await fetch("https://api.github.com/search/repositories?q=language:Lisp&per_page=1", { headers: ghHeaders(env), signal: AbortSignal.timeout(20000) });
      if (!r.ok) return { value: null, sources: { github: { ok: false, error: `HTTP ${r.status}` } } };
      const j = await r.json();
      const n = typeof j?.total_count === "number" ? j.total_count : null;
      return { value: n, sources: { github: { ok: typeof n === "number" } }, context: { language: "Lisp" } };
    },
  },
  "github-prolog-repo-count": {
    config: { metric: "public_repos", threshold_pct: 3, window: "30d", window_days: 30, ttl: 86400, context_keys: ["language"] },
    async collectAll(env) {
      const r = await fetch("https://api.github.com/search/repositories?q=language:Prolog&per_page=1", { headers: ghHeaders(env), signal: AbortSignal.timeout(20000) });
      if (!r.ok) return { value: null, sources: { github: { ok: false, error: `HTTP ${r.status}` } } };
      const j = await r.json();
      const n = typeof j?.total_count === "number" ? j.total_count : null;
      return { value: n, sources: { github: { ok: typeof n === "number" } }, context: { language: "Prolog" } };
    },
  },
  "github-fortran-repo-count": {
    config: { metric: "public_repos", threshold_pct: 3, window: "30d", window_days: 30, ttl: 86400, context_keys: ["language"] },
    async collectAll(env) {
      const r = await fetch("https://api.github.com/search/repositories?q=language:Fortran&per_page=1", { headers: ghHeaders(env), signal: AbortSignal.timeout(20000) });
      if (!r.ok) return { value: null, sources: { github: { ok: false, error: `HTTP ${r.status}` } } };
      const j = await r.json();
      const n = typeof j?.total_count === "number" ? j.total_count : null;
      return { value: n, sources: { github: { ok: typeof n === "number" } }, context: { language: "Fortran" } };
    },
  },
  "github-cobol-repo-count": {
    config: { metric: "public_repos", threshold_pct: 3, window: "30d", window_days: 30, ttl: 86400, context_keys: ["language"] },
    async collectAll(env) {
      const r = await fetch("https://api.github.com/search/repositories?q=language:COBOL&per_page=1", { headers: ghHeaders(env), signal: AbortSignal.timeout(20000) });
      if (!r.ok) return { value: null, sources: { github: { ok: false, error: `HTTP ${r.status}` } } };
      const j = await r.json();
      const n = typeof j?.total_count === "number" ? j.total_count : null;
      return { value: n, sources: { github: { ok: typeof n === "number" } }, context: { language: "COBOL" } };
    },
  },
  "github-apl-repo-count": {
    config: { metric: "public_repos", threshold_pct: 3, window: "30d", window_days: 30, ttl: 86400, context_keys: ["language"] },
    async collectAll(env) {
      const r = await fetch("https://api.github.com/search/repositories?q=language:APL&per_page=1", { headers: ghHeaders(env), signal: AbortSignal.timeout(20000) });
      if (!r.ok) return { value: null, sources: { github: { ok: false, error: `HTTP ${r.status}` } } };
      const j = await r.json();
      const n = typeof j?.total_count === "number" ? j.total_count : null;
      return { value: n, sources: { github: { ok: typeof n === "number" } }, context: { language: "APL" } };
    },
  },
  "github-forth-repo-count": {
    config: { metric: "public_repos", threshold_pct: 3, window: "30d", window_days: 30, ttl: 86400, context_keys: ["language"] },
    async collectAll(env) {
      const r = await fetch("https://api.github.com/search/repositories?q=language:Forth&per_page=1", { headers: ghHeaders(env), signal: AbortSignal.timeout(20000) });
      if (!r.ok) return { value: null, sources: { github: { ok: false, error: `HTTP ${r.status}` } } };
      const j = await r.json();
      const n = typeof j?.total_count === "number" ? j.total_count : null;
      return { value: n, sources: { github: { ok: typeof n === "number" } }, context: { language: "Forth" } };
    },
  },
  "github-smalltalk-repo-count": {
    config: { metric: "public_repos", threshold_pct: 3, window: "30d", window_days: 30, ttl: 86400, context_keys: ["language"] },
    async collectAll(env) {
      const r = await fetch("https://api.github.com/search/repositories?q=language:Smalltalk&per_page=1", { headers: ghHeaders(env), signal: AbortSignal.timeout(20000) });
      if (!r.ok) return { value: null, sources: { github: { ok: false, error: `HTTP ${r.status}` } } };
      const j = await r.json();
      const n = typeof j?.total_count === "number" ? j.total_count : null;
      return { value: n, sources: { github: { ok: typeof n === "number" } }, context: { language: "Smalltalk" } };
    },
  },
  "github-scheme-repo-count": {
    config: { metric: "public_repos", threshold_pct: 3, window: "30d", window_days: 30, ttl: 86400, context_keys: ["language"] },
    async collectAll(env) {
      const r = await fetch("https://api.github.com/search/repositories?q=language:Scheme&per_page=1", { headers: ghHeaders(env), signal: AbortSignal.timeout(20000) });
      if (!r.ok) return { value: null, sources: { github: { ok: false, error: `HTTP ${r.status}` } } };
      const j = await r.json();
      const n = typeof j?.total_count === "number" ? j.total_count : null;
      return { value: n, sources: { github: { ok: typeof n === "number" } }, context: { language: "Scheme" } };
    },
  },
  "github-groovy-repo-count": {
    config: { metric: "public_repos", threshold_pct: 3, window: "30d", window_days: 30, ttl: 86400, context_keys: ["language"] },
    async collectAll(env) {
      const r = await fetch("https://api.github.com/search/repositories?q=language:Groovy&per_page=1", { headers: ghHeaders(env), signal: AbortSignal.timeout(20000) });
      if (!r.ok) return { value: null, sources: { github: { ok: false, error: `HTTP ${r.status}` } } };
      const j = await r.json();
      const n = typeof j?.total_count === "number" ? j.total_count : null;
      return { value: n, sources: { github: { ok: typeof n === "number" } }, context: { language: "Groovy" } };
    },
  },
  "github-lua-repo-count": {
    config: { metric: "public_repos", threshold_pct: 3, window: "30d", window_days: 30, ttl: 86400, context_keys: ["language"] },
    async collectAll(env) {
      const r = await fetch("https://api.github.com/search/repositories?q=language:Lua&per_page=1", { headers: ghHeaders(env), signal: AbortSignal.timeout(20000) });
      if (!r.ok) return { value: null, sources: { github: { ok: false, error: `HTTP ${r.status}` } } };
      const j = await r.json();
      const n = typeof j?.total_count === "number" ? j.total_count : null;
      return { value: n, sources: { github: { ok: typeof n === "number" } }, context: { language: "Lua" } };
    },
  },
  "github-zig-repo-count": {
    config: { metric: "public_repos", threshold_pct: 3, window: "30d", window_days: 30, ttl: 86400, context_keys: ["language"] },
    async collectAll(env) {
      const r = await fetch("https://api.github.com/search/repositories?q=language:Zig&per_page=1", { headers: ghHeaders(env), signal: AbortSignal.timeout(20000) });
      if (!r.ok) return { value: null, sources: { github: { ok: false, error: `HTTP ${r.status}` } } };
      const j = await r.json();
      const n = typeof j?.total_count === "number" ? j.total_count : null;
      return { value: n, sources: { github: { ok: typeof n === "number" } }, context: { language: "Zig" } };
    },
  },
  "github-crystal-repo-count": {
    config: { metric: "public_repos", threshold_pct: 3, window: "30d", window_days: 30, ttl: 86400, context_keys: ["language"] },
    async collectAll(env) {
      const r = await fetch("https://api.github.com/search/repositories?q=language:Crystal&per_page=1", { headers: ghHeaders(env), signal: AbortSignal.timeout(20000) });
      if (!r.ok) return { value: null, sources: { github: { ok: false, error: `HTTP ${r.status}` } } };
      const j = await r.json();
      const n = typeof j?.total_count === "number" ? j.total_count : null;
      return { value: n, sources: { github: { ok: typeof n === "number" } }, context: { language: "Crystal" } };
    },
  },
  "github-ada-repo-count": {
    config: { metric: "public_repos", threshold_pct: 3, window: "30d", window_days: 30, ttl: 86400, context_keys: ["language"] },
    async collectAll(env) {
      const r = await fetch("https://api.github.com/search/repositories?q=language:Ada&per_page=1", { headers: ghHeaders(env), signal: AbortSignal.timeout(20000) });
      if (!r.ok) return { value: null, sources: { github: { ok: false, error: `HTTP ${r.status}` } } };
      const j = await r.json();
      const n = typeof j?.total_count === "number" ? j.total_count : null;
      return { value: n, sources: { github: { ok: typeof n === "number" } }, context: { language: "Ada" } };
    },
  },
  "github-erlang-repo-count": {
    config: { metric: "public_repos", threshold_pct: 3, window: "30d", window_days: 30, ttl: 86400, context_keys: ["language"] },
    async collectAll(env) {
      const r = await fetch("https://api.github.com/search/repositories?q=language:Erlang&per_page=1", { headers: ghHeaders(env), signal: AbortSignal.timeout(20000) });
      if (!r.ok) return { value: null, sources: { github: { ok: false, error: `HTTP ${r.status}` } } };
      const j = await r.json();
      const n = typeof j?.total_count === "number" ? j.total_count : null;
      return { value: n, sources: { github: { ok: typeof n === "number" } }, context: { language: "Erlang" } };
    },
  },
  "github-vala-repo-count": {
    config: { metric: "public_repos", threshold_pct: 3, window: "30d", window_days: 30, ttl: 86400, context_keys: ["language"] },
    async collectAll(env) {
      const r = await fetch("https://api.github.com/search/repositories?q=language:Vala&per_page=1", { headers: ghHeaders(env), signal: AbortSignal.timeout(20000) });
      if (!r.ok) return { value: null, sources: { github: { ok: false, error: `HTTP ${r.status}` } } };
      const j = await r.json();
      const n = typeof j?.total_count === "number" ? j.total_count : null;
      return { value: n, sources: { github: { ok: typeof n === "number" } }, context: { language: "Vala" } };
    },
  },
  "github-riscv-repo-count": {
    config: { metric: "public_repos", threshold_pct: 3, window: "30d", window_days: 30, ttl: 86400, context_keys: ["topic"] },
    async collectAll(env) {
      const r = await fetch("https://api.github.com/search/repositories?q=topic:riscv&per_page=1", { headers: ghHeaders(env), signal: AbortSignal.timeout(20000) });
      if (!r.ok) return { value: null, sources: { github: { ok: false, error: `HTTP ${r.status}` } } };
      const j = await r.json();
      const n = typeof j?.total_count === "number" ? j.total_count : null;
      return { value: n, sources: { github: { ok: typeof n === "number" } }, context: { topic: "riscv" } };
    },
  },
  "github-hdl-repo-count": {
    config: { metric: "public_repos", threshold_pct: 3, window: "30d", window_days: 30, ttl: 86400, context_keys: ["language"] },
    async collectAll(env) {
      const r = await fetch("https://api.github.com/search/repositories?q=language:Verilog&per_page=1", { headers: ghHeaders(env), signal: AbortSignal.timeout(20000) });
      if (!r.ok) return { value: null, sources: { github: { ok: false, error: `HTTP ${r.status}` } } };
      const j = await r.json();
      const n = typeof j?.total_count === "number" ? j.total_count : null;
      return { value: n, sources: { github: { ok: typeof n === "number" } }, context: { language: "Verilog+VHDL" } };
    },
  },
  "github-open-silicon-repo-count": {
    config: { metric: "public_repos", threshold_pct: 5, window: "30d", window_days: 30, ttl: 86400, context_keys: ["topic"] },
    async collectAll(env) {
      const r = await fetch("https://api.github.com/repos/openhwgroup/cva6", { headers: ghHeaders(env), signal: AbortSignal.timeout(20000) });
      if (!r.ok) return { value: null, sources: { github: { ok: false, error: `HTTP ${r.status}` } } };
      const j = await r.json();
      const n = typeof j?.stargazers_count === "number" ? j.stargazers_count : null;
      return { value: n, sources: { github: { ok: typeof n === "number" } }, context: { repo: "openhwgroup/cva6" } };
    },
  },
  "wb-us-life-expectancy": {
    config: { metric: "life_expectancy_years", threshold_pct: 1, window: "365d", window_days: 365, ttl: 86400, context_keys: ["country", "year"] },
    async collectAll(env) {
      const r = await fetch("https://api.worldbank.org/v2/country/US/indicator/SP.DYN.LE00.IN?format=json&per_page=1&date=2023", { headers: { "User-Agent": "VolatiAI/1.0", "Accept": "application/json" }, signal: AbortSignal.timeout(20000) });
      if (!r.ok) return { value: null, sources: { worldbank: { ok: false, error: `HTTP ${r.status}` } } };
      const j = await r.json();
      const v = Array.isArray(j) && Array.isArray(j[1]) && j[1][0] ? j[1][0].value : null;
      const n = typeof v === "number" ? v : null;
      return { value: n, sources: { worldbank: { ok: typeof n === "number" } }, context: { country: "USA", year: "2023" } };
    },
  },
  "wb-us-infant-mortality": {
    config: { metric: "infant_mortality_per_1000", threshold_pct: 2, window: "365d", window_days: 365, ttl: 86400, context_keys: ["country", "year"] },
    async collectAll(env) {
      const r = await fetch("https://api.worldbank.org/v2/country/US/indicator/SP.DYN.IMRT.IN?format=json&per_page=1&date=2023", { headers: { "User-Agent": "VolatiAI/1.0", "Accept": "application/json" }, signal: AbortSignal.timeout(20000) });
      if (!r.ok) return { value: null, sources: { worldbank: { ok: false, error: `HTTP ${r.status}` } } };
      const j = await r.json();
      const v = Array.isArray(j) && Array.isArray(j[1]) && j[1][0] ? j[1][0].value : null;
      const n = typeof v === "number" ? v : null;
      return { value: n, sources: { worldbank: { ok: typeof n === "number" } }, context: { country: "USA", year: "2023" } };
    },
  },
  "wb-us-population-65plus": {
    config: { metric: "population_65plus_pct", threshold_pct: 1, window: "365d", window_days: 365, ttl: 86400, context_keys: ["country", "year"] },
    async collectAll(env) {
      const r = await fetch("https://api.worldbank.org/v2/country/US/indicator/SP.POP.65UP.TO.ZS?format=json&per_page=1&date=2022", { headers: { "User-Agent": "VolatiAI/1.0", "Accept": "application/json" }, signal: AbortSignal.timeout(20000) });
      if (!r.ok) return { value: null, sources: { worldbank: { ok: false, error: `HTTP ${r.status}` } } };
      const j = await r.json();
      const v = Array.isArray(j) && Array.isArray(j[1]) && j[1][0] ? j[1][0].value : null;
      const n = typeof v === "number" ? v : null;
      return { value: n, sources: { worldbank: { ok: typeof n === "number" } }, context: { country: "USA", year: "2022" } };
    },
  },
  "hf-bert-downloads": {
    config: { metric: "downloads_30d", threshold_pct: 5, window: "30d", window_days: 30, ttl: 86400, context_keys: ["model"] },
    async collectAll(env) {
      const r = await fetch("https://huggingface.co/api/models/bert-base-uncased", { headers: { "User-Agent": "VolatiAI/1.0", "Accept": "application/json" }, signal: AbortSignal.timeout(20000) });
      if (!r.ok) return { value: null, sources: { huggingface: { ok: false, error: `HTTP ${r.status}` } } };
      const j = await r.json();
      const n = typeof j?.downloads === "number" ? j.downloads : null;
      return { value: n, sources: { huggingface: { ok: typeof n === "number" } }, context: { model: "bert-base-uncased" } };
    },
  },
  "benchgecko-total-models": {
    config: { metric: "total_models", threshold_pct: 2, window: "30d", window_days: 30, ttl: 86400, context_keys: [] },
    async collectAll(env) {
      const r = await fetch("https://benchgecko.ai/api/v1/models?limit=1", { headers: { "User-Agent": "VolatiAI/1.0", "Accept": "application/json" }, signal: AbortSignal.timeout(25000) });
      if (!r.ok) return { value: null, sources: { benchgecko: { ok: false, error: `HTTP ${r.status}` } } };
      const j = await r.json();
      const n = typeof j?.meta?.total === "number" ? j.meta.total : null;
      return { value: n, sources: { benchgecko: { ok: typeof n === "number" } } };
    },
  },
  "github-langchain-stars": {
    config: { metric: "stargazers", threshold_pct: 3, window: "30d", window_days: 30, ttl: 86400, context_keys: ["repo"] },
    async collectAll(env) {
      const r = await fetch("https://api.github.com/repos/langchain-ai/langchain", { headers: ghHeaders(env), signal: AbortSignal.timeout(20000) });
      if (!r.ok) return { value: null, sources: { github: { ok: false, error: `HTTP ${r.status}` } } };
      const j = await r.json();
      const n = typeof j?.stargazers_count === "number" ? j.stargazers_count : null;
      return { value: n, sources: { github: { ok: typeof n === "number" } }, context: { repo: "langchain-ai/langchain" } };
    },
  },
  "github-crewai-stars": {
    config: { metric: "stargazers", threshold_pct: 3, window: "30d", window_days: 30, ttl: 86400, context_keys: ["repo"] },
    async collectAll(env) {
      const r = await fetch("https://api.github.com/repos/crewAIInc/crewAI", { headers: ghHeaders(env), signal: AbortSignal.timeout(20000) });
      if (!r.ok) return { value: null, sources: { github: { ok: false, error: `HTTP ${r.status}` } } };
      const j = await r.json();
      const n = typeof j?.stargazers_count === "number" ? j.stargazers_count : null;
      return { value: n, sources: { github: { ok: typeof n === "number" } }, context: { repo: "crewAIInc/crewAI" } };
    },
  },
  "github-autogen-stars": {
    config: { metric: "stargazers", threshold_pct: 3, window: "30d", window_days: 30, ttl: 86400, context_keys: ["repo"] },
    async collectAll(env) {
      const r = await fetch("https://api.github.com/repos/microsoft/autogen", { headers: ghHeaders(env), signal: AbortSignal.timeout(20000) });
      if (!r.ok) return { value: null, sources: { github: { ok: false, error: `HTTP ${r.status}` } } };
      const j = await r.json();
      const n = typeof j?.stargazers_count === "number" ? j.stargazers_count : null;
      return { value: n, sources: { github: { ok: typeof n === "number" } }, context: { repo: "microsoft/autogen" } };
    },
  },
  "github-mcp-repo-count": {
    config: { metric: "public_repos", threshold_pct: 5, window: "30d", window_days: 30, ttl: 86400, context_keys: ["topic"] },
    async collectAll(env) {
      const r = await fetch("https://api.github.com/search/repositories?q=topic:mcp&per_page=1", { headers: ghHeaders(env), signal: AbortSignal.timeout(20000) });
      if (!r.ok) return { value: null, sources: { github: { ok: false, error: `HTTP ${r.status}` } } };
      const j = await r.json();
      const n = typeof j?.total_count === "number" ? j.total_count : null;
      return { value: n, sources: { github: { ok: typeof n === "number" } }, context: { topic: "mcp" } };
    },
  },
  "github-ai-agents-repo-count": {
    config: { metric: "public_repos", threshold_pct: 5, window: "30d", window_days: 30, ttl: 86400, context_keys: ["topic"] },
    async collectAll(env) {
      const r = await fetch("https://api.github.com/search/repositories?q=topic:ai-agents&per_page=1", { headers: ghHeaders(env), signal: AbortSignal.timeout(20000) });
      if (!r.ok) return { value: null, sources: { github: { ok: false, error: `HTTP ${r.status}` } } };
      const j = await r.json();
      const n = typeof j?.total_count === "number" ? j.total_count : null;
      return { value: n, sources: { github: { ok: typeof n === "number" } }, context: { topic: "ai-agents" } };
    },
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
    const src = result.sources[config.metric];
    console.log("no_current", sectorName, "err:", src && src.error, "allFailed:", envelope.sources.failed);
    return { sector: sectorName, skipped: "no_current", failed: envelope.sources.failed };
  }
  const today = new Date().toISOString().slice(0, 10);
  const todayEntry = history.find(h => new Date(h.t).toISOString().slice(0, 10) === today);
  // Only write KV if the value has meaningfully changed (0.5% or more).
  // Prevents float-noise writes and slow-cadence churn that exhausts free-tier quota.
  const threshold = 0.005;
  let valueChanged;
  if (!todayEntry) {
    valueChanged = true;  // first write of day
  } else if (typeof todayEntry.v !== "number" || todayEntry.v === 0) {
    valueChanged = true;  // need a baseline
  } else {
    valueChanged = Math.abs(current - todayEntry.v) / Math.abs(todayEntry.v) > threshold;
  }
  if (!valueChanged) {
    if (envelope.has_signal) {
      try {
        await env.SECTOR_KV.put(
          `${sectorName}_signal`,
          JSON.stringify({
            severity: envelope.severity,
            has_signal: true,
            computed_at: Date.now(),
            pct_change: envelope.delta ? envelope.delta.pct_change : null,
            window_days: envelope.delta ? envelope.delta.actual_window_days : null,
          }),
          { expirationTtl: 86400 * 7 }
        );
      } catch (e) {
        console.log("signal_put_failed", sectorName, String(e).slice(0, 120));
      }
    }
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
    const CRONS = [
      "17 3 * * *", "27 3 * * *", "37 3 * * *", "47 3 * * *", "57 3 * * *",
    ];
    const shardIdx = CRONS.indexOf(cron);
    const shardCount = CRONS.length;
    const all = Object.entries(COLLECTORS);
    const slice = shardIdx >= 0
      ? all.filter((_, i) => i % shardCount === shardIdx)
      : all;
    console.log(`cron shard ${shardIdx + 1}/${shardCount}: ${slice.length} of ${all.length} sectors`);
    for (const [name, collector] of slice) {
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
      // Two keys: _last_cron_run for /status backwards compat (overwritten),
      // _cron_last_shard_<N> for /health?full=1 (preserves all shards).
      await env.SECTOR_KV.put("_last_cron_run", JSON.stringify(summary), { expirationTtl: 86400 * 7 });
      if (shardIdx >= 0) {
        await env.SECTOR_KV.put(
          `_cron_last_shard_${shardIdx}`,
          JSON.stringify(summary),
          { expirationTtl: 86400 * 7 }
        );
      }
    } catch (e) {
      console.log("cron status write failed:", String(e));
    }

    // Track which shards fired today. Used by /health to detect partial
    // coverage (e.g. GitHub Actions failing but Cloudflare crons still firing).
    if (shardIdx >= 0) {
      try {
        const day = new Date().toISOString().slice(0, 10);
        const shardsKey = `_cron_shards_${day}`;
        const existing = (await env.SECTOR_KV.get(shardsKey, "json")) || { date: day, shards: [] };
        if (!existing.shards.includes(shardIdx)) {
          existing.shards.push(shardIdx);
          existing.shards.sort((a, b) => a - b);
          existing.updated_at = new Date().toISOString();
          await env.SECTOR_KV.put(shardsKey, JSON.stringify(existing), { expirationTtl: 86400 * 90 });
        }
      } catch (e) {
        console.log("shard tracking failed:", String(e).slice(0, 100));
      }
    }

    // Daily calibration snapshot: merge this shard's fired sectors into
    // _daily_<YYYY-MM-DD>. Idempotent — each shard appends its contribution.
    try {
      const day = new Date().toISOString().slice(0, 10);
      const dailyKey = `_daily_${day}`;
      const existing = (await env.SECTOR_KV.get(dailyKey, "json")) || { date: day, fired: [], updated_at: null };
      const firedMap = new Map(existing.fired.map(f => [f.sector, f]));
      for (const r of results) {
        if (r.has_signal && r.written) {
          firedMap.set(r.sector, {
            sector: r.sector,
            value: r.value,
            shard_cron: cron,
          });
        }
      }
      const daily = {
        date: day,
        fired: Array.from(firedMap.values()).sort((a, b) => a.sector.localeCompare(b.sector)),
        count: firedMap.size,
        updated_at: new Date().toISOString(),
      };
      await env.SECTOR_KV.put(dailyKey, JSON.stringify(daily), { expirationTtl: 86400 * 90 });
    } catch (e) {
      console.log("calibration write failed:", String(e).slice(0, 120));
    }

    // NOTE: correlation snapshot write moved out of cron.
    //
    // Previous design: shard 0 called this.fetch() to compute the snapshot
    // in-process. But the snapshot requires loading 200+ histories and
    // computing ~5000 pairwise correlations — that exceeds the 10ms CPU
    // budget of Cloudflare Workers Free tier. Shard 0 was killed mid-
    // execution before writing its shard_done marker, so:
    //   - _cron_shards_<date> showed [1,2,3,4] instead of [0,1,2,3,4]
    //   - _corr_<date> was never written by cron
    //   - ~99 sectors (shard 0's slice) missed their daily data point
    //
    // Fix: external trigger via GitHub Actions workflow, at 04:15 UTC
    // (after all 5 shards complete by 03:57). See:
    //   .github/workflows/corr-snapshot.yml
    //
    // This keeps the cron handler under CPU budget and makes the snapshot
    // write observable (fails visibly in GitHub Actions, not silently in
    // Workers logs).

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

    // ─── POST /internal/run?shard=N — token-gated shard trigger ───
    if (parts[0] === "internal" && parts[1] === "run" && request.method === "POST") {
      const auth = request.headers.get("authorization") || "";
      const token = auth.replace(/^Bearer\s+/i, "");
      if (!env.RUN_TOKEN || token !== env.RUN_TOKEN) {
        return json({ error: "unauthorized" }, 401);
      }
      const CRONS = [
        "17 3 * * *", "22 3 * * *", "27 3 * * *", "32 3 * * *", "37 3 * * *",
        "42 3 * * *", "47 3 * * *", "52 3 * * *", "57 3 * * *", "02 4 * * *",
      ];
      const shardIdx = parseInt(url.searchParams.get("shard") || "-1", 10);
      if (shardIdx < 0 || shardIdx >= CRONS.length) {
        return json({ error: "invalid_shard", allowed: Array.from({length: CRONS.length}, (_, i) => i) }, 400);
      }
      const started = Date.now();
      await this.scheduled({ cron: CRONS[shardIdx] }, env, {});
      const meta = await env.SECTOR_KV.get("_last_cron_run", "json");
      return json({
        ok: true, shard: shardIdx, cron: CRONS[shardIdx],
        duration_ms: Date.now() - started,
        result: meta ? { total: meta.total, written: meta.written, failed: meta.failed } : null,
      });
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
        // moved to cron; see scheduled()
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

    // ─── /health — consolidated system state, one endpoint ───
    if (parts[0] === "health") {
      try {
        const full = url.searchParams.get("full") === "1";
        const issues = [];
        const checks = {};

        // 1. KV storage
        const list = await env.SECTOR_KV.list({ limit: 1000 });
        const histKeys = list.keys.filter(k => k.name.endsWith("_history") && !k.name.startsWith("_"));
        const dailyKeys = list.keys.filter(k => k.name.startsWith("_daily_"));
        checks.kv = {
          total_keys: list.keys.length,
          history_keys: histKeys.length,
          daily_keys: dailyKeys.length,
          ok: true,
        };

        // 2. Cron health
        const meta = await env.SECTOR_KV.get("_last_cron_run", "json");
        if (!meta) {
          checks.cron = { ok: false, reason: "no _last_cron_run key" };
          issues.push("cron: never fired");
        } else {
          const ageMs = Date.now() - new Date(meta.timestamp).getTime();
          const ageH = ageMs / 3600000;
          const ageOk = ageH <= 26;
          const failOk = (meta.failed || 0) <= 5;
          checks.cron = {
            last_run: meta.timestamp,
            age_hours: Math.round(ageH * 10) / 10,
            cron: meta.cron,
            total: meta.total,
            written: meta.written,
            failed: meta.failed,
            ok: ageOk && failOk,
          };
          if (!ageOk) issues.push(`cron: stale ${ageH.toFixed(1)}h (>26h)`);
          if (!failOk) issues.push(`cron: ${meta.failed} failures last run`);
        }

        // 3. Shard coverage today
        const today = new Date().toISOString().slice(0, 10);
        const shardData = await env.SECTOR_KV.get(`_cron_shards_${today}`, "json");
        const expectedShards = 5;    // length of CRONS array
        const seenShards = shardData && Array.isArray(shardData.shards) ? shardData.shards.length : 0;
        checks.cron.shards_today = { seen: seenShards, expected: expectedShards };
        // Only flag after 05:00 UTC — all crons should have fired by 04:02
        const hourUtc = new Date().getUTCHours();
        // Only flag if tracking data exists (i.e. at least one shard
        // fired today) AND coverage is incomplete. On the first day after
        // enabling tracking, no data means "not yet observed," not "failed."
        if (shardData && hourUtc >= 5 && seenShards < expectedShards) {
          issues.push(`shards: ${seenShards}/${expectedShards} fired today`);
        }

        // 4. Calibration
        if (dailyKeys.length === 0) {
          checks.calibration = {
            window_days: 0,
            ok: "pending",
            reason: "no _daily_ keys yet (populates at next cron)",
          };
        } else {
          const newest = dailyKeys.slice().sort((a, b) => b.name.localeCompare(a.name))[0];
          const day = await env.SECTOR_KV.get(newest.name, "json");
          if (day && day.date) {
            const dayMs = new Date(day.date + "T00:00:00Z").getTime();
            const daysBack = Math.round((Date.now() - dayMs) / 86400000);
            checks.calibration = {
              window_days: dailyKeys.length,
              newest_date: day.date,
              newest_count: day.count,
              days_since_newest: daysBack,
              ok: daysBack <= 1,
            };
            if (daysBack > 1) issues.push(`calibration: newest is ${daysBack}d old`);
          }
        }

        // 4. Optional full scan — merge results from all shard runs today
        if (full) {
          const shardKeys = list.keys
            .filter(k => k.name.startsWith("_cron_last_shard_"))
            .map(k => ({ name: k.name, shard: parseInt(k.name.replace("_cron_last_shard_", ""), 10) }))
            .filter(k => Number.isFinite(k.shard))
            .sort((a, b) => a.shard - b.shard);

          const merged = [];
          const failuresByShard = {};
          const noCurrentByShard = {};
          for (const k of shardKeys) {
            const s = await env.SECTOR_KV.get(k.name, "json");
            if (!s || !Array.isArray(s.results)) continue;
            for (const r of s.results) {
              merged.push({ ...r, shard: k.shard });
              if (r.error) {
                (failuresByShard[k.shard] = failuresByShard[k.shard] || []).push(r.sector);
              }
              if (r.skipped === "no_current") {
                (noCurrentByShard[k.shard] = noCurrentByShard[k.shard] || []).push(r.sector);
              }
            }
          }

          const failedSectors = merged.filter(r => r.error).map(r => ({
            sector: r.sector,
            shard: r.shard,
            error: String(r.error).slice(0, 80),
          }));
          const noCurrentSectors = merged.filter(r => r.skipped === "no_current").map(r => r.sector);

          checks.sectors = {
            shards_merged: shardKeys.length,
            total_sector_runs: merged.length,
            failed: failedSectors.slice(0, 15),
            failures_by_shard: failuresByShard,
            no_current_count: noCurrentSectors.length,
            no_current_by_shard: noCurrentByShard,
            no_current_sample: noCurrentSectors.slice(0, 5),
            ok: failedSectors.length === 0,
          };
        }

        const ok = issues.length === 0;
        return json({
          ts: new Date().toISOString(),
          ok,
          summary: ok ? "healthy" : `${issues.length} issue(s)`,
          checks,
          issues,
        });
      } catch (e) {
        return json({ error: "health_failed", message: String(e && e.message || e) }, 500);
      }
    }

    // ─── /calibration — daily snapshots + multi-day aggregate stats ───
    if (parts[0] === "calibration") {
      try {
        const days = Math.min(parseInt(url.searchParams.get("days") || "7", 10), 90);
        const list = await env.SECTOR_KV.list({ prefix: "_daily_", limit: 1000 });
        const dayKeys = list.keys
          .map(k => ({ name: k.name, date: k.name.replace("_daily_", "") }))
          .sort((a, b) => b.date.localeCompare(a.date))
          .slice(0, days);

        const daily = [];
        for (const k of dayKeys) {
          const d = await env.SECTOR_KV.get(k.name, "json");
          if (d) daily.push(d);
        }

        // Aggregate: how often each sector fired across the window
        const counts = new Map();
        for (const d of daily) {
          for (const f of d.fired || []) {
            counts.set(f.sector, (counts.get(f.sector) || 0) + 1);
          }
        }
        const totalDays = daily.length;
        const table = [...counts.entries()]
          .map(([sector, n]) => ({
            sector,
            fires: n,
            fire_rate: totalDays > 0 ? Math.round((n / totalDays) * 1000) / 10 : 0,
          }))
          .sort((a, b) => b.fires - a.fires || a.sector.localeCompare(b.sector));

        // Classifications
        const everyDay = table.filter(t => t.fires === totalDays && totalDays >= 3);
        const once = table.filter(t => t.fires === 1);
        const frequent = table.filter(t => t.fires >= 2 && t.fires < totalDays);

        return json({
          ts: new Date().toISOString(),
          window_days: totalDays,
          daily,
          aggregate: {
            unique_sectors: table.length,
            every_day: everyDay.map(t => t.sector),
            once: once.map(t => t.sector),
            frequent: frequent.slice(0, 30),
          },
          full_table: table,
        });
      } catch (e) {
        return json({ error: "calibration_failed", message: String(e && e.message || e) }, 500);
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


    // ─── /latest and /summary — batch read from KV, no upstream fetches ───
    if (parts[0] === "latest" || parts[0] === "summary") {
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
            const tp = (COLLECTORS[sector] && COLLECTORS[sector].config && COLLECTORS[sector].config.threshold_pct) || 5;
            const sev = absPct >= tp * 2 ? "critical"
                      : absPct >= tp     ? "warn" : "info";
            rows.push({
              sector, current: last.v, previous: prev.v, pct_change: pct,
              pts: hist.length, t: last.t,
              has_signal: sev !== "info", severity: sev,
            });
          });
        }
        // Merge persisted signals from cron (for unchanged sectors).
        try {
          const sigList = await env.SECTOR_KV.list({ limit: 1000 });
          const sigKeys = sigList.keys.filter(k => k.name.endsWith("_signal"));
          const now = Date.now();
          const sigMap = new Map();
          for (const k of sigKeys) {
            const sig = await env.SECTOR_KV.get(k.name, "json");
            if (sig && sig.has_signal && now - (sig.computed_at || 0) < 7 * 86400 * 1000) {
              sigMap.set(k.name.replace(/_signal$/, ""), sig);
            }
          }
          for (const r of rows) {
            const sig = sigMap.get(r.sector);
            if (sig && !r.has_signal) {
              r.has_signal = true;
              r.severity = sig.severity === "alert" ? "critical" : "warn";
              r.from_persisted_signal = true;
              if (sig.pct_change != null) {
                r.window_pct_change = sig.pct_change;
                r.window_days = sig.window_days;
                r.pct_change = sig.pct_change;
              }
            }
          }
        } catch (e) {
          console.log("signal_merge_failed", String(e).slice(0, 120));
        }
        // Dedupe by sector: keep newest t.
        const bySector = new Map();
        for (const r of rows) {
          const cur = bySector.get(r.sector);
          if (!cur || (r.t || 0) > (cur.t || 0)) bySector.set(r.sector, r);
        }
        const deduped = Array.from(bySector.values());
        const wantSummary = parts[0] === "summary" || url.searchParams.get("summary") === "1";
        const signalsOnly = url.searchParams.get("signals") === "1";
        const severityFilter = (url.searchParams.get("severity") || "").split(",").filter(Boolean);
        const fieldsParam = url.searchParams.get("fields");
        const limitParam = parseInt(url.searchParams.get("limit") || "0", 10);
        const sevRank = { critical: 3, warn: 2, info: 1 };

        if (wantSummary) {
          const visible = deduped;
          const signals = visible.filter(r => r.has_signal);
          const bySeverity = { critical: 0, warn: 0, info: 0 };
          for (const r of visible) bySeverity[r.severity] = (bySeverity[r.severity] || 0) + 1;
          let top = signals.slice();
          if (url.searchParams.get("group") === "1") {
            const GROUP_OF = (s) => {
              if (s.startsWith("dex-")) return "dex-volume";
              if (s.endsWith("-exchange-spread")) return "exchange-spread";
              return s;
            };
            const groups = new Map();
            for (const r of top) {
              const g = GROUP_OF(r.sector);
              if (!groups.has(g)) groups.set(g, []);
              groups.get(g).push(r);
            }
            const collapsed = [];
            for (const [g, rows] of groups) {
              if (rows.length === 1) { collapsed.push(rows[0]); continue; }
              const lead = rows.reduce((a, b) => Math.abs(b.pct_change) > Math.abs(a.pct_change) ? b : a);
              collapsed.push({ ...lead, sector: g, grouped: true, members: rows.map(r => r.sector) });
            }
            top = collapsed;
          }
          if (severityFilter.length) top = top.filter(r => severityFilter.includes(r.severity));
          top.sort((a, b) => Math.abs(b.pct_change || 0) - Math.abs(a.pct_change || 0));
          const topN = limitParam > 0 ? limitParam : 10;
          const _summary = {
            ts: new Date().toISOString(),
            count: visible.length,
            alerting: signals.length,
            by_severity: bySeverity,
            top: top.slice(0, topN),
            source: "kv_list",
          };
          const _sig = await signLatest(_summary, env);
          if (_sig) _summary.signature = _sig;
          return json(_summary);
        }

        let view = deduped;
        if (signalsOnly) view = view.filter(r => r.has_signal);
        if (severityFilter.length) view = view.filter(r => severityFilter.includes(r.severity));
        if (signalsOnly || url.searchParams.get("sort") === "1") {
          view = view.slice().sort((a, b) =>
            (sevRank[b.severity] || 0) - (sevRank[a.severity] || 0)
            || Math.abs(b.pct_change || 0) - Math.abs(a.pct_change || 0));
        }
        if (limitParam > 0) view = view.slice(0, limitParam);
        let out = view;
        if (fieldsParam) {
          const fields = fieldsParam.split(",");
          out = view.map(r => Object.fromEntries(fields.map(f => [f, r[f]])));
        }
        const _latest = {
          ts: new Date().toISOString(),
          count: deduped.length,
          returned: out.length,
          with_history: deduped.length,
          alerting: deduped.filter(r => r.has_signal).length,
          source: "kv_list",
          rows: out,
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
            // Require at least 7 observations before "confirmed".
            // With fewer samples, "tight current value" is coincidence, not
            // stability — 28.6% of sectors hitting "confirmed" on 5-point
            // histories isn't evidence of anything.
            verdict: rawScore === null
                   ? (sorted.length === 0 ? "no_data" : "insufficient_data")
                   : rawScore >= 0.85 && sorted.length >= 7 ? "confirmed"
                   : rawScore >= 0.5  ? "likely"
                   : "outlier",
            detrended_verdict: detScore === null
                   ? (sorted.length === 0 ? "no_data" : "insufficient_data")
                   : detScore >= 0.85 && sorted.length >= 7 ? "confirmed"
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
      // Populate per-sector window_days for the claim graph.
      // Uses COLLECTORS.config.window_days — the same value that determines
      // pct_change basis — so a prior observation from outside the sector's
      // own comparison window does NOT count as evidence about today's claim.
      const sectorWindows = {};
      for (const [name, c] of Object.entries(COLLECTORS)) {
        if (c?.config?.window_days != null) {
          sectorWindows[name] = c.config.window_days;
        }
      }
      const graph = buildClaimGraph(snapshot, {}, sectorWindows);
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
      // ─── ?days=N — historical correlation stability ───
      // Reads _corr_<date> snapshots written by cron (one per day).
      // For each pair that has ever surfaced: how many days it appeared,
      // mean r, min/max r. A pair at 100% with tight r range is real.
      const days = parseInt(url.searchParams.get("days") || "0", 10);
      if (days > 0) {
        const list = await env.SECTOR_KV.list({ prefix: "_corr_", limit: 1000 });
        const dayKeys = list.keys
          .map(k => ({ name: k.name, date: k.name.replace("_corr_", "") }))
          .filter(k => /^\d{4}-\d{2}-\d{2}$/.test(k.date))
          .sort((a, b) => b.date.localeCompare(a.date))
          .slice(0, days);

        const snapshots = [];
        for (const k of dayKeys) {
          const s = await env.SECTOR_KV.get(k.name, "json");
          if (s && Array.isArray(s.pairs)) snapshots.push(s);
        }

        const pairMap = new Map();
        for (const snap of snapshots) {
          for (const pr of snap.pairs) {
            const key = [pr.a, pr.b].sort().join("|");
            if (!pairMap.has(key)) {
              pairMap.set(key, {
                a: pr.a, b: pr.b,
                days_present: 0,
                r_values: [],
                provenance: pr.provenance === true,
              });
            }
            const entry = pairMap.get(key);
            entry.days_present++;
            entry.r_values.push(pr.r);
          }
        }

        const totalDays = snapshots.length;
        const aggregated = [...pairMap.values()].map(e => {
          const rm = e.r_values.reduce((s, r) => s + r, 0) / e.r_values.length;
          return {
            a: e.a, b: e.b,
            days_present: e.days_present,
            window_days: totalDays,
            stability_pct: totalDays > 0 ? Math.round((e.days_present / totalDays) * 100) : 0,
            r_mean: Math.round(rm * 1000) / 1000,
            r_min: Math.round(Math.min(...e.r_values) * 1000) / 1000,
            r_max: Math.round(Math.max(...e.r_values) * 1000) / 1000,
            provenance: e.provenance,
          };
        }).sort((a, b) => b.days_present - a.days_present || Math.abs(b.r_mean) - Math.abs(a.r_mean));

        // Structure drift: Frobenius distance of r-vectors between consecutive snapshots.
        // Today: 1 snapshot, drifts = []. After Nov 5, 1 real delta value per day.
        const drifts = [];
        if (snapshots.length >= 2) {
          const sortedSnaps = [...snapshots].sort((a, b) => (a.date || "").localeCompare(b.date || ""));
          for (let i = 1; i < sortedSnaps.length; i++) {
            const prev = sortedSnaps[i-1], curr = sortedSnaps[i];
            const rMap = new Map();
            for (const p of prev.pairs || []) rMap.set([p.a, p.b].sort().join("|"), p.r);
            let sumSq = 0, count = 0;
            for (const p of curr.pairs || []) {
              const k = [p.a, p.b].sort().join("|");
              if (rMap.has(k)) {
                const d = p.r - rMap.get(k);
                sumSq += d * d;
                count++;
              }
            }
            drifts.push({
              from: prev.date, to: curr.date,
              pairs_compared: count,
              frobenius: count > 0 ? Math.round(Math.sqrt(sumSq) * 1000) / 1000 : null
            });
          }
        }

        // Pareto frontier on (stability_pct, |r_mean|). A pair is Pareto if no
        // other pair dominates it on both axes.
        for (const p of aggregated) {
          const dominated = aggregated.some(q =>
            q !== p &&
            q.stability_pct >= p.stability_pct &&
            Math.abs(q.r_mean) >= Math.abs(p.r_mean) &&
            (q.stability_pct > p.stability_pct || Math.abs(q.r_mean) > Math.abs(p.r_mean))
          );
          p.pareto = !dominated;
        }

        return json({
          ts: new Date().toISOString(),
          window_days: totalDays,
          dates: snapshots.map(s => s.date),
          pairs: aggregated,
          drifts: drifts,
        });
      }

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
          if (sorted.length >= 10) {
            const det = detrendedResiduals(sorted);
            if (det) {
              // det.ts is days-since-t0 relative (0, 1, 2, ...).
              // Reconstruct absolute timestamps for cross-sector day alignment.
              const t0 = sorted[0].t;
              const absTs = det.ts.map(rel => t0 + rel * 86400000);
              histories[name] = {
                ts: absTs,
                residuals: det.residuals,
                values: sorted.map(x => x.v),
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
          // Align by UTC calendar day (a.ts and b.ts are absolute timestamps).
          const DAY_MS = 86400000;
          const aMap = new Map();
          for (let k = 0; k < a.ts.length; k++) aMap.set(Math.floor(a.ts[k] / DAY_MS), a.residuals[k]);
          const bMap = new Map();
          for (let k = 0; k < b.ts.length; k++) bMap.set(Math.floor(b.ts[k] / DAY_MS), b.residuals[k]);
          const aValMap = new Map();
          for (let k = 0; k < a.ts.length; k++) aValMap.set(Math.floor(a.ts[k] / DAY_MS), a.values[k]);
          const bValMap = new Map();
          for (let k = 0; k < b.ts.length; k++) bValMap.set(Math.floor(b.ts[k] / DAY_MS), b.values[k]);
          const commonDays = [...aMap.keys()].filter(d => bMap.has(d)).sort();
          const minLen = commonDays.length;
          if (minLen < 10) continue;
          const ar = commonDays.map(d => aMap.get(d));
          const br = commonDays.map(d => bMap.get(d));
          const av = commonDays.map(d => aValMap.get(d)).filter(v => Number.isFinite(v));
          const bv = commonDays.map(d => bValMap.get(d)).filter(v => Number.isFinite(v));
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
              stale_data: (av.length >= 5 && new Set(av).size / av.length < 0.25) || (bv.length >= 5 && new Set(bv).size / bv.length < 0.25),
              p_value: pValue !== null ? Number(pValue.toPrecision(3)) : null,
              bonferroni_significant: pValue !== null && pValue < (0.05 / ((names.length * (names.length - 1)) / 2)),
              same_metric_name: (COLLECTORS[names[i]]?.config?.metric || "") === (COLLECTORS[names[j]]?.config?.metric || "") && (COLLECTORS[names[i]]?.config?.metric !== undefined),
              provenance: isProvenance(names[i], names[j]),
              warning: warning,
            });
          }
        }
      }
      pairs.sort((x, y) => y.abs_r - x.abs_r);
      const transitivity = computeTransitivity(pairs);

      // BH-FDR over the full evaluated set, using t-approx p-values.
      // (permutation p-values are floored at 1/200 = 0.005 and cannot
      // achieve BH significance at rank 1 when m is in the thousands.)
      const _allP = pairs.map(p => p.p_value ?? 1);
      const _bhAll = bhAdjust(_allP, 0.05);
      pairs.forEach((p, i) => {
        p.p_bh = Number(_bhAll.adj[i].toPrecision(3));
        p.bh_significant = _bhAll.sig[i];
      });

      // Surface: provenance always; everything else requires proper BH
      // significance on the full test universe, plus strong |r| and n,
      // and no stale-data artifact.
      const surfaced = pairs.filter(p =>
        p.provenance ||
        (p.bh_significant && !p.stale_data && p.abs_r >= 0.7 && p.n >= 15)
      );

      // Augment each surfaced pair with honesty metrics:
      //   - Fisher 95% CI on r (answers "how confident is the magnitude?")
      //   - Permutation p-value (answers "is this real, without normality assumption?")
      // The current p_value uses the t-approximation (assumes bivariate normal),
      // which is wrong for fat-tailed detrended residuals. perm_p is assumption-free.
      for (const p of surfaced) {
        const n = p.n;
        if (n > 3) {
          const z = Math.atanh(p.r);
          const se = 1 / Math.sqrt(n - 3);
          p.ci_low = Math.round(Math.tanh(z - 1.96 * se) * 1000) / 1000;
          p.ci_high = Math.round(Math.tanh(z + 1.96 * se) * 1000) / 1000;
          p.ci_width = Math.round((p.ci_high - p.ci_low) * 1000) / 1000;
        }
        const aData = histories[p.a]?.residuals || [];
        const bData = histories[p.b]?.residuals || [];
        const nn = Math.min(aData.length, bData.length);
        if (nn >= 10) {
          const ar = aData.slice(-nn);
          const br = bData.slice(-nn);
          let exceed = 0;
          for (let k = 0; k < 2000; k++) {
            const shuffled = br.slice();
            for (let i = nn - 1; i > 0; i--) {
              const j = Math.floor(Math.random() * (i + 1));
              [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
            }
            const rPerm = pearson(ar, shuffled);
            if (rPerm !== null && Math.abs(rPerm) >= Math.abs(p.r)) exceed++;
          }
          p.perm_p = Math.round(((exceed + 1) / 2001) * 1e5) / 1e5;
        }
      }

      // 2. Contradiction priors — computed on all pairs (cheap, only r needed)
      for (const p of pairs) {
        const _c = checkContradiction(p.a, p.b, p.r);
        if (_c) p.contradiction = _c;
      }
      // 3. Verdict + reliability on surfaced pairs (they now have all inputs)
      for (const p of surfaced) {
        p.verdict = computeVerdict(p);
        const _rel = computeReliability(p);
        p.reliability = _rel.score;
        p.tier = _rel.tier;
      }


      // ─── ?snapshot=1 — persist today's surfaced pairs for stability tracking ───
      if (url.searchParams.get("snapshot") === "1") {
        try {
          const day = new Date().toISOString().slice(0, 10);
          const snapshot = {
            date: day,
            pairs: surfaced.map(p => ({
              a: p.a, b: p.b, r: p.r, n: p.n,
              provenance: p.provenance === true,
            })),
            count: surfaced.length,
            updated_at: new Date().toISOString(),
          };
          await env.SECTOR_KV.put(`_corr_${day}`, JSON.stringify(snapshot), { expirationTtl: 86400 * 90 });
          console.log(`corr snapshot written: ${day}, ${surfaced.length} pairs`);
        } catch (e) {
          console.log("corr snapshot write failed:", String(e).slice(0, 120));
        }
      }

      return json({
        timestamp: new Date().toISOString(),
        sectors: names.length,
        sector_names: names,
        pairs_count: surfaced.length,
        pairs_evaluated: pairs.length,
        transitivity: transitivity,
        pairs: surfaced,
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
        // Same 0.5% threshold as cron: prevents float-noise writes from GET requests.
        // A sector only writes to KV when its value meaningfully moved since the last write today.
        const threshold = 0.005;
        let valueChanged;
        if (!todayEntry) {
          valueChanged = true;
        } else if (typeof todayEntry.v !== "number" || todayEntry.v === 0) {
          valueChanged = true;
        } else {
          valueChanged = Math.abs(current - todayEntry.v) / Math.abs(todayEntry.v) > threshold;
        }
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

// Provenance: sectors that measure the SAME underlying quantity under
// different names. These are provenance, not cross-sector insight.
//   kraken/coinbase BTC/ETH = same price
//   usgs-earthquakes/usgs-emsc = same earthquake feed
//   treasuries/treasuries-gov = same 10y yield
//   cisa-kev-count/cisa-kev-total = same KEV list
//   gleif-leis/gleif-total-leis = same LEI count
const PROVENANCE_PAIRS = new Set([
  "treasuries|treasuries-gov",
  "cisa-kev-count|cisa-kev-total",
  "gleif-leis|gleif-total-leis",
]);
function isProvenance(a, b) {
  return PROVENANCE_PAIRS.has(a + "|" + b) || PROVENANCE_PAIRS.has(b + "|" + a);
}

// ─── Statistical honesty layer ───────────────────────────────────
// BH-FDR across all candidate pairs
function bhAdjust(pValues, q = 0.05) {
  const m = pValues.length;
  if (m === 0) return { adj: [], sig: [], m };
  const idx = pValues.map((p, i) => ({ p, i })).sort((a, b) => a.p - b.p);
  const adj = new Array(m);
  for (let k = 0; k < m; k++) {
    adj[idx[k].i] = Math.min(1, idx[k].p * m / (k + 1));
  }
  let runningMin = 1;
  for (let k = m - 1; k >= 0; k--) {
    runningMin = Math.min(runningMin, adj[idx[k].i]);
    adj[idx[k].i] = runningMin;
  }
  let maxK = -1;
  for (let k = 0; k < m; k++) if (idx[k].p <= ((k + 1) / m) * q) maxK = k;
  const sig = new Array(m).fill(false);
  for (let k = 0; k <= maxK; k++) sig[idx[k].i] = true;
  return { adj, sig, m };
}

// Contradiction priors — pairs whose r is far from what we expect
const PRIORS = {
  "treasuries|treasuries-gov":       { expect: "identical", tolerance: 0.25 },
  "cisa-kev-count|cisa-kev-total":   { expect: "identical", tolerance: 0.10 },
  "openfda-food-recalls|openfda-device-recalls": { expect: "independent", tolerance: 0.40 },
};

function checkContradiction(a, b, r) {
  const prior = PRIORS[a + "|" + b] || PRIORS[b + "|" + a];
  if (!prior) return null;
  const { expect, tolerance } = prior;
  if (expect === "identical" && Math.abs(1 - r) > tolerance) {
    return { prior: "identical", observed: r, gap: Math.round((Math.abs(1 - r) - tolerance) * 1000) / 1000 };
  }
  if (expect === "independent" && Math.abs(r) > tolerance) {
    return { prior: "independent", observed: r, gap: Math.round((Math.abs(r) - tolerance) * 1000) / 1000 };
  }
  return null;
}

// Verdict: KEEPS provenance pairs as "confirm:provenance" (validation set),
// surfaces non-provenance pairs that pass statistical gates.
function computeVerdict(pair) {
  if (pair.provenance === true) {
    if (pair.contradiction) return "dispute:provenance";
    return "confirm:provenance";
  }
  if (pair.stale_data === true) return "suppress:stale_data";
  if (pair.bh_significant === false) return "suppress:multiple_testing";
  if ((pair.ci_width ?? Infinity) > 0.6) return "suppress:noisy";
  if ((pair.n ?? 0) < 15) return "suppress:too_short";
  if ((pair.abs_r ?? 0) < 0.7) return "suppress:weak";
  return "surface";
}

// Reliability tier: A/B/C/D, or P for provenance (always shown)
function computeReliability(pair) {
  if (pair.provenance === true) return { score: 100, tier: "P" };
  const cCi = 1 - Math.min(1, pair.ci_width ?? 1);
  const cP  = 1 - Math.min(1, pair.perm_p_adj ?? pair.p_value ?? 1);
  const cStab = 0.5;   // neutral until ?days=N has 3+ days
  const cRange = 0.5;
  let score = 0.35 * cCi + 0.25 * cP + 0.25 * cStab + 0.15 * cRange;
  if (pair.bh_significant === false) score *= 0.5;
  const pct = Math.round(score * 100);
  const tier = pct >= 75 ? "A" : pct >= 55 ? "B" : pct >= 35 ? "C" : "D";
  return { score: pct, tier };
}


// Transitivity check on the provenance subgraph. A "gluing obstruction"
// is a triple (A-B, B-C, A-C) where two edges claim high correlation
// (>0.9) but the third contradicts them (|r| < 0.75). If B is genuinely
// a proxy for A and C, then A and C should correlate. If they don't,
// at least one provenance claim is wrong.
//
// Today: 0 triples (only 2 provenance pairs, no shared sectors).
// Becomes meaningful when a 3rd source for an already-paired metric is added.
function computeTransitivity(pairs) {
  const prov = pairs.filter(p => p.provenance === true);
  if (prov.length < 2) return { triples_checked: 0, obstructions: [] };
  const bySector = new Map();
  for (const p of prov) {
    for (const s of [p.a, p.b]) {
      if (!bySector.has(s)) bySector.set(s, []);
      bySector.get(s).push(p);
    }
  }
  const obstructions = [];
  let checked = 0;
  const seen = new Set();
  for (const [mid, edges] of bySector) {
    if (edges.length < 2) continue;
    for (let i = 0; i < edges.length; i++) {
      for (let j = i + 1; j < edges.length; j++) {
        const e1 = edges[i], e2 = edges[j];
        const other1 = e1.a === mid ? e1.b : e1.a;
        const other2 = e2.a === mid ? e2.b : e2.a;
        if (other1 === other2) continue;
        const ac = prov.find(p =>
          (p.a === other1 && p.b === other2) || (p.a === other2 && p.b === other1)
        );
        if (!ac) continue;
        const key = [other1, mid, other2].sort().join("|");
        if (seen.has(key)) continue;
        seen.add(key);
        checked++;
        if (e1.r > 0.9 && e2.r > 0.9 && Math.abs(ac.r) < 0.75) {
          obstructions.push({
            triple: [other1, mid, other2],
            r_ab: e1.r, r_bc: e2.r, r_ac: ac.r,
            gap: Math.round((0.75 - Math.abs(ac.r)) * 1000) / 1000
          });
        }
      }
    }
  }
  return { triples_checked: checked, obstructions };
}
