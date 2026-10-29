// sector-sparse: consolidated worker for all sparse/event sectors
// Routes: /{sector}/signal, /{sector}/raw, /{sector}/health

async function fetchSafe(fn) {
  try { return { ok: true, data: await fn() }; }
  catch (e) { return { ok: false, error: String(e).slice(0, 120) }; }
}

function ghHeaders(env) {
  const h = { 'user-agent': 'VolatiAI/1.0', 'accept': 'application/vnd.github+json' };
  if (env.GITHUB_TOKEN) h['authorization'] = 'Bearer ' + env.GITHUB_TOKEN;
  return h;
}

function parseRSSFirstItem(text) {
  const items = text.match(/<item>[\s\S]*?<\/item>/g);
  if (!items || !items.length) throw new Error('no items');
  const first = items[0];
  const titleMatch = first.match(/<title>(?:<!\[CDATA\[)?([^<\]\>]+)/);
  const linkMatch = first.match(/<link>([^<]+)<\/link>/) || first.match(/<guid[^>]*>([^<]+)<\/guid>/);
  if (!titleMatch) throw new Error('no title');
  return {
    id: (linkMatch ? linkMatch[1] : titleMatch[1]).trim().slice(0, 80),
    title: titleMatch[1].trim().slice(0, 100),
  };
}

// ─── COLLECTORS ─────────────────────────────────────────────

const COLLECTORS = {

  "arbeitnow-job-count": {
    config: { metric: "job_count", threshold_pct: 10, window: "7d", window_days: 7 },
    async collectAll(env) {
      const url = "https://www.arbeitnow.com/api/job-board-api";
      const r = await fetch(url, { headers: { "User-Agent": "VolatiAI/1.0" }, signal: AbortSignal.timeout(20000) });
      if (!r.ok) return { value: null, sources: { arbeitnow: { ok: false, error: `HTTP ${r.status}` } } };
      const j = await r.json();
      const n = Array.isArray(j?.data) ? j.data.length : null;
      return { value: n, sources: { arbeitnow: { ok: n !== null } }, context: { type: "job_listing_count" } };
    },
  },
  "greenhouse-stripe-jobs": {
    config: { metric: "open_job_count", threshold_pct: 15, window: "7d", window_days: 7 },
    async collectAll(env) {
      const url = "https://boards-api.greenhouse.io/v1/boards/stripe/jobs";
      const r = await fetch(url, { headers: { "User-Agent": "VolatiAI/1.0" }, signal: AbortSignal.timeout(20000) });
      if (!r.ok) return { value: null, sources: { greenhouse: { ok: false, error: `HTTP ${r.status}` } } };
      const j = await r.json();
      const n = Array.isArray(j?.jobs) ? j.jobs.length : null;
      return { value: n, sources: { greenhouse: { ok: n !== null } }, context: { company: "Stripe" } };
    },
  },
  "usgs-streamflow-potomac": {
    config: { metric: "streamflow_cfs", threshold_pct: 20, window: "1d", window_days: 1 },
    async collectAll(env) {
      const url = "https://waterservices.usgs.gov/nwis/iv/?format=json&sites=01646500&parameterCd=00060&period=P1D";
      const r = await fetch(url, { headers: { "User-Agent": "VolatiAI/1.0" }, signal: AbortSignal.timeout(25000) });
      if (!r.ok) return { value: null, sources: { usgs_water: { ok: false, error: `HTTP ${r.status}` } } };
      const j = await r.json();
      const series = j?.value?.timeSeries?.[0]?.values?.[0]?.value;
      const last = Array.isArray(series) && series.length > 0 ? series[series.length - 1] : null;
      const n = last?.value ? parseFloat(last.value) : null;
      return { value: Number.isFinite(n) ? n : null, sources: { usgs_water: { ok: Number.isFinite(n) } }, context: { site: "01646500", river: "Potomac at Little Falls", unit: "cfs" } };
    },
  },
  "espn-mlb-events-count": {
    config: { metric: "game_count", threshold_pct: 20, window: "1d", window_days: 1 },
    async collectAll(env) {
      const url = "https://site.api.espn.com/apis/site/v2/sports/baseball/mlb/scoreboard";
      const r = await fetch(url, { headers: { "User-Agent": "VolatiAI/1.0" }, signal: AbortSignal.timeout(15000) });
      if (!r.ok) return { value: null, sources: { espn_mlb: { ok: false, error: `HTTP ${r.status}` } } };
      const j = await r.json();
      const n = Array.isArray(j?.events) ? j.events.length : null;
      return { value: n, sources: { espn_mlb: { ok: n !== null } }, context: { sport: "baseball", league: "MLB" } };
    },
  },
  "espn-epl-events-count": {
    config: { metric: "match_count", threshold_pct: 20, window: "1d", window_days: 1 },
    async collectAll(env) {
      const url = "https://site.api.espn.com/apis/site/v2/sports/soccer/eng.1/scoreboard";
      const r = await fetch(url, { headers: { "User-Agent": "VolatiAI/1.0" }, signal: AbortSignal.timeout(15000) });
      if (!r.ok) return { value: null, sources: { espn_epl: { ok: false, error: `HTTP ${r.status}` } } };
      const j = await r.json();
      const n = Array.isArray(j?.events) ? j.events.length : null;
      return { value: n, sources: { espn_epl: { ok: n !== null } }, context: { sport: "soccer", league: "English Premier League" } };
    },
  },
  "open-meteo-soil-temp": {
    config: { metric: "soil_temp_c", threshold_pct: 20, window: "1d", window_days: 1 },
    async collectAll(env) {
      const url = "https://api.open-meteo.com/v1/forecast?latitude=52.52&longitude=13.41&hourly=soil_temperature_0cm&forecast_days=1";
      const r = await fetch(url, { headers: { "User-Agent": "VolatiAI/1.0" }, signal: AbortSignal.timeout(15000) });
      if (!r.ok) return { value: null, sources: { openmeteo_soil: { ok: false, error: `HTTP ${r.status}` } } };
      const j = await r.json();
      const arr = j?.hourly?.soil_temperature_0cm;
      const n = Array.isArray(arr) ? arr.filter(x => typeof x === "number").pop() : null;
      return { value: typeof n === "number" ? n : null, sources: { openmeteo_soil: { ok: typeof n === "number" } }, context: { location: "Berlin" } };
    },
  },
  "denmark-traffic-incidents": {
    config: { metric: "active_traffic_incidents", threshold_pct: 30, window: "1d", window_days: 1 },
    async collectAll(env) {
      const r = await fetch("https://storage.googleapis.com/trafikkort-data/geojson/big-screen-events.json", {
        headers: { "User-Agent": "VolatiAI/1.0" },
        signal: AbortSignal.timeout(20000),
      });
      if (!r.ok) return { value: null, sources: { denmark: { ok: false, error: `HTTP ${r.status}` } } };
      const j = await r.json();
      const n = Array.isArray(j) ? j.length : (Array.isArray(j?.features) ? j.features.length : null);
      return { value: n, sources: { denmark: { ok: n !== null } }, context: { country: "DK", type: "live_traffic_events" } };
    },
  },
  "webtris-uk-traffic-sites": {
    config: { metric: "monitored_traffic_sites", threshold_pct: 1, window: "30d", window_days: 30 },
    async collectAll(env) {
      const r = await fetch("https://webtris.highwaysengland.co.uk/api/v1.0/sites", {
        headers: { "User-Agent": "VolatiAI/1.0" },
        signal: AbortSignal.timeout(25000),
      });
      if (!r.ok) return { value: null, sources: { webtris: { ok: false, error: `HTTP ${r.status}` } } };
      const j = await r.json();
      const n = Array.isArray(j?.sites) ? j.sites.length : null;
      return { value: n, sources: { webtris: { ok: n !== null } }, context: { country: "UK", network: "strategic_road_network" } };
    },
  },
  "ripe-atlas-connected-probes": {
    config: { metric: "connected_probes", threshold_pct: 2, window: "7d", window_days: 7 },
    async collectAll(env) {
      const r = await fetch("https://atlas.ripe.net/api/v2/probes/?format=json&status=1", {
        headers: { "User-Agent": "VolatiAI/1.0" },
        signal: AbortSignal.timeout(20000),
      });
      if (!r.ok) return { value: null, sources: { ripeatlas: { ok: false, error: `HTTP ${r.status}` } } };
      const j = await r.json();
      const n = typeof j?.count === "number" ? j.count : null;
      return { value: n, sources: { ripeatlas: { ok: n !== null } }, context: { type: "global_connectivity_probes" } };
    },
  },
  "azmth-active-satellite-count": {
    config: { metric: "active_satellite_count", threshold_pct: 2, window: "30d", window_days: 30 },
    async collectAll(env) {
      const r = await fetch("https://azmth.space/stats.json", {
        headers: { "User-Agent": "VolatiAI/1.0" },
        signal: AbortSignal.timeout(20000),
      });
      if (!r.ok) return { value: null, sources: { azmth: { ok: false, error: `HTTP ${r.status}` } } };
      const j = await r.json();
      const n = typeof j?.active === "number" ? j.active : null;
      const constellations = Array.isArray(j?.byConstellation) ? j.byConstellation.length : null;
      return { value: n, sources: { azmth: { ok: n !== null } }, context: { constellation_count: constellations, data_as_of: j?.data_as_of } };
    },
  },
  "geocables-active-incidents": {
    config: { metric: "active_cable_incidents", threshold_pct: 50, window: "7d", window_days: 7 },
    async collectAll(env) {
      const r = await fetch("https://geocables.com/api/v1/status", {
        headers: { "User-Agent": "VolatiAI/1.0" },
        signal: AbortSignal.timeout(20000),
      });
      if (!r.ok) return { value: null, sources: { geocables: { ok: false, error: `HTTP ${r.status}` } } };
      const j = await r.json();
      const d = j?.data ?? j;
      const n = typeof d?.active_alerts === "number" ? d.active_alerts : null;
      return { value: n, sources: { geocables: { ok: n !== null } }, context: { incidents_total: d?.incidents_total, routes_measured_24h: d?.routes_measured_24h } };
    },
  },
  "noaa-swpc-kp-index": {
    config: { metric: "kp_index", threshold_pct: 50, window: "7d", window_days: 7 },
    async collectAll(env) {
      const r = await fetch("https://services.swpc.noaa.gov/json/planetary_k_index_1m.json", {
        headers: { "User-Agent": "VolatiAI/1.0" },
        signal: AbortSignal.timeout(15000),
      });
      if (!r.ok) return { value: null, sources: { swpc: { ok: false, error: `HTTP ${r.status}` } } };
      const j = await r.json();
      let n = null;
      if (Array.isArray(j) && j.length > 0) {
        const last = j[j.length - 1];
        const v = last?.kp_index ?? last?.estimated_kp ?? last?.kp;
        n = typeof v === "number" ? v : (typeof v === "string" ? parseFloat(v) : null);
      }
      return { value: Number.isFinite(n) ? n : null, sources: { swpc: { ok: Number.isFinite(n) } }, context: { source: "NOAA SWPC 1m Kp" } };
    },
  },
  "bgpv6-routing-prefix-count": {
    config: { metric: "total_prefixes", threshold_pct: 5, window: "7d", window_days: 7 },
    async collectAll(env) {
      const r = await fetch("https://bgpv6.com/api/v1/stats", {
        headers: { "User-Agent": "VolatiAI/1.0" },
        signal: AbortSignal.timeout(20000),
      });
      if (!r.ok) return { value: null, sources: { bgpv6: { ok: false, error: `HTTP ${r.status}` } } };
      const j = await r.json();
      const n = typeof j?.total_prefixes === "number" ? j.total_prefixes : null;
      return { value: n, sources: { bgpv6: { ok: n !== null } }, context: { total_asns: j?.total_asns, total_v4: j?.total_v4, total_v6: j?.total_v6, total_countries: j?.total_countries } };
    },
  },
  "pch-active-ixp-count": {
    config: { metric: "active_ixp_count", threshold_pct: 2, window: "30d", window_days: 30 },
    async collectAll(env) {
      const r = await fetch("https://www.pch.net/api/ixp/directory/Active", {
        headers: { "User-Agent": "VolatiAI/1.0" },
        signal: AbortSignal.timeout(25000),
      });
      if (!r.ok) return { value: null, sources: { pch: { ok: false, error: `HTTP ${r.status}` } } };
      const arr = await r.json();
      const n = Array.isArray(arr) ? arr.length : null;
      return { value: n, sources: { pch: { ok: n !== null } }, context: { type: "internet_exchange_points" } };
    },
  },
  "mlb-team-count": {
    config: { metric: "mlb_team_count", threshold_pct: 1, window: "30d", window_days: 30 },
    async collectAll(env) {
      const r = await fetch("https://statsapi.mlb.com/api/v1/teams?sportId=1", {
        headers: { "User-Agent": "VolatiAI/1.0" },
        signal: AbortSignal.timeout(15000),
      });
      if (!r.ok) return { value: null, sources: { mlb: { ok: false, error: `HTTP ${r.status}` } } };
      const j = await r.json();
      const n = Array.isArray(j?.teams) ? j.teams.length : null;
      return { value: n, sources: { mlb: { ok: n !== null } }, context: { sport: "baseball" } };
    },
  },
  "espn-nfl-events-count": {
    config: { metric: "nfl_events_count", threshold_pct: 5, window: "7d", window_days: 7 },
    async collectAll(env) {
      const r = await fetch("https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard", {
        headers: { "User-Agent": "VolatiAI/1.0" },
        signal: AbortSignal.timeout(15000),
      });
      if (!r.ok) return { value: null, sources: { espn: { ok: false, error: `HTTP ${r.status}` } } };
      const j = await r.json();
      const n = Array.isArray(j?.events) ? j.events.length : null;
      return { value: n, sources: { espn: { ok: n !== null } }, context: { sport: "football", league: "nfl" } };
    },
  },
  "unesco-uis-indicator-count": {
    config: { metric: "indicator_count", threshold_pct: 2, window: "30d", window_days: 30 },
    async collectAll(env) {
      const r = await fetch("https://api.uis.unesco.org/api/public/definitions/indicators", {
        headers: { "User-Agent": "VolatiAI/1.0" },
        signal: AbortSignal.timeout(20000),
      });
      if (!r.ok) return { value: null, sources: { uis: { ok: false, error: `HTTP ${r.status}` } } };
      const j = await r.json();
      const n = Array.isArray(j) ? j.length : (Array.isArray(j?.indicators) ? j.indicators.length : null);
      return { value: n, sources: { uis: { ok: n !== null } }, context: { scope: "education_indicators" } };
    },
  },
  "ethereum-block-height-publicnode": {
    config: { metric: "block_height", threshold_pct: 1, window: "7d", window_days: 7 },
    async collectAll(env) {
      const r = await fetch("https://ethereum-rpc.publicnode.com", {
        method: "POST",
        headers: { "Content-Type": "application/json", "User-Agent": "VolatiAI/1.0" },
        body: JSON.stringify({ jsonrpc: "2.0", method: "eth_blockNumber", params: [], id: 1 }),
        signal: AbortSignal.timeout(15000),
      });
      if (!r.ok) return { value: null, sources: { publicnode: { ok: false, error: `HTTP ${r.status}` } } };
      const j = await r.json();
      const hex = j?.result;
      const n = typeof hex === "string" ? parseInt(hex, 16) : null;
      return { value: Number.isFinite(n) ? n : null, sources: { publicnode: { ok: Number.isFinite(n) } }, context: { chain: "ethereum" } };
    },
  },
  "wax-block-height": {
    config: { metric: "head_block_num", threshold_pct: 1, window: "7d", window_days: 7 },
    async collectAll(env) {
      const r = await fetch("https://wax.greymass.com/v1/chain/get_info", {
        method: "POST",
        headers: { "Content-Type": "application/json", "User-Agent": "VolatiAI/1.0" },
        body: "{}",
        signal: AbortSignal.timeout(15000),
      });
      if (!r.ok) return { value: null, sources: { wax: { ok: false, error: `HTTP ${r.status}` } } };
      const j = await r.json();
      const n = typeof j?.head_block_num === "number" ? j.head_block_num : null;
      return { value: n, sources: { wax: { ok: n !== null } }, context: { chain: "wax" } };
    },
  },
  "defillama-dex-volume-24h": {
    config: { metric: "dex_volume_usd_24h", threshold_pct: 10, window: "7d", window_days: 7 },
    async collectAll(env) {
      const url = "https://api.llama.fi/overview/dexs";
      const r = await fetch(url, {
        headers: { "User-Agent": "VolatiAI/1.0" },
        signal: AbortSignal.timeout(20000),
      });
      if (!r.ok) return { value: null, sources: { defillama: { ok: false, error: `HTTP ${r.status}` } } };
      const j = await r.json();
      const n = typeof j?.total24h === "number" ? j.total24h : null;
      return { value: n, sources: { defillama: { ok: n !== null } }, context: { scope: "all_chains", metric: "dex_volume_24h" } };
    },
  },
  "bitcoin-mempool-tx-count": {
    config: { metric: "unconfirmed_tx_count", threshold_pct: 20, window: "7d", window_days: 7 },
    async collectAll(env) {
      const url = "https://mempool.space/api/mempool";
      const r = await fetch(url, {
        headers: { "User-Agent": "VolatiAI/1.0" },
        signal: AbortSignal.timeout(20000),
      });
      if (!r.ok) return { value: null, sources: { mempool: { ok: false, error: `HTTP ${r.status}` } } };
      const j = await r.json();
      const n = typeof j?.count === "number" ? j.count : null;
      return { value: n, sources: { mempool: { ok: n !== null } }, context: { chain: "bitcoin" } };
    },
  },
  "cantex-canton-dex-tvl": {
    config: { metric: "tvl_cc_usd", threshold_pct: 5, window: "30d", window_days: 30 },
    async collectAll(env) {
      const url = "https://api.cantex.io/v1/public/stats";
      const r = await fetch(url, {
        headers: { "User-Agent": "VolatiAI/1.0" },
        signal: AbortSignal.timeout(20000),
      });
      if (!r.ok) return { value: null, sources: { cantex: { ok: false, error: `HTTP ${r.status}` } } };
      const j = await r.json();
      const v = j?.stats?.pool_tvl?.tvl_cc;
      const n = typeof v === "string" ? parseFloat(v) : (typeof v === "number" ? v : null);
      return { value: Number.isFinite(n) ? n : null, sources: { cantex: { ok: Number.isFinite(n) } }, context: { dex: "canton" } };
    },
  },
  "orca-solana-dex-tvl": {
    config: { metric: "tvl_usd", threshold_pct: 5, window: "30d", window_days: 30 },
    async collectAll(env) {
      const url = "https://api.orca.so/v2/solana/protocol";
      const r = await fetch(url, {
        headers: { "User-Agent": "VolatiAI/1.0" },
        signal: AbortSignal.timeout(20000),
      });
      if (!r.ok) return { value: null, sources: { orca: { ok: false, error: `HTTP ${r.status}` } } };
      const j = await r.json();
      const v = j?.tvl;
      const n = typeof v === "string" ? parseFloat(v) : (typeof v === "number" ? v : null);
      return { value: Number.isFinite(n) ? n : null, sources: { orca: { ok: Number.isFinite(n) } }, context: { dex: "solana" } };
    },
  },
  "akash-provider-count": {
    config: { metric: "provider_count", threshold_pct: 5, window: "30d", window_days: 30 },
    async collectAll(env) {
      const url = "https://console-api.akash.network/v1/providers";
      const r = await fetch(url, {
        headers: { "User-Agent": "VolatiAI/1.0" },
        signal: AbortSignal.timeout(20000),
      });
      if (!r.ok) return { value: null, sources: { akash: { ok: false, error: `HTTP ${r.status}` } } };
      const j = await r.json();
      const n = Array.isArray(j) ? j.length : null;
      return { value: n, sources: { akash: { ok: n !== null } }, context: { network: "decentralized_cloud" } };
    },
  },
  "lium-gpu-node-count": {
    config: { metric: "available_gpu_node_count", threshold_pct: 10, window: "30d", window_days: 30 },
    async collectAll(env) {
      const url = "https://lium.io/api/public/v1/nodes";
      const r = await fetch(url, {
        headers: { "User-Agent": "VolatiAI/1.0" },
        signal: AbortSignal.timeout(20000),
      });
      if (!r.ok) return { value: null, sources: { lium: { ok: false, error: `HTTP ${r.status}` } } };
      const j = await r.json();
      const n = typeof j.count === "number" ? j.count : null;
      return { value: n, sources: { lium: { ok: n !== null } }, context: { type: "gpu_nodes" } };
    },
  },
  "openfda-drug-event-total": {
    config: { metric: "adverse_event_count", threshold_pct: 2, window: "30d", window_days: 30 },
    async collectAll(env) {
      const url = "https://api.fda.gov/drug/event.json?limit=1";
      const r = await fetch(url, {
        headers: { "User-Agent": "VolatiAI/1.0" },
        signal: AbortSignal.timeout(20000),
      });
      if (!r.ok) return { value: null, sources: { openfda: { ok: false, error: `HTTP ${r.status}` } } };
      const j = await r.json();
      const n = j?.meta?.results?.total ?? null;
      return { value: typeof n === "number" ? n : null, sources: { openfda: { ok: typeof n === "number" } } };
    },
  },
  "clinicaltrials-study-total": {
    config: { metric: "study_count", threshold_pct: 2, window: "30d", window_days: 30 },
    async collectAll(env) {
      const url = "https://clinicaltrials.gov/api/v2/studies?pageSize=1&countTotal=true";
      const r = await fetch(url, {
        headers: { "User-Agent": "VolatiAI/1.0" },
        signal: AbortSignal.timeout(20000),
      });
      if (!r.ok) return { value: null, sources: { ctgov: { ok: false, error: `HTTP ${r.status}` } } };
      const j = await r.json();
      const n = typeof j?.totalCount === "number" ? j.totalCount : null;
      return { value: n, sources: { ctgov: { ok: n !== null } } };
    },
  },
  "worldbank-poverty-headcount": {
    config: { metric: "poverty_pct", threshold_pct: 2, window: "365d", window_days: 365 },
    async collectAll(env) {
      const url = "https://api.worldbank.org/v2/country/WLD/indicator/SI.POV.DDAY?format=json&per_page=1&date=2022";
      const r = await fetch(url, {
        headers: { "User-Agent": "VolatiAI/1.0" },
        signal: AbortSignal.timeout(20000),
      });
      if (!r.ok) return { value: null, sources: { worldbank: { ok: false, error: `HTTP ${r.status}` } } };
      const j = await r.json();
      const n = j?.[1]?.[0]?.value ?? null;
      return { value: typeof n === "number" ? n : null, sources: { worldbank: { ok: typeof n === "number" } }, context: { indicator: "SI.POV.DDAY", country: "WLD", year: 2022 } };
    },
  },
  "fema-disaster-declarations": {
    config: { metric: "declaration_count", threshold_pct: 1, window: "30d", window_days: 30 },
    async collectAll(env) {
      const url = "https://www.fema.gov/api/open/v2/DisasterDeclarationsSummaries?$inlinecount=allpages&$top=1";
      const r = await fetch(url, {
        headers: { "User-Agent": "VolatiAI/1.0" },
        signal: AbortSignal.timeout(20000),
      });
      if (!r.ok) return { value: null, sources: { fema: { ok: false, error: `HTTP ${r.status}` } } };
      const j = await r.json();
      const n = j?.metadata?.count ?? null;
      return { value: typeof n === "number" ? n : null, sources: { fema: { ok: typeof n === "number" } } };
    },
  },
  "elexon-uk-grid-frequency": {
    config: { metric: "grid_frequency_hz", threshold_pct: 0.5, window: "1d", window_days: 1 },
    async collectAll(env) {
      const url = "https://data.elexon.co.uk/bmrs/api/v1/system/frequency";
      const r = await fetch(url, {
        headers: { "User-Agent": "VolatiAI/1.0" },
        signal: AbortSignal.timeout(20000),
      });
      if (!r.ok) return { value: null, sources: { elexon: { ok: false, error: `HTTP ${r.status}` } } };
      const j = await r.json();
      const rows = Array.isArray(j) ? j : (Array.isArray(j?.data) ? j.data : null);
      if (!rows || rows.length === 0) {
        return { value: null, sources: { elexon: { ok: false, error: "no rows" } } };
      }
      const latest = rows[rows.length - 1];
      const n = latest?.frequency ?? null;
      return { value: typeof n === "number" ? n : null, sources: { elexon: { ok: typeof n === "number" } }, context: { region: "UK", time: latest.measurementTime } };
    },
  },
  "phishdestroy-active-domains": {
    config: { metric: "active_domain_count", threshold_pct: 5, window: "30d", window_days: 30 },
    async collectAll(env) {
      const url = "https://phishdestroy.io/api/stats.php";
      const r = await fetch(url, {
        headers: { "User-Agent": "VolatiAI/1.0", "Accept": "application/json" },
        signal: AbortSignal.timeout(15000),
      });
      if (!r.ok) return { value: null, sources: { phishdestroy: { ok: false, error: `HTTP ${r.status}` } } };
      const j = await r.json();
      const n = j?.counts?.primary_active ?? j?.counts?.total_active ?? null;
      return { value: typeof n === "number" ? n : null, sources: { phishdestroy: { ok: typeof n === "number" } }, context: { lastSync: j.lastSync } };
    },
  },
  "us-containerships-awaiting-berths": {
    config: { metric: "vessel_count", threshold_pct: 20, window: "30d", window_days: 30 },
    async collectAll(env) {
      const indicator = "Number of Containerships Awaiting Berths at all U.S. Ports";
      const url = `https://data.bts.gov/resource/y5ut-ibwt.json?$where=${encodeURIComponent(`indicator='${indicator}'`)}&$order=date DESC&$limit=1`;
      const r = await fetch(url, {
        headers: { "User-Agent": "VolatiAI/1.0" },
        signal: AbortSignal.timeout(20000),
      });
      if (!r.ok) return { value: null, sources: { bts: { ok: false, error: `HTTP ${r.status}` } } };
      const arr = await r.json();
      if (!Array.isArray(arr) || arr.length === 0) {
        return { value: null, sources: { bts: { ok: false, error: "no rows" } } };
      }
      const n = parseFloat(arr[0].value1);
      return { value: Number.isFinite(n) ? n : null, sources: { bts: { ok: Number.isFinite(n) } }, context: { indicator, date: arr[0].date } };
    },
  },
  "hormuz-daily-transits": {
    config: { metric: "avg_daily_transits", threshold_pct: 25, window: "30d", window_days: 30 },
    async collectAll(env) {
      const url = "https://hormuz.now/api/status";
      const r = await fetch(url, {
        headers: { "User-Agent": "VolatiAI/1.0" },
        signal: AbortSignal.timeout(15000),
      });
      if (!r.ok) return { value: null, sources: { hormuz: { ok: false, error: `HTTP ${r.status}` } } };
      const j = await r.json();
      const n = j?.avg7d ?? j?.last7d?.total ?? null;
      return { value: typeof n === "number" ? n : null, sources: { hormuz: { ok: typeof n === "number" } }, context: { strait: "hormuz", status: j?.status?.level } };
    },
  },
  "us-nuclear-plants-count": {
    config: { metric: "plant_count", threshold_pct: 1, window: "30d", window_days: 30 },
    async collectAll(env) {
      const url = "https://powerplantsnearme.com/api/plants?fuel=nuclear&limit=1000";
      const r = await fetch(url, {
        headers: { "User-Agent": "VolatiAI/1.0" },
        signal: AbortSignal.timeout(15000),
      });
      if (!r.ok) return { value: null, sources: { ppnm: { ok: false, error: `HTTP ${r.status}` } } };
      const j = await r.json();
      const n = j.count ?? (Array.isArray(j.plants) ? j.plants.length : null);
      return { value: n, sources: { ppnm: { ok: n !== null } }, context: { fuel: "nuclear", country: "US" } };
    },
  },
  "finland-ais-vessels": {
    config: { metric: "vessel_count", threshold_pct: 10, window: "30d", window_days: 30 },
    async collectAll(env) {
      const url = "https://meri.digitraffic.fi/api/ais/v1/locations?radius=10&latitude=60.16&longitude=24.94";
      const r = await fetch(url, {
        headers: {
          "User-Agent": "VolatiAI/1.0",
          "Digitraffic-User": "VolatiAI/1.0",
          "Accept-Encoding": "gzip",
        },
        signal: AbortSignal.timeout(20000),
      });
      if (!r.ok) return { value: null, sources: { digitraffic: { ok: false, error: `HTTP ${r.status}` } } };
      const j = await r.json();
      const n = Array.isArray(j.features) ? j.features.length : null;
      return { value: n, sources: { digitraffic: { ok: n !== null } }, context: { region: "helsinki-10mi" } };
    },
  },
  "ebi-ols4-climate-terms": {
    config: { metric: "ontology_term_count", threshold_pct: 3, window: "30d", window_days: 30 },
    async collectAll(env) {
      const url = "https://www.ebi.ac.uk/ols4/api/search?q=climate&size=1";
      const r = await fetch(url, {
        headers: { "User-Agent": "VolatiAI/1.0 (contact@fourieranalys.workers.dev)" },
        signal: AbortSignal.timeout(20000),
      });
      if (!r.ok) return { value: null, sources: { ols4: { ok: false, error: `HTTP ${r.status}` } } };
      const j = await r.json();
      const n = j?.response?.numFound ?? null;
      return { value: n, sources: { ols4: { ok: n !== null } }, context: { query: "climate" } };
    },
  },
  "usgs-geomag-boulder": {
    config: { metric: "hz_nanotesla", threshold_pct: 5, window: "1h", window_days: 0 },
    async collectAll(env) {
      const _now = new Date();
      const _start = new Date(_now.getTime() - 6 * 3600000);
      const _fmt = (d) => d.toISOString().slice(0, 19) + "Z";
      const url = `https://geomag.usgs.gov/ws/data/?id=BOU&format=json&starttime=${_fmt(_start)}`;;
      const r = await fetch(url, { headers: { "User-Agent": "VolatiAI/1.0" }, signal: AbortSignal.timeout(15000) });
      if (!r.ok) return { value: null, sources: { geomag: { ok: false } } };
      const j = await r.json();
      const vals = Array.isArray(j?.values) ? j.values : [];
      const last = vals.length > 0 ? vals[vals.length - 1] : null;
      return { value: last && typeof last[0] === "number" ? last[0] : null, sources: { geomag: { ok: true } }, context: { observatory: "BOU", samples: vals.length } };
    },
  },
  "unesco-marine-heritage-count": {
    config: { metric: "site_count", threshold_pct: 2, window: "30d", window_days: 30 },
    async collectAll(env) {
      const url = "https://services1.arcgis.com/B4MnusZHL3vmqU3t/arcgis/rest/services/UNESCO/FeatureServer/0/query?where=1%3D1&returnCountOnly=true&f=json";
      const r = await fetch(url, { headers: { "User-Agent": "VolatiAI/1.0" }, signal: AbortSignal.timeout(15000) });
      if (!r.ok) return { value: null, sources: { unesco: { ok: false } } };
      const j = await r.json();
      return { value: typeof j?.count === "number" ? j.count : null, sources: { unesco: { ok: true } }, context: { layer: "UNESCO marine" } };
    },
  },
  "usgs-tnm-elevation-products": {
    config: { metric: "product_count", threshold_pct: 5, window: "30d", window_days: 30 },
    async collectAll(env) {
      const url = "https://tnmaccess.nationalmap.gov/api/v1/products?datasets=National%20Elevation%20Dataset%20(NED)%201%20arc-second&bbox=-105,39,-104,40&max=1";
      const r = await fetch(url, { headers: { "User-Agent": "VolatiAI/1.0" }, signal: AbortSignal.timeout(15000) });
      if (!r.ok) return { value: null, sources: { tnm: { ok: false } } };
      const j = await r.json();
      return { value: typeof j?.total === "number" ? j.total : null, sources: { tnm: { ok: true } }, context: { dataset: "NED 1 arc-second, Denver bbox" } };
    },
  },
  "xaus-gold-spot": {
    config: { metric: "xau_usd", threshold_pct: 1, window: "1d", window_days: 1 },
    async collectAll(env) {
      const r = await fetch("https://xaus.com/api/v1/spot?compact=1", { headers: { "User-Agent": "VolatiAI/1.0" }, signal: AbortSignal.timeout(15000) });
      if (!r.ok) return { value: null, sources: { xaus: { ok: false } } };
      const j = await r.json();
      return { value: typeof j?.xau === "number" ? j.xau : null, sources: { xaus: { ok: true } }, context: { state: j?.state, updated: j?.updated_at } };
    },
  },
  "worldbank-electricity-access": {
    config: { metric: "electricity_access_pct", threshold_pct: 1, window: "1y", window_days: 365 },
    async collectAll(env) {
      const url = "https://api.worldbank.org/v2/country/WLD/indicator/EG.ELC.ACCS.ZS?format=json&per_page=1&date=2023";
      const r = await fetch(url, { headers: { "User-Agent": "VolatiAI/1.0" }, signal: AbortSignal.timeout(15000) });
      if (!r.ok) return { value: null, sources: { worldbank: { ok: false } } };
      const j = await r.json();
      const v = j?.[1]?.[0]?.value;
      return { value: v ? Number(v) : null, sources: { worldbank: { ok: true } }, context: { indicator: "EG.ELC.ACCS.ZS", year: "2023" } };
    },
  },
  "austin-building-permits": {
    config: { metric: "permit_count", threshold_pct: 10, window: "30d", window_days: 30 },
    async collectAll(env) {
      const url = "https://data.austintexas.gov/resource/3syk-w9eu.json?$limit=1&$select=count(*)";
      const r = await fetch(url, { headers: { "User-Agent": "VolatiAI/1.0" }, signal: AbortSignal.timeout(15000) });
      if (!r.ok) return { value: null, sources: { socrata_atx: { ok: false } } };
      const j = await r.json();
      const count = Array.isArray(j) && j[0] ? Number(j[0].count) : null;
      return { value: count, sources: { socrata_atx: { ok: true } }, context: { dataset: "Austin building permits" } };
    },
  },
  "chicago-building-permits": {
    config: { metric: "permit_count", threshold_pct: 10, window: "30d", window_days: 30 },
    async collectAll(env) {
      const url = "https://data.cityofchicago.org/resource/ydr8-5enu.json?$limit=1&$select=count(*)";
      const r = await fetch(url, { headers: { "User-Agent": "VolatiAI/1.0" }, signal: AbortSignal.timeout(15000) });
      if (!r.ok) return { value: null, sources: { socrata_chi: { ok: false } } };
      const j = await r.json();
      const count = Array.isArray(j) && j[0] ? Number(j[0].count) : null;
      return { value: count, sources: { socrata_chi: { ok: true } }, context: { dataset: "Chicago building permits" } };
    },
  },
  "nyc-building-permits": {
    config: { metric: "permit_count", threshold_pct: 10, window: "30d", window_days: 30 },
    async collectAll(env) {
      const url = "https://data.cityofnewyork.us/resource/ipu4-2q9a.json?$limit=1&$select=count(*)";
      const r = await fetch(url, { headers: { "User-Agent": "VolatiAI/1.0" }, signal: AbortSignal.timeout(15000) });
      if (!r.ok) return { value: null, sources: { socrata_nyc: { ok: false } } };
      const j = await r.json();
      const count = Array.isArray(j) && j[0] ? Number(j[0].count) : null;
      return { value: count, sources: { socrata_nyc: { ok: true } }, context: { dataset: "NYC DOB permits" } };
    },
  },
  "simkl-calendar-anime": {
    config: { metric: "anime_release_count", threshold_pct: 10, window: "1d", window_days: 1 },
    async collectAll(env) {
      const url = "https://data.simkl.in/calendar/anime.json?client_id=volatiai&app-name=volatiai&app-version=1.0";
      const r = await fetch(url, { headers: { "User-Agent": "VolatiAI/1.0", "simkl-api-key": "volatiai" }, signal: AbortSignal.timeout(20000) });
      if (!r.ok) return { value: null, sources: { simkl: { ok: false } } };
      const j = await r.json();
      const days = Array.isArray(j) ? j : (j.data || j.calendar || []);
      let total = 0;
      for (const day of days) {
        const items = day?.items || day?.releases || day?.anime || [];
        total += Array.isArray(items) ? items.length : 0;
      }
      return { value: total || (Array.isArray(j) ? j.length : null), sources: { simkl: { ok: true } }, context: { window: "33d", type: "anime" } };
    },
  },
  "ip-geolocation": {
    config: { metric: "egress_ip_octet", threshold_pct: 10, window: "1h", window_days: 0 },
    async collectAll(env) {
      const r = await fetch("http://ip-api.com/json/", { headers: { "User-Agent": "VolatiAI/1.0" }, signal: AbortSignal.timeout(15000) });
      if (!r.ok) return { value: null, sources: { ipapi: { ok: false } } };
      const j = await r.json();
      const ip = j?.query || "";
      const firstOctet = parseInt(ip.split(".")[0], 10);
      return { value: Number.isFinite(firstOctet) ? firstOctet : null, sources: { ipapi: { ok: true } }, context: { ip, country: j?.country } };
    },
  },
  "first-csirt-teams": {
    config: { metric: "team_count", threshold_pct: 2, window: "30d", window_days: 30 },
    async collectAll(env) {
      const r = await fetch("https://api.first.org/data/v1/teams?pretty=true", { headers: { "User-Agent": "VolatiAI/1.0" }, signal: AbortSignal.timeout(15000) });
      if (!r.ok) return { value: null, sources: { first: { ok: false } } };
      const j = await r.json();
      const total = j?.length || (Array.isArray(j?.data) ? j.data.length : null);
      return { value: total, sources: { first: { ok: true } }, context: { status: j?.status } };
    },
  },
  "hibp-breach-range": {
    config: { metric: "breach_count", threshold_pct: 5, window: "30d", window_days: 30 },
    async collectAll(env) {
      const r = await fetch("https://api.pwnedpasswords.com/range/42331", { headers: { "User-Agent": "VolatiAI/1.0" }, signal: AbortSignal.timeout(15000) });
      if (!r.ok) return { value: null, sources: { hibp: { ok: false } } };
      const text = await r.text();
      const lines = text.split("\n").filter(l => l.includes(":"));
      let total = 0;
      for (const line of lines) {
        const parts = line.split(":");
        if (parts.length === 2) total += parseInt(parts[1], 10) || 0;
      }
      return { value: total, sources: { hibp: { ok: true } }, context: { prefix: "42331", suffixes: lines.length } };
    },
  },
  "issued-live-certs-24h": {
    config: { metric: "certs_24h", threshold_pct: 15, window: "1d", window_days: 1 },
    async collectAll(env) {
      const r = await fetch("https://issued.live/api/stats", { headers: { "User-Agent": "VolatiAI/1.0" }, signal: AbortSignal.timeout(15000) });
      if (!r.ok) return { value: null, sources: { "issued.live": { ok: false } } };
      const j = await r.json();
      const certs = j?.totals?.certs_24h;
      return { value: typeof certs === "number" ? certs : null, sources: { "issued.live": { ok: true } }, context: { as_of: j?.as_of, domains: j?.totals?.domains } };
    },
  },
  "fcc-broadband-providers": {
    config: { metric: "provider_count", threshold_pct: 5, window: "30d", window_days: 30 },
    async collectAll(env) {
      const r = await fetch("https://opendata.fcc.gov/resource/v5vt-e7vw.json?$limit=1", { headers: { "User-Agent": "VolatiAI/1.0" }, signal: AbortSignal.timeout(15000) });
      if (!r.ok) return { value: null, sources: { fcc: { ok: false } } };
      const j = await r.json();
      return { value: Array.isArray(j) ? j.length : null, sources: { fcc: { ok: true } }, context: { dataset: "form477" } };
    },
  },
  "sourceful-der-grid": {
    config: { metric: "der_site_count", threshold_pct: 5, window: "7d", window_days: 7 },
    async collectAll(env) {
      const r = await fetch("https://novacore-mainnet.sourceful.dev/public/cells", { headers: { "User-Agent": "VolatiAI/1.0" }, signal: AbortSignal.timeout(15000) });
      if (!r.ok) return { value: null, sources: { sourceful: { ok: false } } };
      const j = await r.json();
      const cells = Array.isArray(j.cells) ? j.cells : [];
      const total = cells.reduce((s, c) => s + (c.site_count || 0), 0);
      return { value: total, sources: { sourceful: { ok: true } }, context: { cells: cells.length } };
    },
  },
  "forecast-solar-berlin": {
    config: { metric: "pv_forecast_wh_day", threshold_pct: 10, window: "1d", window_days: 1 },
    async collectAll(env) {
      // Berlin, south-facing, 35deg tilt, 5 kWp
      const r = await fetch("https://api.forecast.solar/estimate/52.52/13.41/35/0/5", { headers: { "User-Agent": "VolatiAI/1.0" }, signal: AbortSignal.timeout(15000) });
      if (!r.ok) return { value: null, sources: { forecast_solar: { ok: false } } };
      const j = await r.json();
      const day = j?.result?.watt_hours_day;
      const today = day ? Object.values(day)[0] : null;
      return { value: today, sources: { forecast_solar: { ok: true } }, context: { location: "Berlin", kwp: 5 } };
    },
  },
  "miso-wind-solar-generation": {
    config: { metric: "actual_wind_mw", threshold_pct: 10, window: "1h", window_days: 0 },
    async collectAll(env) {
      const r = await fetch("https://public-api.misoenergy.org/api/WindSolar/GetCombined", { headers: { "User-Agent": "VolatiAI/1.0" }, signal: AbortSignal.timeout(15000) });
      if (!r.ok) return { value: null, sources: { miso: { ok: false } } };
      const j = await r.json();
      const rows = Array.isArray(j.instance) ? j.instance : [];
      const latest = rows.filter(x => x.ActualWindValue && Number(x.ActualWindValue) > 0).pop();
      return { value: latest ? Number(latest.ActualWindValue) : null, sources: { miso: { ok: true } }, context: { region: "MISO", solar_mw: latest ? Number(latest.ActualSolarValue) : null } };
    },
  },
  "sec-edgar-ma-8k": {
    config: { metric: "filing_count", threshold_pct: 20, window: "7d", window_days: 7 },
    async collectAll(env) {
      const end = new Date().toISOString().slice(0, 10);
      const start = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);
      const q = encodeURIComponent('"merger"');
      const url = "https://efts.sec.gov/LATEST/search-index?q=" + q + "&forms=8-K&dateRange=custom&startdt=" + start + "&enddt=" + end + "&from=0&size=1";
      const r = await fetch(url, { headers: { "User-Agent": "VolatiAI/1.0 admin@example.com" }, signal: AbortSignal.timeout(15000) });
      if (!r.ok) return { value: null, sources: { "sec-edgar": { ok: false } } };
      const j = await r.json();
      const total = j?.hits?.total?.value ?? null;
      return { value: total, sources: { "sec-edgar": { ok: true } }, context: { form: "8-K", query: "merger" } };
    },
  },
  "tech-eu-exits": {
    config: { metric: "exit_count", threshold_pct: 10, window: "30d", window_days: 30 },
    async collectAll(env) {
      const r = await fetch("https://funding.tech.eu/api/v1/exits?limit=100", { headers: { "User-Agent": "VolatiAI/1.0" }, signal: AbortSignal.timeout(15000) });
      if (!r.ok) return { value: null, sources: { "tech-eu": { ok: false } } };
      const j = await r.json();
      const arr = Array.isArray(j) ? j : (j.data || j.exits || []);
      return { value: Array.isArray(arr) ? arr.length : null, sources: { "tech-eu": { ok: true } }, context: { scope: "europe" } };
    },
  },
  "windsor-drake-ma-transactions": {
    config: { metric: "transaction_count", threshold_pct: 10, window: "7d", window_days: 7 },
    async collectAll(env) {
      const r = await fetch("https://windsordrake.com/market-intelligence/api/transactions.json", { headers: { "User-Agent": "VolatiAI/1.0" }, signal: AbortSignal.timeout(15000) });
      if (!r.ok) return { value: null, sources: { "windsor-drake": { ok: false } } };
      const j = await r.json();
      const arr = Array.isArray(j) ? j : (j.transactions || []);
      return { value: Array.isArray(arr) ? arr.length : null, sources: { "windsor-drake": { ok: true } }, context: { source: "transactions" } };
    },
  },
  "eia-bulk-manifest": {
    config: { metric: "dataset_count", threshold_pct: 0.5, window: "7d", window_days: 7 },
    async collectAll(env) {
      const urls = ["https://api.eia.gov/bulk/manifest.txt", "http://api.eia.gov/bulk/manifest.txt"];
      let text = null;
      for (const u of urls) {
        const r = await fetch(u, { headers: { "User-Agent": "VolatiAI/1.0" }, signal: AbortSignal.timeout(15000) });
        if (r.ok) { text = await r.text(); break; }
      }
      if (!text) return { value: null, sources: { "eia-bulk": { ok: false } } };
      let n = null;
      try {
        const j = JSON.parse(text);
        if (Array.isArray(j)) n = j.length;
        else if (j && Array.isArray(j.dataset)) n = j.dataset.length;
      } catch (e) {}
      if (n === null) {
        const m = text.match(/"identifier"/g);
        n = m ? m.length : null;
      }
      return { value: n, sources: { "eia-bulk": { ok: true } }, context: { source: "manifest" } };
    },
  },
  "cheniere-lng-firm-capacity": {
    config: { metric: "firm_contract_rows", threshold_pct: 10, window: "7d", window_days: 7 },
    async collectAll(env) {
      const end = new Date();
      const start = new Date(Date.now() - 7 * 86400000);
      const fmt = d => d.toISOString().slice(0, 10);
      const url = "https://lngconnectionapi.cheniere.com/api/Transactional/GetFirm?tspNo=200&beginDate=" + fmt(start) + "&endDate=" + fmt(end);
      const r = await fetch(url, { headers: { "User-Agent": "VolatiAI/1.0" }, signal: AbortSignal.timeout(15000) });
      if (!r.ok) return { value: null, sources: { cheniere: { ok: false } } };
      const j = await r.json();
      const rows = Array.isArray(j.report) ? j.report : [];
      return { value: rows.length, sources: { cheniere: { ok: true } }, context: { tspNo: 200, window: "7d" } };
    },
  },
  "texas-rrc-wells": {
    config: { metric: "well_count", threshold_pct: 0.5, window: "7d", window_days: 7 },
    async collectAll(env) {
      const url = "https://services3.arcgis.com/8jYUORGmDUL39WkJ/arcgis/rest/services/WellSHL/FeatureServer/0/query?where=1%3D1&returnCountOnly=true&f=json";
      const r = await fetch(url, { headers: { "User-Agent": "VolatiAI/1.0" }, signal: AbortSignal.timeout(15000) });
      if (!r.ok) return { value: null, sources: { "texas-rrc": { ok: false } } };
      const j = await r.json();
      return { value: typeof j.count === "number" ? j.count : null, sources: { "texas-rrc": { ok: true } }, context: { layer: "WellSHL" } };
    },
  },
  "dbcve-vulnerabilities": {
    config: { metric: "cve_count", threshold_pct: 5, window: "24h", window_days: 1 },
    async collectAll(env) {
      const r = await fetch("https://dbcve.org/api/v1/cves?limit=1");
      if (!r.ok) return { value: null, sources: { dbcve: { ok: false } } };
      const j = await r.json();
      return { value: j.total ?? j.count ?? null, sources: { dbcve: { ok: true } }, context: { source: "dbcve" } };
    },
  },
  "nato-cyber-standards": {
    config: { metric: "standards_count", threshold_pct: null, window: "30d", window_days: 30 },
    async collectAll(env) {
      const r = await fetch("https://api.nato.int/cyber-standards/v1/standards");
      if (!r.ok) return { value: null, sources: { nato: { ok: false } } };
      const j = await r.json();
      return { value: Array.isArray(j.standards) ? j.standards.length : (j.count ?? null), sources: { nato: { ok: true } }, context: { body: "NATO" } };
    },
  },
  "uap-pulse-files": {
    config: { metric: "file_count", threshold_pct: null, window: "30d", window_days: 30 },
    async collectAll(env) {
      const r = await fetch("https://raw.githubusercontent.com/BigBodyCobain/uap-pulse/main/data/files.json");
      if (!r.ok) return { value: null, sources: { uap: { ok: false } } };
      const j = await r.json();
      return { value: Array.isArray(j) ? j.length : (j.total ?? null), sources: { uap: { ok: true } }, context: { corpus: "pentagon_uap" } };
    },
  },
  "war-tracker-events": {
    config: { metric: "event_count", threshold_pct: 20, window: "24h", window_days: 1 },
    async collectAll(env) {
      const r = await fetch("https://war-tracker.com/api/v1/events?limit=1");
      if (!r.ok) return { value: null, sources: { war_tracker: { ok: false } } };
      const j = await r.json();
      const c = Array.isArray(j.events) ? j.events.length : (j.count ?? null);
      return { value: c, sources: { war_tracker: { ok: true } }, context: { scope: "global" } };
    },
  },
  "nasa-cneos-approaches": {
    config: { metric: "close_approaches_30d", threshold_pct: null, window: "30d", window_days: 30 },
    async collectAll(env) {
      const r = await fetch("https://ssd-api.jpl.nasa.gov/cad.api?date-min=2026-01-01&date-max=2026-12-31&dist-max=0.05");
      if (!r.ok) return { value: null, sources: { cneos: { ok: false } } };
      const j = await r.json();
      return { value: j.count ?? null, sources: { cneos: { ok: true } }, context: { window: "2026" } };
    },
  },
  "nasa-ssd-asteroid": {
    config: { metric: "neo_count", threshold_pct: null, window: "30d", window_days: 30 },
    async collectAll(env) {
      const r = await fetch("https://ssd-api.jpl.nasa.gov/sbdb.api?sstr=433");
      if (!r.ok) return { value: null, sources: { ssd: { ok: false } } };
      const j = await r.json();
      return { value: j.object?.neo ? 1 : 0, sources: { ssd: { ok: true } }, context: { object: j.object?.fullname } };
    },
  },
  "nasa-exoplanet-count": {
    config: { metric: "confirmed_exoplanets", threshold_pct: 1, window: "30d", window_days: 30 },
    async collectAll(env) {
      const q = encodeURIComponent("select count(*) from ps where default_flag=1");
      const r = await fetch("https://exoplanetarchive.ipac.caltech.edu/TAP/sync?query=" + q + "&format=json");
      if (!r.ok) return { value: null, sources: { exoplanet: { ok: false } } };
      const j = await r.json();
      return { value: j[0]?.count ?? null, sources: { exoplanet: { ok: true } }, context: { table: "ps" } };
    },
  },
  "nasa-techport-projects": {
    config: { metric: "project_count", threshold_pct: null, window: "30d", window_days: 30 },
    async collectAll(env) {
      const r = await fetch("https://techport.nasa.gov/api/projects?pageSize=1");
      if (!r.ok) return { value: null, sources: { techport: { ok: false } } };
      const j = await r.json();
      return { value: j.totalCount ?? null, sources: { techport: { ok: true } }, context: { program: "techport" } };
    },
  },
  "nasa-image-library": {
    config: { metric: "result_count", threshold_pct: null, window: "7d", window_days: 7 },
    async collectAll(env) {
      const r = await fetch("https://images-api.nasa.gov/search?q=earth&media_type=image&page_size=1");
      if (!r.ok) return { value: null, sources: { images: { ok: false } } };
      const j = await r.json();
      return { value: j.collection?.metadata?.total_hits ?? null, sources: { images: { ok: true } }, context: { query: "earth" } };
    },
  },
  "nasa-cmr-collections": {
    config: { metric: "collection_count", threshold_pct: 5, window: "30d", window_days: 30 },
    async collectAll(env) {
      const r = await fetch("https://cmr.earthdata.nasa.gov/search/collections.json?page_size=1");
      if (!r.ok) return { value: null, sources: { cmr: { ok: false } } };
      const j = await r.json();
      return { value: j.feed?.entry?.length ?? null, sources: { cmr: { ok: true } }, context: { catalog: "earthdata" } };
    },
  },
  "thesportsdb-team-count": {
    config: { metric: "league_count", threshold_pct: null, window: "7d", window_days: 7 },
    async collectAll(env) {
      const r = await fetch("https://www.thesportsdb.com/api/v1/json/123/all_leagues.php");
      if (!r.ok) return { value: null, sources: { thesportsdb: { ok: false } } };
      const j = await r.json();
      return { value: Array.isArray(j.leagues) ? j.leagues.length : null, sources: { thesportsdb: { ok: true } }, context: { endpoint: "all_leagues" } };
    },
  },
  "medlineplus-topic-count": {
    config: { metric: "topic_count", threshold_pct: null, window: "7d", window_days: 7 },
    async collectAll(env) {
      const r = await fetch("https://wsearch.nlm.nih.gov/ws/query?db=healthTopics&term=diabetes&retmax=1");
      if (!r.ok) return { value: null, sources: { medlineplus: { ok: false } } };
      const xml = await r.text();
      const m = xml.match(/<count>(\d+)<\/count>/i);
      return { value: m ? Number(m[1]) : null, sources: { medlineplus: { ok: true } }, context: { query: "diabetes" } };
    },
  },
  "imf-portwatch-chokepoints": {
    config: { metric: "chokepoint_transits", threshold_pct: 0.2, window: "7d", window_days: 7 },
    async collectAll(env) {
      const raw = await env.SECTOR_KV.get("imf-portwatch:latest", "json");
      if (!raw) return { value: null, error: "no KV snapshot", sources: { "imf-portwatch": { ok: false } } };
      const suez = Array.isArray(raw) ? raw.find(r => r.chokepoint === "Suez Canal") : null;
      return {
        value: suez ? suez.vessel_transits : null,
        sources: { "imf-portwatch": { ok: true } },
        context: { as_of: Array.isArray(raw) && raw[0] ? raw[0].date : null },
      };
    },
  },
  "pangaea-earth-datasets": {
    config: { metric: "dataset_count", threshold_pct: 2, window: "30d", window_days: 30 },
    async collectAll(env) {
      const q = encodeURIComponent("Arctic sea ice");
      const url = "https://www.pangaea.de/advanced/search.php?q=" + q + "&count=1";
      const r = await fetch(url);
      if (!r.ok) return { value: null, error: "HTTP " + r.status, sources: { "pangaea": { ok: false } } };
      const html = await r.text();
      const m = html.match(/([0-9,]+)\s+datasets?\s+found/i);
      return {
        value: m ? Number(m[1].replace(/,/g, "")) : null,
        sources: { "pangaea": { ok: true } },
        context: { query: "Arctic sea ice" },
      };
    },
  },
  "gbif-occurrences": {
    config: { metric: "occurrence_count", threshold_pct: 5, window: "30d", window_days: 30 },
    async collectAll(env) {
      const r = await fetch("https://api.gbif.org/v1/occurrence/search?taxonKey=2436436&limit=0");
      if (!r.ok) return { value: null, error: "HTTP " + r.status, sources: { "gbif": { ok: false } } };
      const j = await r.json();
      return { value: j.count || null, sources: { "gbif": { ok: true } }, context: { taxonKey: 2436436 } };
    },
  },
  "japan-statistics-dashboard": {
    config: { metric: "cpi_index", threshold_pct: 0.5, window: "1mo", window_days: 30 },
    async collectAll(env) {
      const url = "https://dashboard.e-stat.go.jp/api/1.0/Json/getData?Lang=EN&IndicatorCode=00001";
      const r = await fetch(url);
      if (!r.ok) return { value: null, error: "HTTP " + r.status, sources: { "e-stat": { ok: false } } };
      const j = await r.json();
      const v = j && j.GET_STATS && j.GET_STATS.STATISTICAL_DATA && j.GET_STATS.STATISTICAL_DATA.DATA_INF && j.GET_STATS.STATISTICAL_DATA.DATA_INF.VALUE && j.GET_STATS.STATISTICAL_DATA.DATA_INF.VALUE[0] ? j.GET_STATS.STATISTICAL_DATA.DATA_INF.VALUE[0]["$"] : null;
      return { value: v ? Number(v) : null, sources: { "e-stat": { ok: true } }, context: { indicator: "00001" } };
    },
  },
  "wayback-availability": {
    config: { metric: "archived", threshold_pct: null, window: "1d", window_days: 1 },
    async collectAll(env) {
      const target = "https://www.imf.org";
      const r = await fetch("https://archive.org/wayback/available?url=" + encodeURIComponent(target));
      if (!r.ok) return { value: null, error: "HTTP " + r.status, sources: { "wayback": { ok: false } } };
      const j = await r.json();
      const closest = j && j.archived_snapshots ? j.archived_snapshots.closest : null;
      return { value: closest ? 1 : 0, sources: { "wayback": { ok: true } }, context: { url: target, snapshot: closest ? closest.timestamp : null } };
    },
  },

  develop: {
    event_source: "ethereum_release",
    ttl: 3600,
    collectAll: async (env) => ({
      sources: {
        ethereum_release: await fetchSafe(async () => {
          const r = await fetch('https://api.github.com/repos/ethereum/go-ethereum/releases?per_page=1', { headers: ghHeaders(env) });
          if (!r.ok) throw new Error('status ' + r.status);
          const j = await r.json();
          if (!Array.isArray(j) || !j[0]) throw new Error('no release');
          return { id: j[0].id, title: j[0].name || j[0].tag_name };
        }),
      },
    }),
  },


  jobs: {
    event_source: "remoteok_latest",
    ttl: 3600,
    collectAll: async (env) => ({
      sources: {
        remoteok_latest: await fetchSafe(async () => {
          const r = await fetch('https://remoteok.com/api', { headers: { 'user-agent': 'VolatiAI/1.0' } });
          if (!r.ok) throw new Error('status ' + r.status);
          const jobs = await r.json();
          if (!Array.isArray(jobs) || jobs.length < 2) throw new Error('no jobs');
          const job = jobs[1];
          return { id: job.id, title: (job.position || 'job') + ' @ ' + (job.company || '?') };
        }),
      },
    }),
  },

  "open-source": {
    event_source: "vscode_release",
    ttl: 3600,
    collectAll: async (env) => ({
      sources: {
        vscode_release: await fetchSafe(async () => {
          const r = await fetch('https://api.github.com/repos/microsoft/vscode/releases?per_page=1', { headers: ghHeaders(env) });
          if (!r.ok) throw new Error('status ' + r.status);
          const j = await r.json();
          if (!Array.isArray(j) || !j[0]) throw new Error('no release');
          return { id: j[0].id, title: (j[0].name || j[0].tag_name) + ' (vscode)' };
        }),
      },
    }),
  },

  "science-math": {
    event_source: "arxiv_math",
    ttl: 3600,
    collectAll: async (env) => ({
      sources: {
        arxiv_math: await fetchSafe(async () => {
          const r = await fetch('http://export.arxiv.org/api/query?search_query=cat:math.*&sortBy=submittedDate&sortOrder=descending&max_results=1');
          if (!r.ok) throw new Error('status ' + r.status);
          const text = await r.text();
          const idM = text.match(/<entry>[\s\S]*?<id>([^<]+)<\/id>/);
          const titleM = text.match(/<entry>[\s\S]*?<title>([^<]+)<\/title>/);
          if (!idM || !titleM) throw new Error('no entry');
          return { id: idM[1].trim(), title: titleM[1].trim().replace(/\s+/g, ' ').slice(0, 100) };
        }),
      },
    }),
  },

  security: {
    event_source: "cisa_kev",
    ttl: 3600,
    collectAll: async (env) => ({
      sources: {
        cisa_kev: await fetchSafe(async () => {
          const r = await fetch('https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json');
          if (!r.ok) throw new Error('status ' + r.status);
          const j = await r.json();
          if (!j.vulnerabilities?.length) throw new Error('no vulns');
          const v = j.vulnerabilities[0];
          return { id: v.cveID, title: v.cveID + ' — ' + (v.vulnerabilityName || 'CISA KEV') };
        }),
      },
    }),
  },

  education: {
    event_source: "arxiv_edu",
    ttl: 3600,
    collectAll: async (env) => ({
      sources: {
        arxiv_edu: await fetchSafe(async () => {
          const r = await fetch('http://export.arxiv.org/api/query?search_query=cat:cs.CY&sortBy=submittedDate&sortOrder=descending&max_results=1');
          if (!r.ok) throw new Error('status ' + r.status);
          const text = await r.text();
          const idM = text.match(/<entry>[\s\S]*?<id>([^<]+)<\/id>/);
          const titleM = text.match(/<entry>[\s\S]*?<title>([^<]+)<\/title>/);
          if (!idM || !titleM) throw new Error('no entry');
          return { id: idM[1].trim(), title: titleM[1].trim().replace(/\s+/g, ' ').slice(0, 100) };
        }),
      },
    }),
  },

  events: {
    event_source: "hn_significant",
    ttl: 1800,
    collectAll: async (env) => ({
      sources: {
        hn_significant: await fetchSafe(async () => {
          const r = await fetch("https://hacker-news.firebaseio.com/v0/topstories.json");
          const ids = await r.json();
          if (!Array.isArray(ids) || !ids.length) throw new Error("no ids");
          // Check top 5 stories, find first with score >= 200
          for (let i = 0; i < Math.min(5, ids.length); i++) {
            const detail = await fetch("https://hacker-news.firebaseio.com/v0/item/" + ids[i] + ".json");
            const s = await detail.json();
            if (s && s.score >= 500 && s.title) {
              return { id: "hn_" + s.id, title: "[" + s.score + "] " + s.title.slice(0, 90) };
            }
          }
          return 0;  // no significant stories right now — valid quiet state
        }),
      },
    }),
  },


  vehicles: {
    event_source: "nhtsa_recall",
    ttl: 3600,
    collectAll: async (env) => ({
      sources: {
        nhtsa_recall: await fetchSafe(async () => {
          const r = await fetch('https://api.nhtsa.gov/recalls/recallsByVehicle?make=honda&model=civic&modelYear=2024');
          if (!r.ok) throw new Error('status ' + r.status);
          const j = await r.json();
          if (!j.results?.length) throw new Error('no recalls');
          const r0 = j.results[0];
          return {
            id: r0.NHTSACampaignNumber || 'unknown',
            title: (r0.Component || 'Recall') + ' — ' + (r0.Summary || '').slice(0, 80),
          };
        }),
      },
    }),
  },

  books: {
    event_source: "openlibrary_recent",
    ttl: 3600,
    collectAll: async (env) => ({
      sources: {
        openlibrary_recent: await fetchSafe(async () => {
          const y = new Date().getFullYear();
          const q = 'first_publish_year:' + y;
          const r = await fetch('https://openlibrary.org/search.json?q=' + encodeURIComponent(q) + '&sort=new&limit=1');
          if (!r.ok) throw new Error('status ' + r.status);
          const j = await r.json();
          if (!j.docs?.length) throw new Error('no docs');
          const b = j.docs[0];
          return {
            id: b.key || b.title,
            title: (b.title || 'unknown') + ' — ' + (b.author_name ? b.author_name[0] : 'unknown'),
          };
        }),
      },
    }),
  },

  music: {
    event_source: "deezer_chart",
    ttl: 3600,
    collectAll: async (env) => ({
      sources: {
        deezer_chart: await fetchSafe(async () => {
          const r = await fetch('https://api.deezer.com/chart/0/tracks?limit=1');
          if (!r.ok) throw new Error('status ' + r.status);
          const j = await r.json();
          if (!j.data?.length) throw new Error('no tracks');
          const t = j.data[0];
          return {
            id: String(t.id),
            title: (t.title || 'unknown') + ' — ' + (t.artist ? t.artist.name : 'unknown'),
          };
        }),
      },
    }),
  },
  science: {
    event_source: "arxiv_physics",
    ttl: 3600,
    collectAll: async (env) => ({
      sources: {
        arxiv_physics: await fetchSafe(async () => {
          const r = await fetch("http://export.arxiv.org/api/query?search_query=cat:physics.*&sortBy=submittedDate&sortOrder=descending&max_results=1");
          if (!r.ok) throw new Error("status " + r.status);
          const text = await r.text();
          const idM = text.match(/<entry>[\s\S]*?<id>([^<]+)<\/id>/);
          const titleM = text.match(/<entry>[\s\S]*?<title>([^<]+)<\/title>/);
          if (!idM || !titleM) throw new Error("no entry");
          return { id: idM[1].trim(), title: titleM[1].trim().replace(/\s+/g, ' ').slice(0, 100) };
        }),
      },
    }),
  },

  "art-design": {
    event_source: "met_daily",
    ttl: 86400,
    collectAll: async (env) => ({
      sources: {
        met_daily: await fetchSafe(async () => {
          // Deterministic object per day — triggers once per day max
          const dayOfYear = Math.floor((Date.now() - new Date(new Date().getFullYear(), 0, 0)) / 86400000);
          const highlights = [45734, 436532, 436121, 436155, 11417, 436947, 437261, 438814, 436839, 437398];
          const objId = highlights[dayOfYear % highlights.length];
          const r = await fetch(`https://collectionapi.metmuseum.org/public/collection/v1/objects/${objId}`);
          if (!r.ok) throw new Error("status " + r.status);
          const obj = await r.json();
          if (!obj.objectID || !obj.title) throw new Error("no object");
          // ID includes date so it changes once per day
          return {
            id: `met_${objId}_${new Date().toISOString().slice(0, 10)}`,
            title: (obj.title || 'untitled').slice(0, 100) + (obj.artistDisplayName ? ' — ' + obj.artistDisplayName.split('\n')[0].slice(0, 40) : ''),
          };
        }),
      },
    }),
  },

  anime: {
    event_source: "kitsu_latest",
    ttl: 3600,
    collectAll: async (env) => ({
      sources: {
        kitsu_latest: await fetchSafe(async () => {
          const r = await fetch("https://kitsu.io/api/edge/anime?page%5Blimit%5D=1&sort=-created_at", {
            headers: { "accept": "application/vnd.api+json" }
          });
          if (!r.ok) throw new Error("status " + r.status);
          const j = await r.json();
          const item = j.data?.[0];
          if (!item) throw new Error("no anime");
          const title = item.attributes?.canonicalTitle || item.attributes?.titles?.en || 'unknown';
          return { id: String(item.id), title: title.slice(0, 80) };
        }),
      },
    }),
  },

  biology: {
    event_source: "pubmed_latest",
    ttl: 3600,
    collectAll: async (env) => ({
      sources: {
        pubmed_latest: await fetchSafe(async () => {
          const search = await fetch("https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=pubmed&term=biology&retmax=1&sort=pub_date&retmode=json");
          if (!search.ok) throw new Error("status " + search.status);
          const sj = await search.json();
          const id = sj.esearchresult?.idlist?.[0];
          if (!id) throw new Error("no id");
          return { id, title: "PubMed " + id };
        }),
      },
    }),
  },


  earthquakes: {
    event_source: "usgs_significant",
    ttl: 3600,
    collectAll: async (env) => ({
      sources: {
        usgs_significant: await fetchSafe(async () => {
          const r = await fetch("https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/significant_week.geojson");
          if (!r.ok) throw new Error("status " + r.status);
          const j = await r.json();
          if (!j.features?.length) throw new Error("no quakes");
          const q = j.features[0];
          const mag = q.properties.mag;
          const place = q.properties.place || "unknown";
          return { id: q.id, title: `M${mag} — ${place}` };
        }),
      },
    }),
  },

  "food-drink": {
    event_source: "fda_food_recall",
    ttl: 3600,
    collectAll: async (env) => ({
      sources: {
        fda_food_recall: await fetchSafe(async () => {
          const r = await fetch("https://api.fda.gov/food/enforcement.json?limit=1&sort=report_date:desc");
          if (!r.ok) throw new Error("status " + r.status);
          const j = await r.json();
          if (!j.results?.length) throw new Error("no recalls");
          const rec = j.results[0];
          return {
            id: rec.recall_number || rec.event_id || 'unknown',
            title: (rec.product_description || 'Recall').slice(0, 100) + ' — ' + (rec.reason_for_recall || '').slice(0, 60),
          };
        }),
      },
    }),
  },

  health: {
    event_source: "disease_sh",
    ttl: 3600,
    collectAll: async (env) => ({
      sources: {
        disease_sh: await fetchSafe(async () => {
          const r = await fetch("https://disease.sh/v3/covid-19/countries/sweden");
          if (!r.ok) throw new Error("status " + r.status);
          const j = await r.json();
          if (!j.country) throw new Error("no data");
          return { id: `se_${j.cases}_${j.deaths}`, title: `Sweden: ${j.cases} cases, ${j.deaths} deaths` };
        }),
      },
    }),
  },

  space: {
    event_source: "astros_in_space",
    ttl: 86400,
    collectAll: async (env) => ({
      sources: {
        astros_in_space: await fetchSafe(async () => {
          const r = await fetch("http://api.open-notify.org/astros.json");
          if (!r.ok) throw new Error("status " + r.status);
          const j = await r.json();
          if (!Array.isArray(j.people) || !j.people.length) throw new Error("no astronauts");
          // Stable ID: sorted list of names (changes only when crew changes)
          const names = j.people.map(p => p.name).sort();
          const crewId = names.join('|');
          return {
            id: `crew_${crewId.length}_${j.number}`,
            title: `${j.number} humans in space: ${names.slice(0, 3).join(', ')}${names.length > 3 ? ', +' + (names.length - 3) + ' more' : ''}`,
          };
        }),
      },
    }),
  },

  podcasts: {
    event_source: "npr_podcast",
    ttl: 3600,
    collectAll: async (env) => ({
      sources: {
        npr_podcast: await fetchSafe(async () => {
          const r = await fetch("https://feeds.npr.org/510289/podcast.xml");
          if (!r.ok) throw new Error("status " + r.status);
          const text = await r.text();
          const items = text.match(/<item>[\s\S]*?<\/item>/g);
          if (!items || !items.length) throw new Error("no items");
          const first = items[0];
          const titleMatch = first.match(/<title>(?:<!\[CDATA\[)?([^<\]]+)/);
          const guidMatch = first.match(/<guid[^>]*>([^<]+)<\/guid>/);
          if (!titleMatch) throw new Error("no title");
          return {
            id: (guidMatch ? guidMatch[1] : titleMatch[1]).trim().slice(0, 80),
            title: titleMatch[1].trim().slice(0, 100),
          };
        }),
      },
    }),
  },

  travel: {
    event_source: "countriesnow",
    ttl: 3600,
    collectAll: async (env) => ({
      sources: {
        countriesnow: await fetchSafe(async () => {
          const r = await fetch("https://countriesnow.space/api/v0.1/countries");
          if (!r.ok) throw new Error("status " + r.status);
          const j = await r.json();
          if (!j.data?.length) throw new Error("no countries");
          const dayOfYear = Math.floor((Date.now() - new Date(new Date().getFullYear(), 0, 0)) / 86400000);
          const c = j.data[dayOfYear % j.data.length];
          return { id: c.country || 'unknown', title: c.country || 'unknown' };
        }),
      },
    }),
  },

  wikipedia: {
    event_source: "wikimedia_top",
    ttl: 3600,
    collectAll: async (env) => ({
      sources: {
        wikimedia_top: await fetchSafe(async () => {
          const d = new Date(Date.now() - 86400000);
          const y = d.getUTCFullYear();
          const m = String(d.getUTCMonth() + 1).padStart(2, '0');
          const day = String(d.getUTCDate()).padStart(2, '0');
          const url = "https://wikimedia.org/api/rest_v1/metrics/pageviews/top/en.wikipedia/all-access/" + y + "/" + m + "/" + day;
          const r = await fetch(url, {
            headers: {
              "User-Agent": "VolatiAI/1.0 (https://github.com/christianscode1994/VolatiAI; contact@volatiai.local)",
              "Accept": "application/json",
            },
          });
          if (!r.ok) throw new Error("status " + r.status);
          const j = await r.json();
          const articles = j.items?.[0]?.articles;
          if (!articles?.length) throw new Error("no articles");
          const top = articles.find(a => a.article !== 'Main_Page') || articles[0];
          const title = decodeURIComponent(top.article).replace(/_/g, ' ');
          return { id: top.article + "_" + y + m + day, title: title + " (" + top.views.toLocaleString() + " views)" };
        }),
      },
    }),
  },

  "arxiv-ai": {
    event_source: "arxiv_cs_ai",
    ttl: 3600,
    collectAll: async (env) => ({
      sources: {
        arxiv_cs_ai: await fetchSafe(async () => {
          const r = await fetch("http://export.arxiv.org/api/query?search_query=cat:cs.AI&sortBy=submittedDate&sortOrder=descending&max_results=1");
          if (!r.ok) throw new Error("status " + r.status);
          const text = await r.text();
          const idM = text.match(/<entry>[\s\S]*?<id>([^<]+)<\/id>/);
          const titleM = text.match(/<entry>[\s\S]*?<title>([^<]+)<\/title>/);
          if (!idM || !titleM) throw new Error("no entry");
          return { id: idM[1].trim(), title: titleM[1].trim().replace(/\s+/g, ' ').slice(0, 100) };
        }),
      },
    }),
  },

  spaceweather: {
    event_source: "noaa_swpc",
    ttl: 3600,
    collectAll: async (env) => ({
      sources: {
        noaa_swpc: await fetchSafe(async () => {
          const r = await fetch("https://services.swpc.noaa.gov/products/alerts.json");
          if (!r.ok) throw new Error("status " + r.status);
          const j = await r.json();
          if (!Array.isArray(j) || !j.length) throw new Error("no alerts");
          const latest = j[j.length - 1];
          const msg = (latest.message || '').split('\n')[0].slice(0, 80);
          return { id: String(latest.issue_datetime || j.length), title: msg || "NOAA space weather alert" };
        }),
      },
    }),
  },



  crossref: {
    event_source: "crossref_latest",
    ttl: 3600,
    collectAll: async (env) => ({
      sources: {
        crossref_latest: await fetchSafe(async () => {
          const r = await fetch("https://api.crossref.org/works?sort=published&order=desc&rows=1");
          if (!r.ok) throw new Error("status " + r.status);
          const j = await r.json();
          const item = j.message?.items?.[0];
          if (!item) throw new Error("no items");
          const title = (item.title?.[0] || 'untitled').slice(0, 100);
          const doi = item.DOI || 'unknown';
          return { id: doi, title: title + " (" + doi + ")" };
        }),
      },
    }),
  },

  openalex: {
    event_source: "openalex_latest",
    ttl: 3600,
    collectAll: async (env) => ({
      sources: {
        openalex_latest: await fetchSafe(async () => {
          const r = await fetch("https://api.openalex.org/works?sort=publication_date:desc&per_page=1&mailto=contact@volatiai.local");
          if (!r.ok) throw new Error("status " + r.status);
          const j = await r.json();
          const work = j.results?.[0];
          if (!work) throw new Error("no works");
          return { id: work.id, title: (work.title || 'untitled').slice(0, 100) };
        }),
      },
    }),
  },

  semanticscholar: {
    event_source: "s2_latest",
    ttl: 3600,
    collectAll: async (env) => ({
      sources: {
        s2_latest: await fetchSafe(async () => {
          const r = await fetch("https://api.semanticscholar.org/graph/v1/paper/search?query=machine%20learning&limit=1&fields=title,paperId");
          if (!r.ok) throw new Error("status " + r.status);
          const j = await r.json();
          const paper = j.data?.[0];
          if (!paper) throw new Error("no papers");
          return { id: paper.paperId, title: (paper.title || 'untitled').slice(0, 100) };
        }),
      },
    }),
  },


  geocoding: {
    event_source: "nominatim_search",
    ttl: 3600,
    collectAll: async (env) => ({
      sources: {
        nominatim_search: await fetchSafe(async () => {
          const r = await fetch("https://nominatim.openstreetmap.org/search?q=Helsinki&format=json&limit=1", {
            headers: { "User-Agent": "VolatiAI/1.0 (contact@volatiai.local)" }
          });
          if (!r.ok) throw new Error("status " + r.status);
          const j = await r.json();
          const place = j?.[0];
          if (!place) throw new Error("no place");
          return { id: place.place_id, title: (place.display_name || 'unknown').slice(0, 100) };
        }),
      },
    }),
  },

  tv: {
    event_source: "tvmaze_schedule",
    ttl: 3600,
    collectAll: async (env) => ({
      sources: {
        tvmaze_schedule: await fetchSafe(async () => {
          const today = new Date().toISOString().slice(0, 10);
          const r = await fetch("https://api.tvmaze.com/schedule?country=US&date=" + today);
          if (!r.ok) throw new Error("status " + r.status);
          const j = await r.json();
          if (!Array.isArray(j) || !j.length) throw new Error("no episodes");
          const ep = j[0];
          const showName = ep._embedded?.show?.name || 'unknown';
          const epName = ep.name || 'episode';
          return { id: String(ep.id), title: showName + " — " + epName };
        }),
      },
    }),
  },

  musicbrainz: {
    event_source: "musicbrainz_release",
    ttl: 3600,
    collectAll: async (env) => ({
      sources: {
        musicbrainz_release: await fetchSafe(async () => {
          const r = await fetch("https://musicbrainz.org/ws/2/release?query=*&limit=1&fmt=json", {
            headers: { "User-Agent": "VolatiAI/1.0 (contact@volatiai.local)" }
          });
          if (!r.ok) throw new Error("status " + r.status);
          const j = await r.json();
          const rel = j.releases?.[0];
          if (!rel) throw new Error("no releases");
          const title = (rel.title || 'unknown') + " — " + (rel.artist_credit?.[0]?.name || 'unknown');
          return { id: rel.id, title: title.slice(0, 100) };
        }),
      },
    }),
  },

  "drug-recall": {
    event_source: "openfda_drug",
    ttl: 3600,
    collectAll: async (env) => ({
      sources: {
        openfda_drug: await fetchSafe(async () => {
          const r = await fetch("https://api.fda.gov/drug/enforcement.json?limit=1&sort=report_date:desc");
          if (!r.ok) throw new Error("status " + r.status);
          const j = await r.json();
          const rec = j.results?.[0];
          if (!rec) throw new Error("no recalls");
          return {
            id: rec.recall_number || 'unknown',
            title: (rec.product_description || 'Drug recall').slice(0, 100) + " — " + (rec.reason_for_recall || '').slice(0, 60),
          };
        }),
      },
    }),
  },

  pubmed: {
    event_source: "pubmed_medicine",
    ttl: 3600,
    collectAll: async (env) => ({
      sources: {
        pubmed_medicine: await fetchSafe(async () => {
          const s = await fetch("https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=pubmed&term=medicine&retmax=1&sort=pub_date&retmode=json");
          if (!s.ok) throw new Error("status " + s.status);
          const sj = await s.json();
          const id = sj.esearchresult?.idlist?.[0];
          if (!id) throw new Error("no id");
          return { id, title: "PubMed " + id };
        }),
      },
    }),
  },


  "sec-filings": {
    event_source: "sec_8k",
    ttl: 3600,
    collectAll: async (env) => ({
      sources: {
        sec_8k: await fetchSafe(async () => {
          const r = await fetch("https://www.sec.gov/cgi-bin/browse-edgar?action=getcurrent&type=8-K&company=&dateb=&owner=include&count=1&output=atom", {
            headers: { "User-Agent": "VolatiAI/1.0 (contact@volatiai.local)" }
          });
          if (!r.ok) throw new Error("status " + r.status);
          const text = await r.text();
          const titleMatch = text.match(/<title>([^<]+)<\/title>/g);
          const entryMatch = text.match(/<entry>[\s\S]*?<title>([^<]+)<\/title>/);
          if (!entryMatch) throw new Error("no entry");
          const idMatch = text.match(/<id>([^<]+)<\/id>/);
          return { id: (idMatch ? idMatch[1] : entryMatch[1]).slice(0, 80), title: entryMatch[1].slice(0, 100) };
        }),
      },
    }),
  },


  "free-games": {
    event_source: "gamerpower",
    ttl: 1800,
    collectAll: async (env) => ({
      sources: {
        gamerpower: await fetchSafe(async () => {
          const r = await fetch("https://www.gamerpower.com/api/giveaways?platform=pc&sort-by=date");
          if (!r.ok) throw new Error("status " + r.status);
          const j = await r.json();
          if (!Array.isArray(j) || !j.length) throw new Error("no giveaways");
          const g = j[0];
          return { id: String(g.id), title: (g.title || 'Free game').slice(0, 100) };
        }),
      },
    }),
  },

  "free-to-play": {
    event_source: "freetogame",
    ttl: 3600,
    collectAll: async (env) => ({
      sources: {
        freetogame: await fetchSafe(async () => {
          const r = await fetch("https://www.freetogame.com/api/games?sort-by=release-date");
          if (!r.ok) throw new Error("status " + r.status);
          const j = await r.json();
          if (!Array.isArray(j) || !j.length) throw new Error("no games");
          const game = j[0];
          return { id: String(game.id), title: (game.title || 'Unknown').slice(0, 100) };
        }),
      },
    }),
  },

  mtg: {
    event_source: "scryfall",
    ttl: 3600,
    collectAll: async (env) => ({
      sources: {
        scryfall: await fetchSafe(async () => {
          const r = await fetch("https://api.scryfall.com/cards/random", {
            headers: { "user-agent": "VolatiAI/1.0", "accept": "application/json" },
            signal: AbortSignal.timeout(15000),
          });
          if (!r.ok) throw new Error("status " + r.status);
          const j = await r.json();
          if (!j.id || !j.name) throw new Error("no card");
          // Use card ID + date so it only triggers once per day
          const day = new Date().toISOString().slice(0, 10);
          return { id: j.id + "_" + day, title: (j.name || 'Unknown card').slice(0, 100) };
        }),
      },
    }),
  },


  audius: {
    event_source: "audius_trending",
    ttl: 3600,
    collectAll: async (env) => ({
      sources: {
        audius_trending: await fetchSafe(async () => {
          const r = await fetch("https://discoveryprovider.audius.co/v1/tracks/trending?limit=1&app_name=VolatiAI");
          if (!r.ok) throw new Error("status " + r.status);
          const j = await r.json();
          const track = j.data?.[0];
          if (!track) throw new Error("no tracks");
          return { id: track.id, title: (track.title || 'Unknown').slice(0, 100) + ' — ' + (track.user?.name || 'Unknown') };
        }),
      },
    }),
  },

  gutendex: {
    event_source: "gutendex_latest",
    ttl: 3600,
    collectAll: async (env) => ({
      sources: {
        gutendex_latest: await fetchSafe(async () => {
          const r = await fetch("https://gutendex.com/books?sort=descending");
          if (!r.ok) throw new Error("status " + r.status);
          const j = await r.json();
          const book = j.results?.[0];
          if (!book) throw new Error("no books");
          return { id: String(book.id), title: (book.title || 'Unknown').slice(0, 100) + ' — ' + (book.authors?.[0]?.name || 'Unknown') };
        }),
      },
    }),
  },

  "depin-network": {
    event_source: "flux_node_count",
    ttl: 3600,
    collectAll: async (env) => ({
      sources: {
        flux_node_count: await fetchSafe(async () => {
          const r = await fetch("https://api.runonflux.io/daemon/getfluxnodecount");
          if (!r.ok) throw new Error("status " + r.status);
          const j = await r.json();
          // Flux returns {status, data: {total, ...}} or {status, data: number}
          const count = typeof j.data === "number"
            ? j.data
            : (j.data?.total ?? j.data?.count ?? null);
          if (count === null || count === undefined) throw new Error("no count in " + JSON.stringify(j.data).slice(0, 100));
          // Bucket to nearest 100 so 1-node fluctuations don't fire.
          // ~1.5% of current ~6800 count = meaningful movement.
          const day = new Date().toISOString().slice(0, 10);
          const bucket = Math.floor(Number(count) / 100) * 100;
          return { id: "flux_" + bucket + "_" + day, title: "Flux nodes: " + Number(count).toLocaleString() };
        }),
      },
    }),
  },

  "github-trending": {
    event_source: "github_trending",
    ttl: 3600,
    collectAll: async (env) => ({
      sources: {
        github_trending: await fetchSafe(async () => {
          const headers = { "user-agent": "VolatiAI/1.0", "accept": "application/vnd.github+json" };
          if (env.GITHUB_TOKEN) headers["authorization"] = "Bearer " + env.GITHUB_TOKEN;
          const r = await fetch("https://api.github.com/search/repositories?q=stars:>1000&sort=stars&order=desc&per_page=1", { headers });
          if (!r.ok) throw new Error("status " + r.status);
          const j = await r.json();
          const repo = j.items?.[0];
          if (!repo) throw new Error("no repos");
          return { id: repo.id, title: repo.full_name + " (" + repo.stargazers_count.toLocaleString() + " stars)" };
        }),
      },
    }),
  },

  "npm-packages": {
    event_source: "npm_latest",
    ttl: 3600,
    collectAll: async (env) => ({
      sources: {
        npm_latest: await fetchSafe(async () => {
          const r = await fetch("https://registry.npmjs.org/-/v1/search?text=keywords:ai&size=1");
          if (!r.ok) throw new Error("status " + r.status);
          const j = await r.json();
          const pkg = j.objects?.[0]?.package;
          if (!pkg) throw new Error("no packages");
          return { id: pkg.name + "@" + pkg.version, title: pkg.name + " v" + pkg.version };
        }),
      },
    }),
  },

  "pypi-packages": {
    event_source: "pypi_trending",
    ttl: 3600,
    collectAll: async (env) => ({
      sources: {
        pypi_trending: await fetchSafe(async () => {
          // Use top-downloaded packages (stable) instead of latest (firehose)
          // Library.io tracks PyPI downloads and provides a JSON API
          const r = await fetch("https://hugovk.github.io/top-pypi-packages/top-pypi-packages-30-days.min.json");
          if (!r.ok) throw new Error("status " + r.status);
          const j = await r.json();
          if (!j.rows || !j.rows.length) throw new Error("no rows");
          // Top package (stable, changes rarely) — only triggers when ranking changes
          const top = j.rows[0];
          const day = new Date().toISOString().slice(0, 10);
          return { id: "pypi_top_" + top.project + "_" + day, title: "Top PyPI: " + top.project + " (" + top.download_count.toLocaleString() + " downloads)" };
        }),
      },
    }),
  },

  "osv-vulnerabilities": {
    event_source: "osv_recent",
    ttl: 3600,
    collectAll: async (env) => ({
      sources: {
        osv_recent: await fetchSafe(async () => {
          // OSV has a query endpoint; use a broad query for recent
          const r = await fetch("https://api.osv.dev/v1/query", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ package: { name: "lodash", ecosystem: "npm" } }),
          });
          if (!r.ok) throw new Error("status " + r.status);
          const j = await r.json();
          const vuln = j.vulns?.[0];
          if (!vuln) throw new Error("no vulns");
          return { id: vuln.id, title: vuln.id + " — " + (vuln.summary || 'vulnerability').slice(0, 80) };
        }),
      },
    }),
  },

  "huggingface-models": {
    event_source: "hf_trending",
    ttl: 3600,
    collectAll: async (env) => ({
      sources: {
        hf_trending: await fetchSafe(async () => {
          const r = await fetch("https://huggingface.co/api/models?sort=downloads&direction=-1&limit=1");
          if (!r.ok) throw new Error("status " + r.status);
          const j = await r.json();
          const model = j[0];
          if (!model) throw new Error("no models");
          return { id: model.modelId, title: model.modelId + " (" + (model.downloads || 0).toLocaleString() + " downloads)" };
        }),
      },
    }),
  },

  "arxiv-cs": {
    event_source: "arxiv_cs_general",
    ttl: 3600,
    collectAll: async (env) => ({
      sources: {
        arxiv_cs_general: await fetchSafe(async () => {
          const r = await fetch("http://export.arxiv.org/api/query?search_query=cat:cs.*&sortBy=submittedDate&sortOrder=descending&max_results=1");
          if (!r.ok) throw new Error("status " + r.status);
          const text = await r.text();
          const idM = text.match(/<entry>[\s\S]*?<id>([^<]+)<\/id>/);
          const titleM = text.match(/<entry>[\s\S]*?<title>([^<]+)<\/title>/);
          if (!idM || !titleM) throw new Error("no entry");
          return { id: idM[1].trim(), title: titleM[1].trim().replace(/\s+/g, ' ').slice(0, 100) };
        }),
      },
    }),
  },


  "cloud-status": {
    event_source: "downstatus",
    ttl: 1800,
    collectAll: async (env) => ({
      sources: {
        downstatus: await fetchSafe(async () => {
          const services = ["aws", "azure", "gcp", "cloudflare", "vercel"];
          const results = await Promise.all(services.map(async (svc) => {
            const r = await fetch("https://isitdownstatus.com/api/status/" + svc);
            if (!r.ok) throw new Error(svc + " status " + r.status);
            return await r.json();
          }));
          const issues = results.filter(s => s.status !== "operational");
          if (issues.length === 0) {
            return { id: "all_ok_" + new Date().toISOString().slice(0, 13), title: "All cloud services operational" };
          }
          const summary = issues.map(s => (s.service || s.name || "service") + ": " + s.status).join(", ");
          return { id: "issues_" + issues.length + "_" + new Date().toISOString().slice(0, 13), title: summary };
        }),
      },
    }),
  },

  "open-source-packages": {
    event_source: "deps_dev",
    ttl: 3600,
    collectAll: async (env) => ({
      sources: {
        deps_dev: await fetchSafe(async () => {
          const r = await fetch("https://api.deps.dev/v3/systems/npm/packages/lodash");
          if (!r.ok) throw new Error("status " + r.status);
          const j = await r.json();
          const versions = j.versions || [];
          const latest = versions.find(v => v.isDefault) || versions[versions.length - 1];
          if (!latest) throw new Error("no versions");
          const version = latest.versionKey?.version || latest.version || "unknown";
          const day = new Date().toISOString().slice(0, 10);
          return { id: "lodash_" + version + "_" + day, title: "lodash " + version + " (latest)" };
        }),
      },
    }),
  },

  "cve-feed": {
    event_source: "nvd_recent",
    ttl: 3600,
    collectAll: async (env) => ({
      sources: {
        nvd_recent: await fetchSafe(async () => {
          const now = new Date();
          const dayAgo = new Date(now.getTime() - 24 * 3600000);
          const fmt = (d) => d.toISOString().slice(0, 19) + ".000";
          // NVD returns oldest-first for pubStartDate queries. With
          // resultsPerPage=1, we were getting the OLDEST HIGH CVE in
          // a 7-day window — the ID stayed stable until the oldest
          // aged out, so the sector fired on stale CVEs.
          // Fix: 24h window + resultsPerPage=200 + take LAST (newest).
          const url = "https://services.nvd.nist.gov/rest/json/cves/2.0?pubStartDate=" + fmt(dayAgo) + "&pubEndDate=" + fmt(now) + "&resultsPerPage=200&cvssV3Severity=HIGH";
          const r = await fetch(url);
          if (!r.ok) throw new Error("status " + r.status);
          const j = await r.json();
          const vulns = j.vulnerabilities || [];
          if (!vulns.length) throw new Error("no HIGH CVEs last 24h");
          const vuln = vulns[vulns.length - 1].cve;
          const desc = vuln.descriptions?.[0]?.value || "No description";
          return { id: vuln.id, title: vuln.id + ": " + desc.slice(0, 100) };
        }),
      },
    }),
  },
  water: {
    event_source: "usgs_water",
    ttl: 3600,
    collectAll: async (env) => ({
      sources: {
        usgs_water: await fetchSafe(async () => {
          const r = await fetch("https://waterservices.usgs.gov/nwis/iv/?format=json&sites=07010000&parameterCd=00060&period=P1D");
          if (!r.ok) throw new Error("status " + r.status);
          const j = await r.json();
          const ts = j.value?.timeSeries?.[0]?.values?.[0]?.value?.slice(-1)[0];
          if (!ts) throw new Error("no data");
          const flow = parseFloat(ts.value);
          const day = new Date().toISOString().slice(0, 10);
          // Bucket to 10,000 cfs — typical Mississippi flow is 100-300k cfs,
          // so this fires on ~3-5% movement (a real change, not hourly noise).
          // Title shows exact flow so signal readers see the real number.
          const bucket = Math.floor(flow / 10000) * 10000;
          return { id: "usgs_" + bucket + "_" + day, title: "Mississippi flow: " + flow.toLocaleString() + " cfs" };
        }),
      },
    }),
  },
  "global-events": {
    event_source: "gdelt",
    ttl: 1800,
    collectAll: async (env) => ({
      sources: {
        gdelt: await fetchSafe(async () => {
          const r = await fetch("https://api.gdeltproject.org/api/v2/doc/doc?query=climate&mode=artlist&maxrecords=1&format=json&sort=datedesc");
          if (!r.ok) throw new Error("status " + r.status);
          const j = await r.json();
          const art = j.articles?.[0];
          if (!art) throw new Error("no articles");
          return { id: art.url, title: (art.title || "Global event").slice(0, 100) };
        }),
      },
    }),
  },
  demographics: {
    event_source: "worldbank_pop",
    ttl: 86400,
    collectAll: async (env) => ({
      sources: {
        worldbank_pop: await fetchSafe(async () => {
          const r = await fetch("https://api.worldbank.org/v2/country/SWE/indicator/SP.POP.TOTL?format=json&per_page=1&date=2024");
          if (!r.ok) throw new Error("status " + r.status);
          const j = await r.json();
          const val = j[1]?.[0]?.value;
          if (val === null || val === undefined) throw new Error("no data");
          return { id: "se_pop_" + Math.round(val) + "_2024", title: "Sweden population: " + val.toLocaleString() };
        }),
      },
    }),
  },
  "carbon-intensity": {
    event_source: "uk_carbon",
    ttl: 1800,
    collectAll: async (env) => ({
      sources: {
        uk_carbon: await fetchSafe(async () => {
          const r = await fetch("https://api.carbonintensity.org.uk/intensity");
          if (!r.ok) throw new Error("status " + r.status);
          const j = await r.json();
          const entry = j.data && j.data[0];
          if (!entry) throw new Error("no data");
          const actual = entry.intensity.actual;
          const forecast = entry.intensity.forecast;
          const index = entry.intensity.index;
          const value = actual !== null ? actual : forecast;
          const bucket = Math.floor(value / 50) * 50;  // 20-wide buckets fired on normal variation; 50 = meaningful grid shift
          const day = new Date().toISOString().slice(0, 10);
          return { id: "uk_carbon_" + bucket + "_" + day, title: "UK grid: " + value + " gCO2/kWh (" + index + ")" };
        }),
      },
    }),
  },
  "nasa-apod": {
    event_source: "nasa_apod",
    ttl: 86400,
    collectAll: async (env) => ({
      sources: {
        nasa_apod: await fetchSafe(async () => {
          const r = await fetch("https://api.nasa.gov/planetary/apod?api_key=DEMO_KEY");
          if (!r.ok) throw new Error("status " + r.status);
          const j = await r.json();
          if (!j.date || !j.title) throw new Error("no data");
          return { id: "apod_" + j.date, title: "APOD: " + (j.title || "?").slice(0, 80) };
        }),
      },
    }),
  },

  nft: {
    event_source: "opensea_top_collection",
    ttl: 3600,
    collectAll: async (env) => ({
      sources: {
        opensea_top_collection: await fetchSafe(async () => {
          // Rotate known blue-chip NFT collections by day-of-year
          const slugs = [
            "boredapeyachtclub", "cryptopunks", "azuki",
            "pudgypenguins", "mutant-ape-yacht-club", "clonex",
            "doodles-official", "moonbirds", "meebits", "otherdeed"
          ];
          const dayOfYear = Math.floor((Date.now() - new Date(new Date().getFullYear(), 0, 0)) / 86400000);
          const slug = slugs[dayOfYear % slugs.length];

          const r = await fetch("https://api.opensea.io/api/v2/collections/" + slug + "/stats", {
            headers: { "user-agent": "VolatiAI/1.0", "accept": "application/json" }
          });
          if (!r.ok) throw new Error("status " + r.status);
          const j = await r.json();
          const total = j.total || {};
          const floor = total.floor_price != null ? total.floor_price : "n/a";
          const symbol = total.floor_price_symbol || "ETH";
          // Bucket floor price to 1-unit granularity to avoid noise
          const bucket = typeof floor === "number" ? Math.round(floor) : 0;
          return { id: slug + "_" + bucket, title: slug + ": floor " + floor + " " + symbol };
        }),
      },
    }),
  },

  "dev-vr-ar": {
    event_source: "github_vr_ar",
    ttl: 3600,
    collectAll: async (env) => ({
      sources: {
        github_vr_ar: await fetchSafe(async () => {
          const repos = [
            { owner: "rokups", repo: "virtual-reality", name: "Virtual Reality" },
            { owner: "jalmasi", repo: "vrspace", name: "VRSpace" },
            { owner: "ir-engine", repo: "ir-engine", name: "iR Engine" },
            { owner: "etherealengine", repo: "etherealengine", name: "Ethereal Engine" },
          ];
          const headers = { "user-agent": "VolatiAI/1.0" };
          if (env.GITHUB_TOKEN) headers["authorization"] = "Bearer " + env.GITHUB_TOKEN;

          const results = await Promise.all(repos.map(async (r) => {
            try {
              const resp = await fetch(`https://api.github.com/repos/${r.owner}/${r.repo}/commits?per_page=1`, { headers });
              if (!resp.ok) return null;
              const commits = await resp.json();
              if (!Array.isArray(commits) || !commits[0]) return null;
              return { name: r.name, sha: commits[0].sha, date: commits[0].commit.author.date };
            } catch { return null; }
          }));

          const active = results.filter(Boolean);
          if (!active.length) throw new Error("no commits");
          active.sort((a, b) => new Date(b.date) - new Date(a.date));
          const top = active[0];
          return {
            id: "vrar_" + top.name.replace(/\s/g, "_") + "_" + top.sha.slice(0, 8),
            title: top.name + ": latest commit " + new Date(top.date).toISOString().slice(0, 10),
          };
        }),
      },
    }),
  },

  "dev-metaverse": {
    event_source: "github_metaverse",
    ttl: 3600,
    collectAll: async (env) => ({
      sources: {
        github_metaverse: await fetchSafe(async () => {
          const repos = [
            { owner: "ir-engine", repo: "ir-engine", name: "iR Engine" },
            { owner: "PatchedReality", repo: "Manifolder", name: "Manifolder" },
            { owner: "WebOfWorlds", repo: "simpleWorlds", name: "simpleWorlds" },
            { owner: "vircadia", repo: "vircadia-native-core", name: "Vircadia" },
          ];
          const headers = { "user-agent": "VolatiAI/1.0" };
          if (env.GITHUB_TOKEN) headers["authorization"] = "Bearer " + env.GITHUB_TOKEN;

          const results = await Promise.all(repos.map(async (r) => {
            try {
              const resp = await fetch(`https://api.github.com/repos/${r.owner}/${r.repo}/commits?per_page=1`, { headers });
              if (!resp.ok) return null;
              const commits = await resp.json();
              if (!Array.isArray(commits) || !commits[0]) return null;
              return { name: r.name, sha: commits[0].sha, date: commits[0].commit.author.date };
            } catch { return null; }
          }));

          const active = results.filter(Boolean);
          if (!active.length) throw new Error("no commits");
          active.sort((a, b) => new Date(b.date) - new Date(a.date));
          const top = active[0];
          return {
            id: "meta_" + top.name.replace(/\s/g, "_") + "_" + top.sha.slice(0, 8),
            title: top.name + ": latest commit " + new Date(top.date).toISOString().slice(0, 10),
          };
        }),
      },
    }),
  },




  "abuse-ch-feodo": {
    config: { metric: "new_c2_7d", threshold_pct: 0, threshold_abs: 1, window: "7d", ttl: 3600, context_keys: [] },
    collectAll: async () => ({
      sources: {
        new_c2_7d: await fetchSafe(async () => {
          const r = await fetch("https://feodotracker.abuse.ch/downloads/ipblocklist.json",
            { headers: { "user-agent": "VolatiAI/1.0", "accept": "application/json" }, signal: AbortSignal.timeout(20000) });
          if (!r.ok) throw new Error("http_" + r.status);
          const j = await r.json();
          if (!Array.isArray(j)) throw new Error("not_array: keys=" + Object.keys(j || {}).join(","));
          const cutoff = new Date(Date.now() - 7 * 864e5).toISOString().slice(0, 10);
          return j.filter(e => (e.first_seen || "").slice(0, 10) >= cutoff).length;
        }),
      },
    }),
  },

};

// ─── ENVELOPE + ROUTER ──────────────────────────────────────

function buildEventEnvelope(sector, config, result, lastSeen) {
  const sources = result.sources;
  const healthy = Object.values(sources).filter(s => s.ok).length;
  const total = Object.keys(sources).length;
  const failed = Object.entries(sources).filter(([, v]) => !v.ok).map(([k]) => k);

  const eventSrc = sources[config.event_source];
  const event = eventSrc?.ok ? eventSrc.data : null;

  let hasSignal = false, summary = "quiet", context = {};
  if (event && event.id) {
    hasSignal = String(lastSeen) !== String(event.id);
    summary = hasSignal ? "New: " + (event.title || event.id) : "quiet";
    context = { current_event_id: event.id };
  }

  return {
    sector, density: "sparse",
    has_signal: hasSignal,
    severity: hasSignal ? "notice" : "info",
    confidence: healthy / Math.max(total, 1),
    timestamp: new Date().toISOString(),
    summary, delta: null, context,
    sources: { total, healthy, failed },
    ttl_seconds: config.ttl || 3600,
  };
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "content-type": "application/json" },
  });
}

export default {
  async scheduled(event, env, ctx) {
    // No REFRESHERS configured — this handler only silences stale cron triggers
    console.log(`[cron] ${event.cron} — no-op (no refreshers configured)`);
  },

  async fetch(request, env) {
    const url = new URL(request.url);
    const parts = url.pathname.split("/").filter(Boolean);

    if (parts.length === 0) {
      return json({ ok: true, density: "sparse", sectors: Object.keys(COLLECTORS) });
    }

    const sectorName = parts[0];
    const action = parts[1] || "signal";
    const collector = COLLECTORS[sectorName];
    // Defense-in-depth: a throwing collector must return JSON, not 1101
    const safeCollect = async (c, e, name) => {
      try {
        return await c.collectAll(e);
      } catch (err) {
        return {
          value: null,
          sources: { [name]: { ok: false, error: `collector threw: ${String(err).slice(0, 200)}` } },
        };
      }
    };


    if (sectorName === "_health") {
      const summary = {};
      for (const [name, c] of Object.entries(COLLECTORS)) {
        const config = c.config || {};
        const kvKey = name + "_last_event";
        try {
          const raw = await env.SECTOR_KV.get(kvKey);
          summary[name] = {
            metric: config.metric || "event",
            storage_model: "event_id",
            has_value: raw !== null,
            last_value: raw,
            previous: null,
            pct_change: null,
            threshold_pct: config.threshold_pct || 0,
            distance_pct: null,
            history_points: raw !== null ? 1 : 0,
            span_days: 0,
            newest_iso: null
          };
        } catch (e) {
          summary[name] = { error: String(e).slice(0, 80) };
        }
      }
      return json({ density: "sparse", sectors: summary, timestamp: new Date().toISOString() });
    }

    if (sectorName === "_sectors") {
      const sectors = {};
      const coll =
        (typeof COLLECTORS !== "undefined" && COLLECTORS) ||
        (typeof collectors !== "undefined" && collectors) ||
        (typeof SECTORS !== "undefined" && SECTORS) ||
        {};
      for (const [name, c] of Object.entries(coll)) {
        const cfg = (c && (c.config || c)) || {};
        sectors[name] = {
          metric: cfg.metric ?? null,
          threshold_pct: cfg.threshold_pct ?? null,
          window: cfg.window ?? null,
          window_days:
            cfg.window_days ??
            (typeof WINDOW_DAYS_DEFAULT !== "undefined" ? WINDOW_DAYS_DEFAULT : 7),
        };
      }
      return json({
        count: Object.keys(sectors).length,
        density: (typeof env !== "undefined" && env && env.DENSITY) || "unknown",
        sectors,
      });
    }

    if (!collector) return json({ error: "unknown sector", sector: sectorName }, 404);

    if (action === "health") {
      return json({ ok: true, sector: sectorName, density: "sparse" });
    }

    if (action === "raw") {
      return json(await safeCollect(collector, env, sectorName));
    }

    if (action === "signal") {
      const result = await safeCollect(collector, env, sectorName);
      const kvKey = `${sectorName}_last_event`;
      const lastSeen = await env.SECTOR_KV.get(kvKey);

      const envelope = buildEventEnvelope(sectorName, collector, result, lastSeen);

      // Update KV only if new event
      if (envelope.context.current_event_id && String(envelope.context.current_event_id) !== lastSeen) {
        try {
          await env.SECTOR_KV.put(kvKey, String(envelope.context.current_event_id), { expirationTtl: 86400 * 90 });
        } catch (kvErr) {
          console.log("KV put failed:", String(kvErr));
        }
      }

      return json(envelope);
    }

    return json({ error: "not found" }, 404);
  },
};
