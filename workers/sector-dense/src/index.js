// sector-dense: consolidated worker for all dense sectors
// Routes: /{sector}/signal, /{sector}/raw, /{sector}/health

const RPC_URLS = [
  "https://nullrpc.dev/eth",
  "https://rpcfree.com/ethereum-rpc",
  "https://eth.blockrazor.xyz",
  "https://ethereum-rpc.publicnode.com"
];

async function fetchSafe(fn) {
  try { return { ok: true, data: await fn() }; }
  catch (e) { return { ok: false, error: String(e).slice(0, 120) }; }
}

async function fetchFromAnyRPC(method, params = []) {
  let lastError = "no RPC";
  for (const url of RPC_URLS) {
    try {
      const r = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", method, params, id: 1 }),
      });
      const text = await r.text();
      let j;
      try { j = JSON.parse(text); } catch { lastError = `non-json ${url}`; continue; }
      if (j.error) { lastError = `rpc ${url}`; continue; }
      if (!j.result) { lastError = `no result ${url}`; continue; }
      return j.result;
    } catch (e) { lastError = `${url}: ${String(e).slice(0, 60)}`; }
  }
  throw new Error(lastError);
}

function buildValueEnvelope(sector, config, result, prev) {
  const sources = result.sources;
  const healthy = Object.values(sources).filter(s => s.ok).length;
  const total = Object.keys(sources).length;
  const failed = Object.entries(sources).filter(([, v]) => !v.ok).map(([k]) => k);
  const sourceMeta = { total, healthy, failed };

  if (healthy === 0) {
    return {
      sector, density: "dense",
      has_signal: false, severity: "info", confidence: 0,
      timestamp: new Date().toISOString(), summary: "quiet",
      delta: { metric: "none", current: 0, previous: null, pct_change: null, window: config.window || "24h" },
      context: {}, sources: sourceMeta, ttl_seconds: config.ttl || 3600,
    };
  }

  const metric = sources[config.metric]?.ok ? sources[config.metric].data : null;
  let absChange = 0, pct = 0;
  if (metric !== null && prev !== null && prev !== undefined) {
    absChange = metric - prev;
    pct = prev === 0 ? 0 : (absChange / prev) * 100;
  }

  const tp = config.threshold_pct || 0;
  const ta = config.threshold_abs || 0;
  const hasSignal = metric !== null && prev !== null && prev !== undefined
    && Math.abs(pct) >= tp && Math.abs(absChange) >= ta;

  // magnitude = how many times the threshold the move was (0 if no signal)
  const magnitude = (hasSignal && tp > 0) ? Math.abs(pct) / tp : 0;

  // data_quality = fraction of sources that responded OK
  const dataQuality = healthy / Math.max(total, 1);

  // signal_confidence = magnitude × data_quality (0..1)
  // cap magnitude at 5x so a 100x spike doesn't drown out other signals
  const signalConfidence = hasSignal
    ? Math.round(Math.min(1.0, (magnitude / 5.0) * dataQuality) * 100) / 100
    : 0;

  // 4-tier severity gradient
  let severity = "info";
  if (hasSignal) {
    if (magnitude >= 10) severity = "critical";
    else if (magnitude >= 5) severity = "warning";
    else if (magnitude >= 2) severity = "notice";
    else severity = "info";
  }

  const context = {};
  for (const key of (config.context_keys || [])) {
    if (sources[key]?.ok) context[key] = sources[key].data;
  }

  return {
    sector, density: "dense",
    has_signal: hasSignal,
    severity,
    confidence: signalConfidence,
    data_quality: Math.round(dataQuality * 100) / 100,
    magnitude: Math.round(magnitude * 100) / 100,
    timestamp: new Date().toISOString(),
    summary: hasSignal
      ? config.metric + " " + metric + " (" + (pct > 0 ? "+" : "") + pct.toFixed(1) + "%)"
      : "quiet",
    delta: metric !== null ? {
      metric: config.metric, current: metric, previous: prev,
      pct_change: pct, window: config.window || "24h"
    } : null,
    context, sources: sourceMeta, ttl_seconds: config.ttl || 3600,
  };
}

function buildEventEnvelope(sector, config, result, lastSeen) {
  const sources = result.sources;
  const healthy = Object.values(sources).filter(s => s.ok).length;
  const total = Object.keys(sources).length;
  const failed = Object.entries(sources).filter(([, v]) => !v.ok).map(([k]) => k);
  const sourceMeta = { total, healthy, failed };

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
    summary, delta: null, context, sources: sourceMeta,
    ttl_seconds: config.ttl || 3600,
  };
}

// ─── COLLECTORS ─────────────────────────────────────────────


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
  blockchain: {
    config: { metric: "gas_price", threshold_pct: 20, threshold_abs: 0.05, window: "24h", ttl: 300, context_keys: ["eth_block"] },
    collectAll: async (env) => ({
      sources: {
        gas_price: await fetchSafe(async () => {
          const wei = BigInt(await fetchFromAnyRPC("eth_gasPrice"));
          return Math.round((Number(wei) / 1e9) * 100) / 100;
        }),
        eth_block: await fetchSafe(async () => parseInt(await fetchFromAnyRPC("eth_blockNumber"), 16)),
        polkadot: await fetchSafe(async () => {
          const r = await fetch("https://rpc.polkadot.io", {
            method: "POST", headers: { "content-type": "application/json" },
            body: JSON.stringify({ jsonrpc: "2.0", method: "chain_getHeader", params: [], id: 1 }),
          });
          const j = await r.json();
          if (!j.result?.number) throw new Error("no block");
          return parseInt(j.result.number, 16);
        }),
      },
    }),
  },

  cryptocurrency: {
    config: { metric: "btc_dominance", threshold_pct: 2, threshold_abs: 1.0, window: "24h", ttl: 1800, context_keys: ["fng", "top10"] },
    collectAll: async (env) => ({
      sources: {
        btc_dominance: await fetchSafe(async () => {
          const r = await fetch("https://api.coinlore.net/api/global/", { headers: { accept: "application/json" } });
          const j = await r.json();
          return Math.round(parseFloat(j[0].btc_d) * 100) / 100;
        }),
        fng: await fetchSafe(async () => {
          const r = await fetch("https://api.alternative.me/fng/?limit=1");
          const j = await r.json();
          return { value: parseInt(j.data[0].value), classification: j.data[0].value_classification };
        }),
        top10: await fetchSafe(async () => {
          const r = await fetch("https://api.coinlore.net/api/tickers/?limit=10");
          const j = await r.json();
          const changes = j.data.map(c => parseFloat(c.percent_change_24h)).filter(n => !isNaN(n));
          return Math.round(changes.reduce((s, c) => s + c, 0) / changes.length * 100) / 100;
        }),
      },
    }),
  },

  finance: {
    config: { metric: "treasury_10y", threshold_pct: 5.0, threshold_abs: 0.1, window: "24h", ttl: 3600, context_keys: ["dxy"] },
    collectAll: async (env) => ({
      sources: {
        treasury_10y: await fetchSafe(async () => {
          const r = await fetch("https://fred.stlouisfed.org/graph/fredgraph.csv?id=DGS10&cosd=2026-01-01", {
            headers: { "User-Agent": "VolatiAI/1.0 (contact@volatiai.local)" }
          });
          if (!r.ok) throw new Error("status " + r.status);
          const csv = await r.text();
          const lines = csv.trim().split("\n").slice(1).filter(l => !l.endsWith(","));
          if (!lines.length) throw new Error("no data");
          const last = lines[lines.length - 1].split(",");
          return parseFloat(last[1]);
        }),
        dxy: await fetchSafe(async () => {
          const r = await fetch("https://api.frankfurter.app/latest?from=USD&to=EUR,JPY,GBP,CAD,SEK,CHF");
          const j = await r.json();
          if (!j.rates?.EUR) throw new Error("no rates");
          return Math.round((1 / j.rates.EUR) * 10000) / 10000;
        }),
      },
    }),
  },

  "currency-ex": {
    config: { metric: "eur_usd", threshold_pct: 0.5, threshold_abs: 0.003, window: "24h", ttl: 3600, context_keys: ["gbp_usd", "jpy_usd"] },
    collectAll: async (env) => ({
      sources: {
        eur_usd: await fetchSafe(async () => {
          const r = await fetch("https://api.frankfurter.app/latest?from=EUR&to=USD");
          const j = await r.json();
          if (!j.rates?.USD) throw new Error("no rate");
          return Math.round(j.rates.USD * 10000) / 10000;
        }),
        gbp_usd: await fetchSafe(async () => {
          const r = await fetch("https://api.frankfurter.app/latest?from=GBP&to=USD");
          const j = await r.json();
          return j.rates?.USD ? Math.round(j.rates.USD * 10000) / 10000 : null;
        }),
        jpy_usd: await fetchSafe(async () => {
          const r = await fetch("https://api.frankfurter.app/latest?from=JPY&to=USD");
          const j = await r.json();
          return j.rates?.USD ? Math.round(j.rates.USD * 100000) / 100000 : null;
        }),
      },
    }),
  },

  weather: {
    config: { metric: "temp_stockholm", threshold_pct: 15.0, threshold_abs: 3.0, window: "24h", ttl: 3600, context_keys: ["wind_stockholm"] },
    collectAll: async (env) => ({
      sources: {
        temp_stockholm: await fetchSafe(async () => {
          const r = await fetch("https://api.open-meteo.com/v1/forecast?latitude=59.33&longitude=18.07&current=temperature_2m");
          const j = await r.json();
          if (j.current?.temperature_2m === undefined) throw new Error("no temp");
          return j.current.temperature_2m;
        }),
        wind_stockholm: await fetchSafe(async () => {
          const r = await fetch("https://api.open-meteo.com/v1/forecast?latitude=59.33&longitude=18.07&current=wind_speed_10m");
          const j = await r.json();
          return j.current?.wind_speed_10m ?? null;
        }),
      },
    }),
  },

  tracking: {
    config: { metric: "vix", threshold_pct: 10.0, threshold_abs: 1.5, window: "24h", ttl: 3600, context_keys: [] },
    collectAll: async (env) => ({
      sources: {
        vix: await fetchSafe(async () => {
          const r = await fetch("https://query1.finance.yahoo.com/v8/finance/chart/%5EVIX?interval=1d&range=1d", {
            headers: { 'user-agent': 'Mozilla/5.0' }
          });
          const j = await r.json();
          const price = j.chart?.result?.[0]?.meta?.regularMarketPrice;
          if (!price) throw new Error("no price");
          return Math.round(price * 100) / 100;
        }),
      },
    }),
  },

  shopping: {
    config: { metric: "wti", threshold_pct: 3.0, threshold_abs: 1.5, window: "24h", ttl: 3600, context_keys: [] },
    collectAll: async (env) => ({
      sources: {
        wti: await fetchSafe(async () => {
          const r = await fetch("https://query1.finance.yahoo.com/v8/finance/chart/CL%3DF?interval=1d&range=1d", {
            headers: { 'user-agent': 'Mozilla/5.0' }
          });
          const j = await r.json();
          const price = j.chart?.result?.[0]?.meta?.regularMarketPrice;
          if (!price) throw new Error("no price");
          return Math.round(price * 100) / 100;
        }),
      },
    }),
  },
  stocks: {
    config: { metric: "sp500", threshold_pct: 1.0, threshold_abs: 20, window: "24h", ttl: 3600, context_keys: ["nasdaq"] },
    collectAll: async (env) => ({
      sources: {
        sp500: await fetchSafe(async () => {
          const r = await fetch("https://query1.finance.yahoo.com/v8/finance/chart/%5EGSPC?interval=1d&range=1d", { headers: { 'user-agent': 'Mozilla/5.0' } });
          const j = await r.json();
          const price = j.chart?.result?.[0]?.meta?.regularMarketPrice;
          if (!price) throw new Error("no price");
          return Math.round(price * 100) / 100;
        }),
        nasdaq: await fetchSafe(async () => {
          const r = await fetch("https://query1.finance.yahoo.com/v8/finance/chart/%5EIXIC?interval=1d&range=1d", { headers: { 'user-agent': 'Mozilla/5.0' } });
          const j = await r.json();
          return j.chart?.result?.[0]?.meta?.regularMarketPrice ? Math.round(j.chart.result[0].meta.regularMarketPrice * 100) / 100 : null;
        }),
      },
    }),
  },

  energy: {
    config: { metric: "wti", threshold_pct: 3.0, threshold_abs: 1.5, window: "24h", ttl: 3600, context_keys: ["brent", "natgas"] },
    collectAll: async (env) => ({
      sources: {
        wti: await fetchSafe(async () => {
          const r = await fetch("https://query1.finance.yahoo.com/v8/finance/chart/CL%3DF?interval=1d&range=1d", { headers: { 'user-agent': 'Mozilla/5.0' } });
          const j = await r.json();
          const price = j.chart?.result?.[0]?.meta?.regularMarketPrice;
          if (!price) throw new Error("no price");
          return Math.round(price * 100) / 100;
        }),
        brent: await fetchSafe(async () => {
          const r = await fetch("https://query1.finance.yahoo.com/v8/finance/chart/BZ%3DF?interval=1d&range=1d", { headers: { 'user-agent': 'Mozilla/5.0' } });
          const j = await r.json();
          return j.chart?.result?.[0]?.meta?.regularMarketPrice ? Math.round(j.chart.result[0].meta.regularMarketPrice * 100) / 100 : null;
        }),
        natgas: await fetchSafe(async () => {
          const r = await fetch("https://query1.finance.yahoo.com/v8/finance/chart/NG%3DF?interval=1d&range=1d", { headers: { 'user-agent': 'Mozilla/5.0' } });
          const j = await r.json();
          return j.chart?.result?.[0]?.meta?.regularMarketPrice ? Math.round(j.chart.result[0].meta.regularMarketPrice * 100) / 100 : null;
        }),
      },
    }),
  },

  "crypto-defi": {
    config: { metric: "defi_tvl", threshold_pct: 5.0, threshold_abs: 2000000000, window: "24h", ttl: 3600, context_keys: [] },
    collectAll: async (env) => ({
      sources: {
        defi_tvl: await fetchSafe(async () => {
          const r = await fetch("https://api.llama.fi/v2/chains");
          if (!r.ok) throw new Error("status " + r.status);
          const arr = await r.json();
          if (!Array.isArray(arr)) throw new Error("no data");
          return Math.round(arr.reduce((s, c) => s + (c.tvl || 0), 0));
        }),
      },
    }),
  },

  metals: {
    config: { metric: "gold", threshold_pct: 1.5, threshold_abs: 30, window: "24h", ttl: 3600, context_keys: ["silver"] },
    collectAll: async (env) => ({
      sources: {
        gold: await fetchSafe(async () => {
          const r = await fetch("https://query1.finance.yahoo.com/v8/finance/chart/GC%3DF?interval=1d&range=1d", { headers: { 'user-agent': 'Mozilla/5.0' } });
          const j = await r.json();
          const price = j.chart?.result?.[0]?.meta?.regularMarketPrice;
          if (!price) throw new Error("no price");
          return Math.round(price * 100) / 100;
        }),
        silver: await fetchSafe(async () => {
          const r = await fetch("https://query1.finance.yahoo.com/v8/finance/chart/SI%3DF?interval=1d&range=1d", { headers: { 'user-agent': 'Mozilla/5.0' } });
          const j = await r.json();
          return j.chart?.result?.[0]?.meta?.regularMarketPrice ? Math.round(j.chart.result[0].meta.regularMarketPrice * 100) / 100 : null;
        }),
      },
    }),
  },


  "fed-rate": {
    config: { metric: "fed_funds", threshold_pct: 2.0, threshold_abs: 0.1, window: "24h", ttl: 3600, context_keys: [] },
    collectAll: async (env) => ({
      sources: {
        fed_funds: await fetchSafe(async () => {
          const r = await fetchWithRetry("https://fred.stlouisfed.org/graph/fredgraph.csv?id=DFF&cosd=2026-01-01", {
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

  commodities: {
    config: { metric: "copper", threshold_pct: 3.0, threshold_abs: 0.1, window: "24h", ttl: 3600, context_keys: ["coffee", "corn"] },
    collectAll: async (env) => ({
      sources: {
        copper: await fetchSafe(async () => {
          const r = await fetch("https://query1.finance.yahoo.com/v8/finance/chart/HG%3DF?interval=1d&range=1d", { headers: { 'user-agent': 'Mozilla/5.0' } });
          const j = await r.json();
          const price = j.chart?.result?.[0]?.meta?.regularMarketPrice;
          if (!price) throw new Error("no price");
          return Math.round(price * 1000) / 1000;
        }),
        coffee: await fetchSafe(async () => {
          const r = await fetch("https://query1.finance.yahoo.com/v8/finance/chart/KC%3DF?interval=1d&range=1d", { headers: { 'user-agent': 'Mozilla/5.0' } });
          const j = await r.json();
          return j.chart?.result?.[0]?.meta?.regularMarketPrice ? Math.round(j.chart.result[0].meta.regularMarketPrice * 100) / 100 : null;
        }),
        corn: await fetchSafe(async () => {
          const r = await fetch("https://query1.finance.yahoo.com/v8/finance/chart/ZC%3DF?interval=1d&range=1d", { headers: { 'user-agent': 'Mozilla/5.0' } });
          const j = await r.json();
          return j.chart?.result?.[0]?.meta?.regularMarketPrice ? Math.round(j.chart.result[0].meta.regularMarketPrice * 100) / 100 : null;
        }),
      },
    }),
  },


  "air-quality": {
    config: { metric: "pm25", threshold_pct: 3, threshold_abs: 5.0, window: "24h", ttl: 3600, context_keys: ["no2"] },
    collectAll: async (env) => ({
      sources: {
        pm25: await fetchSafe(async () => {
          const r = await fetch("https://air-quality-api.open-meteo.com/v1/air-quality?latitude=59.33&longitude=18.07&current=pm2_5");
          if (!r.ok) throw new Error("status " + r.status);
          const j = await r.json();
          const val = j.current?.pm2_5;
          if (val === undefined) throw new Error("no pm25");
          return Math.round(val * 10) / 10;
        }),
        no2: await fetchSafe(async () => {
          const r = await fetch("https://air-quality-api.open-meteo.com/v1/air-quality?latitude=59.33&longitude=18.07&current=nitrogen_dioxide");
          const j = await r.json();
          return j.current?.nitrogen_dioxide !== undefined ? Math.round(j.current.nitrogen_dioxide * 10) / 10 : null;
        }),
      },
    }),
  },


  "depin-market": {
    config: { metric: "depin_mcap", threshold_pct: 5.0, threshold_abs: 1e9, window: "24h", ttl: 3600, context_keys: [] },
    collectAll: async (env) => ({
      sources: {
        depin_mcap: await fetchSafe(async () => {
          // CoinLore: same source as kryptovaluta sector, known working from CF
          const r = await fetch("https://api.coinlore.net/api/tickers/?limit=200");
          if (!r.ok) throw new Error("status " + r.status);
          const j = await r.json();
          if (!j.data || !Array.isArray(j.data)) throw new Error("no data");
          const depinSymbols = new Set([
            "FLUX", "FIL", "RNDR", "AKT", "HNT", "THETA", "IO",
            "AR", "STORJ", "GRASS", "AETHIR", "NOS", "GEOD", "PEAQ"
          ]);
          let totalMcap = 0;
          let count = 0;
          for (const t of j.data) {
            if (depinSymbols.has(t.symbol)) {
              const mcap = parseFloat(t.market_cap_usd || "0");
              if (!isNaN(mcap) && mcap > 0) {
                totalMcap += mcap;
                count++;
              }
            }
          }
          if (count === 0) throw new Error("no depin coins found");
          return Math.round(totalMcap);
        }),
      },
    }),
  },

  "crypto-funding": {
    config: { metric: "btc_funding_rate", threshold_pct: 100, threshold_abs: 0.0003, window: "24h", ttl: 3600, context_keys: [] },
    collectAll: async (env) => ({
      sources: {
        btc_funding_rate: await fetchSafe(async () => {
          const r = await fetch("https://www.okx.com/api/v5/public/funding-rate?instId=BTC-USDT-SWAP");
          if (!r.ok) throw new Error("status " + r.status);
          const j = await r.json();
          const d = j.data && j.data[0];
          if (!d) throw new Error("no data");
          return parseFloat(d.fundingRate);
        }),
      },
    }),
  },

  "crypto-oi": {
    config: { metric: "btc_open_interest", threshold_pct: 10, threshold_abs: 5000, window: "24h", ttl: 3600, context_keys: [] },
    collectAll: async (env) => ({
      sources: {
        btc_open_interest: await fetchSafe(async () => {
          const r = await fetch("https://www.okx.com/api/v5/public/open-interest?instId=BTC-USDT-SWAP&ccy=BTC");
          if (!r.ok) throw new Error("status " + r.status);
          const j = await r.json();
          const d = j.data && j.data[0];
          if (!d) throw new Error("no data");
          return Math.round(parseFloat(d.oi));
        }),
      },
    }),
  },

  "crypto-market": {
    config: { metric: "total_market_cap", threshold_pct: 2.0, threshold_abs: 5e10, window: "24h", ttl: 3600, context_keys: ["btc_dominance", "eth_dominance"] },
    collectAll: async (env) => ({
      sources: {
        total_market_cap: await fetchSafe(async () => {
          const r = await fetch("https://api.coinlore.net/api/global/");
          if (!r.ok) throw new Error("status " + r.status);
          const j = await r.json();
          const g = j[0];
          if (!g) throw new Error("no data");
          return Math.round(parseFloat(g.total_mcap));
        }),
        btc_dominance: await fetchSafe(async () => {
          const r = await fetch("https://api.coinlore.net/api/global/");
          const j = await r.json();
          const g = j[0];
          return g && g.btc_d ? Math.round(parseFloat(g.btc_d) * 100) / 100 : null;
        }),
        eth_dominance: await fetchSafe(async () => {
          const r = await fetch("https://api.coinlore.net/api/global/");
          const j = await r.json();
          const g = j[0];
          return g && g.eth_d ? Math.round(parseFloat(g.eth_d) * 100) / 100 : null;
        }),
      },
    }),
  },

  "defi-dex-volume": {
    config: { metric: "dex_volume_24h", threshold_pct: 15.0, threshold_abs: 1e9, window: "24h", ttl: 3600, context_keys: [] },
    collectAll: async (env) => ({
      sources: {
        dex_volume_24h: await fetchSafe(async () => {
          const r = await fetch("https://api.llama.fi/overview/dexs?excludeTotalDataChart=true&excludeTotalDataChartBreakdown=true");
          if (!r.ok) throw new Error("status " + r.status);
          const j = await r.json();
          return Math.round(j.total24h);
        }),
      },
    }),
  },

  "defi-stablecoins": {
    config: { metric: "stablecoin_count", threshold_pct: 1.0, threshold_abs: 2, window: "24h", ttl: 3600, context_keys: [] },
    collectAll: async (env) => ({
      sources: {
        stablecoin_count: await fetchSafe(async () => {
          const r = await fetch("https://stablecoins.llama.fi/stablecoins?includePrices=false");
          if (!r.ok) throw new Error("status " + r.status);
          const j = await r.json();
          return j.peggedAssets ? j.peggedAssets.length : 0;
        }),
      },
    }),
  },

  "defi-fees": {
    config: { metric: "fees_24h", threshold_pct: 20.0, threshold_abs: 1e7, window: "24h", ttl: 3600, context_keys: [] },
    collectAll: async (env) => ({
      sources: {
        fees_24h: await fetchSafe(async () => {
          const r = await fetch("https://api.llama.fi/overview/fees?excludeTotalDataChart=true&excludeTotalDataChartBreakdown=true");
          if (!r.ok) throw new Error("status " + r.status);
          const j = await r.json();
          return Math.round(j.total24h);
        }),
      },
    }),
  },

  aave: {
    config: { metric: "aave_tvl", threshold_pct: 10.0, threshold_abs: 1e9, window: "24h", ttl: 3600, context_keys: [] },
    collectAll: async (env) => ({
      sources: {
        aave_tvl: await fetchSafe(async () => {
          const r = await fetch("https://api.llama.fi/protocol/aave");
          if (!r.ok) throw new Error("status " + r.status);
          const j = await r.json();
          return Math.round(Object.values(j.currentChainTvls || {}).reduce((a, b) => a + (b || 0), 0));
        }),
      },
    }),
  },

  maker: {
    config: { metric: "sky_tvl", threshold_pct: 10.0, threshold_abs: 5e8, window: "24h", ttl: 3600, context_keys: [] },
    collectAll: async (env) => ({
      sources: {
        sky_tvl: await fetchSafe(async () => {
          // MakerDAO is now "Sky Lending"
          const r = await fetch("https://api.llama.fi/protocol/makerdao");
          if (!r.ok) throw new Error("status " + r.status);
          const j = await r.json();
          // Avoid double-counting staking duplicates
          const tvls = j.currentChainTvls || {};
          let total = 0;
          for (const [chain, val] of Object.entries(tvls)) {
            if (!chain.includes("-borrowed") && !chain.includes("-staking")) {
              total += val || 0;
            }
          }
          return Math.round(total);
        }),
      },
    }),
  },

  "defi-yields": {
    config: { metric: "top_yield_tvl", threshold_pct: 10.0, threshold_abs: 1e9, window: "24h", ttl: 3600, context_keys: ["top_yield_apy"] },
    collectAll: async (env) => ({
      sources: {
        top_yield_tvl: await fetchSafe(async () => {
          const r = await fetch("https://yields.llama.fi/pools");
          if (!r.ok) throw new Error("status " + r.status);
          const j = await r.json();
          const pools = j.data || [];
          // Highest TVL among pools with APY > 10% and >$10M TVL
          const filtered = pools.filter(p => p.apy > 10 && p.tvlUsd > 1e7);
          if (!filtered.length) throw new Error("no qualifying pools");
          filtered.sort((a, b) => b.tvlUsd - a.tvlUsd);
          return Math.round(filtered[0].tvlUsd);
        }),
        top_yield_apy: await fetchSafe(async () => {
          const r = await fetch("https://yields.llama.fi/pools");
          const j = await r.json();
          const pools = j.data || [];
          const filtered = pools.filter(p => p.apy > 10 && p.tvlUsd > 1e7);
          if (!filtered.length) return null;
          filtered.sort((a, b) => b.tvlUsd - a.tvlUsd);
          return Math.round(filtered[0].apy * 100) / 100;
        }),
      },
    }),
  },

  "web3-multichain": {
    config: { metric: "total_blocks", threshold_pct: 0.5, threshold_abs: 1, window: "24h", ttl: 3600, context_keys: ["stalled_chains"] },
    collectAll: async (env) => ({
      sources: {
        total_blocks: await fetchSafe(async () => {
          const chains = [
            // --- EVM (eth_blockNumber -> hex) ---
            { name: "polygon",   url: env.PUBLIC_POLYGON_RPC, kind: "evm" },
            { name: "bsc",       url: env.PUBLIC_BSC_RPC, kind: "evm" },
            { name: "avax",      url: env.PUBLIC_AVAX_RPC, kind: "evm" },
            { name: "arbitrum",  url: "https://arbitrum-one-rpc.publicnode.com", kind: "evm" },
            { name: "zksync",    url: "https://mainnet.era.zksync.io", kind: "evm" },
            { name: "peaq",      url: "https://peaq-rpc.publicnode.com", kind: "evm" },
            { name: "bittensor", url: "https://lite.chain.opentensor.ai", kind: "evm" },
            // --- Tier 1 EVM additions (PublicNode, keyless) ---
            { name: "ethereum",  url: "https://ethereum-rpc.publicnode.com", kind: "evm" },
            { name: "base",      url: "https://base-rpc.publicnode.com", kind: "evm" },
            { name: "optimism",  url: "https://optimism-rpc.publicnode.com", kind: "evm" },
            { name: "linea",     url: "https://linea-rpc.publicnode.com", kind: "evm" },
            { name: "celo",      url: "https://celo-rpc.publicnode.com", kind: "evm" },
            { name: "fantom",    url: "https://rpcapi.fantom.network", kind: "evm" },
            // --- Tier 2 non-EVM ---
            { name: "solana",    url: "https://solana-rpc.publicnode.com", kind: "solana" },
            { name: "near",      url: "https://free.rpc.fastnear.com", kind: "near" },
            { name: "cosmos",    url: "https://cosmos-rpc.publicnode.com", kind: "cosmos" },
            { name: "starknet",  url: "https://starknet.api.onfinality.io/public", kind: "starknet" },
          ];
          const results = await Promise.all(chains.map(fetchChainHeight));
          const normalized = normalizeChains(results);
          const valid = normalized.filter(r => r.height !== null);
          const stalled = normalized.filter(r => r.height === null);
          if (!valid.length) throw new Error("no chains responded");
          const total = valid.reduce((s, c) => s + c.height, 0);
          if (!Number.isFinite(total)) throw new Error("sum is not finite");
          env.__stalled_chains = stalled.map(r => r.name).join(",");
          env.__chains_snapshot = Object.fromEntries(
            normalized.map(r => [r.name, { ok: r.height !== null, height: r.height, error: r.error }])
          );
          return Math.round(total);
        }),
        stalled_chains: await fetchSafe(async () => {
          return (env.__stalled_chains || "").length;
        }),
        chains: await fetchSafe(async () => env.__chains_snapshot || {}),
      },
    }),
  },

  "protocols-tvl": {
    config: { metric: "total_tvl_usd", threshold_pct: 1.0, threshold_abs: 1e9, window: "24h", ttl: 3600, context_keys: ["chain_count"] },
    collectAll: async (env) => {
      const UA = { "user-agent": "VolatiAI/1.0", "accept": "application/json" };
      const chainsRes = await fetchSafe(async () => {
        const r = await fetch("https://api.llama.fi/v2/chains", { headers: UA, signal: AbortSignal.timeout(15000) });
        if (!r.ok) throw new Error("http_" + r.status);
        const j = await r.json();
        if (!Array.isArray(j)) throw new Error("not_array");
        return j;
      });
      const chains = chainsRes.ok ? chainsRes.data : [];
      const total = chains.reduce((s, c) => s + (c.tvl ?? 0), 0);
      return {
        sources: {
          total_tvl_usd: { ok: chainsRes.ok, data: chainsRes.ok ? Math.round(total) : null, error: chainsRes.error },
          chain_count:   { ok: chainsRes.ok, data: chainsRes.ok ? chains.length : null, error: chainsRes.error },
        },
      };
    },
  },

  "scaling-l2": {
    config: { metric: "total_tvl_usd", threshold_pct: 2.0, threshold_abs: 1e8, window: "24h", ttl: 3600, context_keys: ["count"] },
    collectAll: async (env) => {
      const UA = { "user-agent": "VolatiAI/1.0", "accept": "application/json" };
      const L2_NAMES = ["Arbitrum","Base","OP Mainnet","Optimism","zkSync Era","ZKsync Era","Linea","Scroll","Mantle","Blast","Starknet","Manta Pacific","Metis","Mode","Taiko","Immutable zkEVM"];
      const chainsRes = await fetchSafe(async () => {
        const r = await fetch("https://api.llama.fi/v2/chains", { headers: UA, signal: AbortSignal.timeout(15000) });
        if (!r.ok) throw new Error("http_" + r.status);
        const j = await r.json();
        if (!Array.isArray(j)) throw new Error("not_array");
        return j.filter(c => L2_NAMES.includes(c.name));
      });
      const l2s = chainsRes.ok ? chainsRes.data : [];
      const total = l2s.reduce((s, c) => s + (c.tvl ?? 0), 0);
      return {
        sources: {
          total_tvl_usd: { ok: chainsRes.ok, data: chainsRes.ok ? Math.round(total) : null, error: chainsRes.error },
          count:         { ok: chainsRes.ok, data: chainsRes.ok ? l2s.length : null, error: chainsRes.error },
        },
      };
    },
  },

  "interop-messaging": {
    config: { metric: "total_messages", threshold_pct: 20, threshold_abs: 10, window: "24h", ttl: 3600, context_keys: ["layerzero", "wormhole", "axelar"] },
    collectAll: async (env) => {
      const UA = { "user-agent": "VolatiAI/1.0", "accept": "application/json" };
      const [lz, wh, ax] = await Promise.all([
        fetchSafe(async () => {
          const r = await fetch("https://scan.layerzero-api.com/v1/messages/latest", { headers: UA, signal: AbortSignal.timeout(10000) });
          if (!r.ok) throw new Error("http_" + r.status);
          const j = await r.json();
          return (Array.isArray(j) ? j : (j.data ?? [])).length;
        }),
        fetchSafe(async () => {
          const r = await fetch("https://api.wormholescan.io/api/v1/vaas?limit=100", { headers: UA, signal: AbortSignal.timeout(10000) });
          if (!r.ok) throw new Error("http_" + r.status);
          const j = await r.json();
          return (Array.isArray(j) ? j : (j.data ?? [])).length;
        }),
        fetchSafe(async () => {
          const r = await fetch("https://api.axelarscan.io/gmp/searchGMP?size=50", { headers: UA, signal: AbortSignal.timeout(10000) });
          if (!r.ok) throw new Error("http_" + r.status);
          const j = await r.json();
          return (Array.isArray(j) ? j : (j.data ?? [])).length;
        }),
      ]);
      const total = (lz.data ?? 0) + (wh.data ?? 0) + (ax.data ?? 0);
      const anyOk = lz.ok || wh.ok || ax.ok;
      return {
        sources: {
          total_messages: { ok: anyOk, data: anyOk ? total : null, error: anyOk ? null : "all_sources_failed" },
          layerzero:      { ok: lz.ok, data: lz.data, error: lz.error },
          wormhole:       { ok: wh.ok, data: wh.data, error: wh.error },
          axelar:         { ok: ax.ok, data: ax.data, error: ax.error },
        },
      };
    },
  },

  "web3-eth-supply": {
    config: { metric: "eth_supply", threshold_pct: 0.1, threshold_abs: 10000, window: "24h", ttl: 3600, context_keys: [] },
    collectAll: async (env) => ({
      sources: {
        eth_supply: await fetchSafe(async () => {
          const r = await fetch("https://api.etherscan.io/v2/api?chainid=1&module=stats&action=ethsupply&apikey=" + env.ETHERSCAN_API_KEY);
          if (!r.ok) throw new Error("status " + r.status);
          const j = await r.json();
          if (j.status !== "1") throw new Error(j.result || "etherscan");
          return Math.round(parseFloat(j.result) / 1e18);
        }),
      },
    }),
  },

  "web3-blockscout": {
    config: { metric: "bs_total_blocks", threshold_pct: 0.0, threshold_abs: 1, window: "24h", ttl: 3600, context_keys: [] },
    collectAll: async (env) => ({
      sources: {
        bs_total_blocks: await fetchSafe(async () => {
          // Blockscout stats endpoint
          const r = await fetch("https://eth.blockscout.com/api/v2/stats", {
            headers: { "user-agent": "VolatiAI/1.0", "accept": "application/json" },
          });
          if (!r.ok) throw new Error("status " + r.status);
          const j = await r.json();
          const total = j.total_blocks;
          if (!total) throw new Error("no total_blocks");
          return parseInt(total);
        }),
      },
    }),
  },

};

// ─── ROUTER ─────────────────────────────────────────────────

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "content-type": "application/json" },
  });
}

// ---- v1 helper: normalize a chain height from any RPC shape ----
function parseHeight(v) {
  if (v === null || v === undefined) return null;
  if (typeof v === "number") return Number.isFinite(v) && v >= 0 ? v : null;
  if (typeof v === "string") {
    const t = v.trim();
    if (t === "") return null;
    const n = /^0x/i.test(t) ? parseInt(t, 16) : Number(t);
    return Number.isFinite(n) && n >= 0 ? n : null;
  }
  return null;
}

function normalizeChains(results) {
  return results.map((r) => ({
    name:   r.name,
    height: parseHeight(r.height),
    error:  r.error ?? null,
  }));
}


// ---- v2 helper: fetch height for any chain kind ----
async function fetchChainHeight(c) {
  if (!c.url) return { name: c.name, height: null, error: "no url" };
  const signal = AbortSignal.timeout(8000);
  try {
    let method, params;
    switch (c.kind) {
      case "solana":   method = "getSlot"; params = []; break;
      case "near":     method = "block"; params = { finality: "final" }; break;
      case "cosmos":   method = "status"; params = []; break;
      case "starknet": method = "starknet_blockNumber"; params = []; break;
      default:         method = "eth_blockNumber"; params = [];
    }
    const body = c.kind === "near"
      ? { jsonrpc: "2.0", id: "dontcare", method, params }
      : { jsonrpc: "2.0", id: 1, method, params };
    const r = await fetch(c.url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      signal,
    });
    const j = await r.json();
    let height = null;
    switch (c.kind) {
      case "solana":
        height = typeof j.result === "number" ? j.result : null; break;
      case "near":
        height = j?.result?.header?.height ?? null; break;
      case "cosmos": {
        const h = j?.result?.sync_info?.latest_block_height;
        height = h != null ? parseInt(h, 10) : null; break;
      }
      case "starknet":
        height = typeof j.result === "number" ? j.result : null; break;
      default:
        if (j.error || !j.result) return { name: c.name, height: null, error: j.error?.message ?? "no result" };
        height = parseInt(j.result, 16);
    }
    if (height === null || Number.isNaN(height)) {
      return { name: c.name, height: null, error: "parse failed" };
    }
    return { name: c.name, height };
  } catch (e) {
    return { name: c.name, height: null, error: e.name ?? "fetch failed" };
  }
}


Object.assign(COLLECTORS, {
  chemistry: {
    config: { metric: "papers_7d", threshold_pct: 10, threshold_abs: 50, window: "24h", ttl: 3600, context_keys: [] },
    collectAll: async () => ({
      sources: {
        papers_7d: await fetchSafe(async () => {
          const r = await fetch("https://export.arxiv.org/api/query?search_query=cat:physics.chem-ph&start=0&max_results=1", { headers: { "user-agent": "VolatiAI/1.0" }, signal: AbortSignal.timeout(15000) });
          if (!r.ok) throw new Error("http_" + r.status);
          const t = await r.text();
          const m = t.match(/<opensearch:totalResults[^>]*>\s*(\d+)\s*<\/opensearch:totalResults>/);
          if (!m) throw new Error("no_count");
          return parseInt(m[1], 10);
        }),
      },
    }),
  },
  biotech: {
    config: { metric: "pubmed_7d", threshold_pct: 10, threshold_abs: 50, window: "24h", ttl: 3600, context_keys: [] },
    collectAll: async () => ({
      sources: {
        pubmed_7d: await fetchSafe(async () => {
          const d7 = new Date(Date.now() - 7*864e5).toISOString().slice(0,10);
          const td = new Date().toISOString().slice(0,10);
          const q = encodeURIComponent(`biotechnology AND (FIRST_PDATE:[${d7} TO ${td}])`);
          const r = await fetch(`https://www.ebi.ac.uk/europepmc/webservices/rest/search?query=${q}&format=json&pageSize=1`, { headers: { "user-agent": "VolatiAI/1.0" }, signal: AbortSignal.timeout(15000) });
          if (!r.ok) throw new Error("http_" + r.status);
          const j = await r.json();
          if (typeof j.hitCount !== "number") throw new Error("no_count");
          return j.hitCount;
        }),
      },
    }),
  },
  "government-data": {
    config: { metric: "datasets", threshold_pct: 1, threshold_abs: 100, window: "24h", ttl: 3600, context_keys: [] },
    collectAll: async () => ({
      sources: {
        datasets: await fetchSafe(async () => {
          const r = await fetch("https://data.gov.uk/api/3/action/package_search?rows=0", { headers: { "user-agent": "VolatiAI/1.0" }, signal: AbortSignal.timeout(15000) });
          if (!r.ok) throw new Error("http_" + r.status);
          const j = await r.json();
          if (typeof j.result?.count !== "number") throw new Error("no_count");
          return j.result.count;
        }),
      },
    }),
  },
  "humanitarian-aid": {
    config: { metric: "datasets", threshold_pct: 1, threshold_abs: 20, window: "24h", ttl: 3600, context_keys: [] },
    collectAll: async () => ({
      sources: {
        datasets: await fetchSafe(async () => {
          const r = await fetch("https://data.humdata.org/api/3/action/package_search?rows=0", { headers: { "user-agent": "VolatiAI/1.0" }, signal: AbortSignal.timeout(15000) });
          if (!r.ok) throw new Error("http_" + r.status);
          const j = await r.json();
          if (typeof j.result?.count !== "number") throw new Error("no_count");
          return j.result.count;
        }),
      },
    }),
  },
  ngo: {
    config: { metric: "filings", threshold_pct: 1, threshold_abs: 50, window: "24h", ttl: 3600, context_keys: [] },
    collectAll: async () => ({
      sources: {
        filings: await fetchSafe(async () => {
          const r = await fetch("https://projects.propublica.org/nonprofits/api/v2/search.json?q=humanitarian", { headers: { "user-agent": "VolatiAI/1.0", "accept": "application/json" }, signal: AbortSignal.timeout(15000) });
          if (!r.ok) throw new Error("http_" + r.status);
          const j = await r.json();
          if (typeof j.total_results !== "number") throw new Error("no_count");
          return j.total_results;
        }),
      },
    }),
  },
  transportation: {
    config: { metric: "delayed_airports", threshold_pct: 20, threshold_abs: 5, window: "24h", ttl: 1800, context_keys: [] },
    collectAll: async () => ({
      sources: {
        delayed_airports: await fetchSafe(async () => {
          const r = await fetch("https://external-api.faa.gov/asws/api/airport/delays", { headers: { "user-agent": "VolatiAI/1.0" }, signal: AbortSignal.timeout(15000) });
          if (!r.ok) throw new Error("http_" + r.status);
          const j = await r.json();
          if (typeof j?.status?.count === "number") return j.status.count;
          const sum = ["GroundDelays","GroundStops","ArriveDepartDelays","Closures"]
            .reduce((n, k) => n + (typeof j?.[k]?.count === "number" ? j[k].count : 0), 0);
          return sum;
        }),
      },
    }),
  },
});


Object.assign(COLLECTORS, {
  "web-apps": {
    config: { metric: "weekly_downloads", threshold_pct: 5, threshold_abs: 10000000, window: "24h", ttl: 3600, context_keys: [] },
    collectAll: async () => ({
      sources: {
        weekly_downloads: await fetchSafe(async () => {
          const pkgs = ["react", "vue", "next", "svelte", "@angular/core"];
          const results = await Promise.all(pkgs.map(p =>
            fetch("https://api.npmjs.org/downloads/point/last-week/" + encodeURIComponent(p),
                  { headers: { "user-agent": "VolatiAI/1.0" }, signal: AbortSignal.timeout(15000) })
          ));
          let total = 0;
          for (const r of results) {
            if (r.ok) { const j = await r.json(); total += j.downloads || 0; }
          }
          return total;
        }),
      },
    }),
  },
  "cloud-status": {
    config: { metric: "open_incidents", threshold_pct: 0, threshold_abs: 1, window: "24h", ttl: 1800, context_keys: [] },
    collectAll: async () => ({
      sources: {
        open_incidents: await fetchSafe(async () => {
          let total = 0;
          try {
            const r = await fetch("https://status.aws.amazon.com/data.json",
              { headers: { "user-agent": "VolatiAI/1.0" }, signal: AbortSignal.timeout(10000) });
            if (r.ok) { const j = await r.json(); if (Array.isArray(j.current)) total += j.current.length; }
          } catch {}
          try {
            const r = await fetch("https://status.cloud.google.com/incidents.json",
              { headers: { "user-agent": "VolatiAI/1.0" }, signal: AbortSignal.timeout(10000) });
            if (r.ok) {
              const j = await r.json();
              if (Array.isArray(j)) total += j.filter(x => !x.end).length;
            }
          } catch {}
          return total;
        }),
      },
    }),
  },
  "data-validity": {
    config: { metric: "fresh_datasets_7d", threshold_pct: 10, threshold_abs: 100, window: "24h", ttl: 3600, context_keys: [] },
    collectAll: async () => ({
      sources: {
        fresh_datasets_7d: await fetchSafe(async () => {
          const r = await fetch("https://data.gov.uk/api/3/action/package_search?fq=metadata_modified:%5BNOW-7DAYS%20TO%20NOW%5D&rows=0",
            { headers: { "user-agent": "VolatiAI/1.0" }, signal: AbortSignal.timeout(15000) });
          if (!r.ok) throw new Error("http_" + r.status);
          const j = await r.json();
          if (typeof j.result?.count !== "number") throw new Error("no_count");
          return j.result.count;
        }),
      },
    }),
  },
});


Object.assign(COLLECTORS, {
  religions: {
    config: { metric: "works", threshold_pct: 0.5, threshold_abs: 500, window: "24h", ttl: 3600, context_keys: [] },
    collectAll: async () => ({
      sources: {
        works: await fetchSafe(async () => {
          const r = await fetch("https://openlibrary.org/subjects/religion.json?limit=1",
            { headers: { "user-agent": "VolatiAI/1.0" }, signal: AbortSignal.timeout(15000) });
          if (!r.ok) throw new Error("http_" + r.status);
          const j = await r.json();
          if (typeof j.work_count !== "number") throw new Error("no_count");
          return j.work_count;
        }),
      },
    }),
  },
  philosophy: {
    config: { metric: "works", threshold_pct: 0.5, threshold_abs: 500, window: "24h", ttl: 3600, context_keys: [] },
    collectAll: async () => ({
      sources: {
        works: await fetchSafe(async () => {
          const r = await fetch("https://openlibrary.org/subjects/philosophy.json?limit=1",
            { headers: { "user-agent": "VolatiAI/1.0" }, signal: AbortSignal.timeout(15000) });
          if (!r.ok) throw new Error("http_" + r.status);
          const j = await r.json();
          if (typeof j.work_count !== "number") throw new Error("no_count");
          return j.work_count;
        }),
      },
    }),
  },
  gaming: {
    config: { metric: "steam_players", threshold_pct: 5, threshold_abs: 10000, window: "24h", ttl: 1800, context_keys: [] },
    collectAll: async () => ({
      sources: {
        steam_players: await fetchSafe(async () => {
          const appids = [730, 570, 578080, 1172470, 271590];
          const results = await Promise.all(appids.map(id =>
            fetch(`https://api.steampowered.com/ISteamUserStats/GetNumberOfCurrentPlayers/v1/?appid=${id}`,
              { headers: { "user-agent": "VolatiAI/1.0" }, signal: AbortSignal.timeout(10000) })
          ));
          let total = 0;
          for (const r of results) {
            if (r.ok) { const j = await r.json(); total += j?.response?.player_count || 0; }
          }
          if (total === 0) throw new Error("all_sources_zero");
          return total;
        }),
      },
    }),
  },
});


Object.assign(COLLECTORS, {
  "food-security": {
    config: { metric: "products", threshold_pct: 0.5, threshold_abs: 1000, window: "24h", ttl: 3600, context_keys: [] },
    collectAll: async () => ({
      sources: {
        products: await fetchSafe(async () => {
          const r = await fetch("https://world.openfoodfacts.org/api/v2/search?page_size=1",
            { headers: { "user-agent": "VolatiAI/1.0" }, signal: AbortSignal.timeout(15000) });
          if (!r.ok) throw new Error("http_" + r.status);
          const j = await r.json();
          if (typeof j.count !== "number") throw new Error("no_count");
          return j.count;
        }),
      },
    }),
  },
  "energy-carbon": {
    config: { metric: "gco2_per_kwh", threshold_pct: 3, threshold_abs: 20, window: "24h", ttl: 1800, context_keys: [] },
    collectAll: async () => ({
      sources: {
        gco2_per_kwh: await fetchSafe(async () => {
          const r = await fetch("https://api.carbonintensity.org.uk/intensity",
            { headers: { "accept": "application/json", "user-agent": "VolatiAI/1.0" }, signal: AbortSignal.timeout(10000) });
          if (!r.ok) throw new Error("http_" + r.status);
          const j = await r.json();
          const v = j?.data?.[0]?.intensity?.actual;
          if (typeof v !== "number") throw new Error("no_value");
          return v;
        }),
      },
    }),
  },
  "air-quality": {
    config: { metric: "avg_european_aqi", threshold_pct: 15, threshold_abs: 10, window: "24h", ttl: 1800, context_keys: [] },
    collectAll: async () => ({
      sources: {
        avg_european_aqi: await fetchSafe(async () => {
          const cities = [[51.5,-0.1],[40.7,-74.0],[35.7,139.7]];
          const results = await Promise.all(cities.map(([lat,lon]) =>
            fetch("https://air-quality-api.open-meteo.com/v1/air-quality?latitude=" + lat + "&longitude=" + lon + "&current=european_aqi",
              { headers: { "user-agent": "VolatiAI/1.0" }, signal: AbortSignal.timeout(10000) })
          ));
          let sum = 0, n = 0;
          for (const r of results) {
            if (r.ok) {
              const j = await r.json();
              const v = j?.current?.european_aqi;
              if (typeof v === "number") { sum += v; n++; }
            }
          }
          if (n === 0) throw new Error("all_cities_failed");
          return Math.round(sum / n);
        }),
      },
    }),
  },
  sports: {
    config: { metric: "games_today", threshold_pct: 50, threshold_abs: 5, window: "24h", ttl: 1800, context_keys: [] },
    collectAll: async () => ({
      sources: {
        games_today: await fetchSafe(async () => {
          const leagues = ["basketball/nba","football/nfl","baseball/mlb","hockey/nhl","soccer/eng.1"];
          const results = await Promise.all(leagues.map(l =>
            fetch("https://site.api.espn.com/apis/site/v2/sports/" + l + "/scoreboard",
              { headers: { "user-agent": "VolatiAI/1.0" }, signal: AbortSignal.timeout(10000) })
          ));
          let total = 0;
          for (const r of results) {
            if (r.ok) {
              const j = await r.json();
              if (Array.isArray(j?.events)) total += j.events.length;
            }
          }
          return total;
        }),
      },
    }),
  },
  "space-launches": {
    config: { metric: "upcoming", threshold_pct: 20, threshold_abs: 5, window: "24h", ttl: 3600, context_keys: [] },
    collectAll: async () => ({
      sources: {
        upcoming: await fetchSafe(async () => {
          const r = await fetch("https://ll.thespacedevs.com/2.2.0/launch/upcoming/?limit=1",
            { headers: { "user-agent": "VolatiAI/1.0" }, signal: AbortSignal.timeout(15000) });
          if (!r.ok) throw new Error("http_" + r.status);
          const j = await r.json();
          if (typeof j.count !== "number") throw new Error("no_count");
          return j.count;
        }),
      },
    }),
  },
  "wikipedia-activity": {
    config: { metric: "views_7d", threshold_pct: 10, threshold_abs: 500000, window: "24h", ttl: 3600, context_keys: [] },
    collectAll: async () => ({
      sources: {
        views_7d: await fetchSafe(async () => {
          const end = new Date();
          const start = new Date(Date.now() - 7*864e5);
          const fmt = d => d.toISOString().slice(0,10).replace(/-/g,"");
          const articles = ["Main_Page","Artificial_intelligence","Bitcoin"];
          const results = await Promise.all(articles.map(a =>
            fetch("https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article/en.wikipedia/all-access/user/" + a + "/daily/" + fmt(start) + "/" + fmt(end),
              { headers: { "user-agent": "VolatiAI/1.0 (contact: volatiai@example.com)" }, signal: AbortSignal.timeout(15000) })
          ));
          let total = 0;
          for (const r of results) {
            if (r.ok) {
              const j = await r.json();
              if (Array.isArray(j?.items)) for (const it of j.items) total += it.views || 0;
            }
          }
          if (total === 0) throw new Error("all_articles_failed");
          return total;
        }),
      },
    }),
  },
  "cyber-threats": {
    config: { metric: "known_exploited", threshold_pct: 1, threshold_abs: 10, window: "24h", ttl: 3600, context_keys: [] },
    collectAll: async () => ({
      sources: {
        known_exploited: await fetchSafe(async () => {
          const r = await fetch("https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json",
            { headers: { "user-agent": "VolatiAI/1.0" }, signal: AbortSignal.timeout(15000) });
          if (!r.ok) throw new Error("http_" + r.status);
          const j = await r.json();
          if (typeof j.count !== "number") throw new Error("no_count");
          return j.count;
        }),
      },
    }),
  },
  hazards: {
    config: { metric: "earthquakes_24h", threshold_pct: 50, threshold_abs: 20, window: "24h", ttl: 1800, context_keys: [] },
    collectAll: async () => ({
      sources: {
        earthquakes_24h: await fetchSafe(async () => {
          const r = await fetch("https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_day.geojson",
            { headers: { "user-agent": "VolatiAI/1.0" }, signal: AbortSignal.timeout(15000) });
          if (!r.ok) throw new Error("http_" + r.status);
          const j = await r.json();
          if (!Array.isArray(j.features)) throw new Error("no_features");
          return j.features.length;
        }),
      },
    }),
  },
});


Object.assign(COLLECTORS, {
  "generative-ai": {
    config: { metric: "top100_downloads", threshold_pct: 0.5, threshold_abs: 1000000, window: "24h", ttl: 3600, context_keys: [] },
    collectAll: async () => ({
      sources: {
        top100_downloads: await fetchSafe(async () => {
          const r = await fetch("https://huggingface.co/api/models?sort=trendingScore&direction=-1&limit=100&expand[]=downloads",
            { headers: { "user-agent": "VolatiAI/1.0" }, signal: AbortSignal.timeout(15000) });
          if (!r.ok) throw new Error("http_" + r.status);
          const models = await r.json();
          if (!Array.isArray(models)) throw new Error("not_array");
          return models.reduce((sum, m) => sum + (m.downloads || 0), 0);
        }),
      },
    }),
  },
  compute: {
    config: { metric: "active_providers", threshold_pct: 5, threshold_abs: 10, window: "24h", ttl: 3600, context_keys: [] },
    collectAll: async () => ({
      sources: {
        active_providers: await fetchSafe(async () => {
          const r = await fetch("https://console-api.akash.network/v1/providers",
            { headers: { "user-agent": "VolatiAI/1.0" }, signal: AbortSignal.timeout(15000) });
          if (!r.ok) throw new Error("http_" + r.status);
          const j = await r.json();
          const providers = Array.isArray(j) ? j : (j.providers || j.data || []);
          if (!Array.isArray(providers)) throw new Error("not_array");
          return providers.length;
        }),
      },
    }),
  },
  "ai-benchmarks": {
    config: { metric: "top_swebench_score", threshold_pct: 1, threshold_abs: 1, window: "24h", ttl: 3600, context_keys: [] },
    collectAll: async () => ({
      sources: {
        top_swebench_score: await fetchSafe(async () => {
          const r = await fetch("https://api.genztech.dev/v1/ai-coding/leaderboard",
            { headers: { "user-agent": "VolatiAI/1.0" }, signal: AbortSignal.timeout(15000) });
          if (!r.ok) throw new Error("http_" + r.status);
          const j = await r.json();
          const rows = Array.isArray(j) ? j : (j.data || j.leaderboard || []);
          if (!Array.isArray(rows) || rows.length === 0) throw new Error("empty");
          const scores = rows.map(x => x.score ?? x.swebench ?? x.value).filter(v => typeof v === "number");
          if (!scores.length) throw new Error("no_scores");
          return Math.max(...scores);
        }),
      },
    }),
  },
  "developer-activity": {
    config: { metric: "public_events", threshold_pct: 10, threshold_abs: 50, window: "24h", ttl: 1800, context_keys: [] },
    collectAll: async () => ({
      sources: {
        public_events: await fetchSafe(async () => {
          const r = await fetch("https://api.github.com/events?per_page=100",
            { headers: { "user-agent": "VolatiAI/1.0", "accept": "application/vnd.github+json" }, signal: AbortSignal.timeout(15000) });
          if (!r.ok) throw new Error("http_" + r.status);
          const j = await r.json();
          if (!Array.isArray(j)) throw new Error("not_array");
          return j.length;
        }),
      },
    }),
  },
  "bitcoin-nodes": {
    config: { metric: "reachable_nodes", threshold_pct: 2, threshold_abs: 100, window: "24h", ttl: 3600, context_keys: [] },
    collectAll: async () => ({
      sources: {
        reachable_nodes: await fetchSafe(async () => {
          const r = await fetch("https://bitnodes.io/api/v1/snapshots/latest/",
            { headers: { "user-agent": "VolatiAI/1.0" }, signal: AbortSignal.timeout(15000) });
          if (!r.ok) throw new Error("http_" + r.status);
          const j = await r.json();
          const nodes = j?.total_nodes ?? j?.nodes?.length;
          if (typeof nodes !== "number") throw new Error("no_count");
          return nodes;
        }),
      },
    }),
  },
});


Object.assign(COLLECTORS, {
  china: {
    config: { metric: "gdp_usd", threshold_pct: 1, threshold_abs: 1e11, window: "24h", ttl: 3600, context_keys: [] },
    collectAll: async () => ({
      sources: {
        gdp_usd: await fetchSafe(async () => {
          const r = await fetch("https://api.worldbank.org/v2/country/CHN/indicator/NY.GDP.MKTP.CD?format=json&per_page=1&date=2024",
            { headers: { "user-agent": "VolatiAI/1.0" }, signal: AbortSignal.timeout(15000) });
          if (!r.ok) throw new Error("http_" + r.status);
          const j = await r.json();
          const v = j?.[1]?.[0]?.value;
          if (typeof v !== "number") throw new Error("no_value");
          return v;
        }),
      },
    }),
  },
  maritime: {
    config: { metric: "vessels", threshold_pct: 10, threshold_abs: 20, window: "24h", ttl: 1800, context_keys: [] },
    collectAll: async () => ({
      sources: {
        vessels: await fetchSafe(async () => {
          const r = await fetch("https://meri.digitraffic.fi/api/ais/v1/vessels",
            { headers: { "user-agent": "VolatiAI/1.0", "accept-encoding": "gzip" }, signal: AbortSignal.timeout(20000) });
          if (!r.ok) throw new Error("http_" + r.status);
          const j = await r.json();
          if (!Array.isArray(j)) throw new Error("not_array");
          return j.length;
        }),
      },
    }),
  },
  "bank-data": {
    config: { metric: "institutions", threshold_pct: 0.5, threshold_abs: 10, window: "24h", ttl: 3600, context_keys: [] },
    collectAll: async () => ({
      sources: {
        institutions: await fetchSafe(async () => {
          const r = await fetch("https://banks.data.fdic.gov/api/institutions?limit=1&fields=NAME",
            { headers: { "user-agent": "VolatiAI/1.0" }, signal: AbortSignal.timeout(15000) });
          if (!r.ok) throw new Error("http_" + r.status);
          const j = await r.json();
          const n = j?.meta?.total;
          if (typeof n !== "number") throw new Error("no_count");
          return n;
        }),
      },
    }),
  },
  "more-cryptos": {
    config: { metric: "coin_count", threshold_pct: 0.5, threshold_abs: 50, window: "24h", ttl: 3600, context_keys: [] },
    collectAll: async () => ({
      sources: {
        coin_count: await fetchSafe(async () => {
          const r = await fetch("https://api.coinlore.net/api/tickers/?start=0&limit=100",
            { headers: { "user-agent": "VolatiAI/1.0" }, signal: AbortSignal.timeout(15000) });
          if (!r.ok) throw new Error("http_" + r.status);
          const j = await r.json();
          if (!Array.isArray(j?.data)) throw new Error("not_array");
          return j.data.length;
        }),
      },
    }),
  },
  "e-commerce": {
    config: { metric: "catalog_products", threshold_pct: 5, threshold_abs: 100, window: "24h", ttl: 3600, context_keys: [] },
    collectAll: async () => ({
      sources: {
        catalog_products: await fetchSafe(async () => {
          const stores = ["allbirds.com","gymshark.com","fashionnova.com","colourpop.com"];
          let total = 0;
          for (const st of stores) {
            try {
              const r = await fetch("https://" + st + "/products.json?limit=250",
                { headers: { "user-agent": "VolatiAI/1.0" }, signal: AbortSignal.timeout(10000) });
              if (r.ok) { const j = await r.json(); if (Array.isArray(j.products)) total += j.products.length; }
            } catch {}
          }
          if (total === 0) throw new Error("all_stores_failed");
          return total;
        }),
      },
    }),
  },
});


Object.assign(COLLECTORS, {
  universities: {
    config: { metric: "university_count", threshold_pct: 0.5, threshold_abs: 10, window: "24h", ttl: 3600, context_keys: [] },
    collectAll: async () => ({
      sources: {
        university_count: await fetchSafe(async () => {
          const r = await fetch("http://universities.hipolabs.com/search?country=United+States",
            { headers: { "user-agent": "VolatiAI/1.0" }, signal: AbortSignal.timeout(15000) });
          if (!r.ok) throw new Error("http_" + r.status);
          const j = await r.json();
          if (!Array.isArray(j)) throw new Error("not_array");
          return j.length;
        }),
      },
    }),
  },
  refugees: {
    config: { metric: "refugees", threshold_pct: 1, threshold_abs: 100000, window: "24h", ttl: 3600, context_keys: [] },
    collectAll: async () => ({
      sources: {
        refugees: await fetchSafe(async () => {
          const r = await fetch("https://api.unhcr.org/population/v1/population/?limit=1&yearFrom=2023&yearTo=2024",
            { headers: { "user-agent": "VolatiAI/1.0" }, signal: AbortSignal.timeout(15000) });
          if (!r.ok) throw new Error("http_" + r.status);
          const j = await r.json();
          if (!Array.isArray(j.items) || !j.items.length) throw new Error("no_items");
          const v = j.items[0].refugees;
          if (typeof v !== "number") throw new Error("no_count");
          return v;
        }),
      },
    }),
  },
  diseases: {
    config: { metric: "indicators", threshold_pct: 0.1, threshold_abs: 5, window: "24h", ttl: 3600, context_keys: [] },
    collectAll: async () => ({
      sources: {
        indicators: await fetchSafe(async () => {
          const r = await fetch("https://ghoapi.azureedge.net/api/Indicator",
            { headers: { "user-agent": "VolatiAI/1.0" }, signal: AbortSignal.timeout(15000) });
          if (!r.ok) throw new Error("http_" + r.status);
          const j = await r.json();
          if (!Array.isArray(j.value)) throw new Error("no_value");
          return j.value.length;
        }),
      },
    }),
  },
  "natural-disasters": {
    config: { metric: "open_events", threshold_pct: 30, threshold_abs: 5, window: "24h", ttl: 1800, context_keys: [] },
    collectAll: async () => ({
      sources: {
        open_events: await fetchSafe(async () => {
          const r = await fetch("https://eonet.gsfc.nasa.gov/api/v3/events?status=open&limit=100",
            { headers: { "user-agent": "VolatiAI/1.0" }, signal: AbortSignal.timeout(15000) });
          if (!r.ok) throw new Error("http_" + r.status);
          const j = await r.json();
          if (!Array.isArray(j.events)) throw new Error("no_events");
          return j.events.length;
        }),
      },
    }),
  },
  research: {
    config: { metric: "works_7d", threshold_pct: 10, threshold_abs: 500, window: "24h", ttl: 3600, context_keys: [] },
    collectAll: async () => ({
      sources: {
        works_7d: await fetchSafe(async () => {
          const d = new Date(Date.now() - 7*864e5).toISOString().slice(0,10);
          const r = await fetch("https://api.crossref.org/works?query=research&filter=from-pub-date:" + d + "&rows=0",
            { headers: { "user-agent": "VolatiAI/1.0 (mailto:volatiai@example.com)" }, signal: AbortSignal.timeout(15000) });
          if (!r.ok) throw new Error("http_" + r.status);
          const j = await r.json();
          const n = j?.message?.["total-results"];
          if (typeof n !== "number") throw new Error("no_count");
          return n;
        }),
      },
    }),
  },
});


Object.assign(COLLECTORS, {
  "autonomous-tech": {
    config: { metric: "ads_incidents", threshold_pct: 5, threshold_abs: 5, window: "24h", ttl: 3600, context_keys: [] },
    collectAll: async () => ({
      sources: {
        ads_incidents: await fetchSafe(async () => {
          const r = await fetch("https://static.nhtsa.gov/odi/ffdd/sgo-2021-01/SGO-2021-01_Incident_Reports_ADS.csv",
            { headers: { "user-agent": "VolatiAI/1.0" }, signal: AbortSignal.timeout(20000) });
          if (!r.ok) throw new Error("http_" + r.status);
          const t = await r.text();
          const lines = t.trim().split("\n");
          if (lines.length < 2) throw new Error("no_data");
          return lines.length - 1;
        }),
      },
    }),
  },
});


Object.assign(COLLECTORS, {
  travel: {
    config: { metric: "fuel_countries", threshold_pct: 0.5, threshold_abs: 1, window: "24h", ttl: 3600, context_keys: [] },
    collectAll: async () => ({
      sources: {
        fuel_countries: await fetchSafe(async () => {
          const r = await fetch("https://openvan.camp/api/fuel/prices?source=volatiai",
            { headers: { "user-agent": "VolatiAI/1.0" }, signal: AbortSignal.timeout(15000) });
          if (!r.ok) throw new Error("http_" + r.status);
          const j = await r.json();
          const n = j?.meta?.total_countries;
          if (typeof n !== "number") throw new Error("no_count");
          return n;
        }),
      },
    }),
  },
  fertilizer: {
    config: { metric: "kg_per_hectare", threshold_pct: 1, threshold_abs: 1, window: "24h", ttl: 86400, context_keys: [] },
    collectAll: async () => ({
      sources: {
        kg_per_hectare: await fetchSafe(async () => {
          const r = await fetch("https://api.worldbank.org/v2/country/WLD/indicator/AG.CON.FERT.ZS?format=json&per_page=5&date=2020:2024",
            { headers: { "user-agent": "VolatiAI/1.0" }, signal: AbortSignal.timeout(15000) });
          if (!r.ok) throw new Error("http_" + r.status);
          const j = await r.json();
          const arr = j?.[1];
          if (!Array.isArray(arr)) throw new Error("no_data");
          const row = arr.find(x => x.value !== null);
          if (!row) throw new Error("no_value");
          return row.value;
        }),
      },
    }),
  },
});


Object.assign(COLLECTORS, {
  tokenization: {
    config: { metric: "tokenized_stocks", threshold_pct: 1, threshold_abs: 1, window: "24h", ttl: 3600, context_keys: [] },
    collectAll: async () => ({
      sources: {
        tokenized_stocks: await fetchSafe(async () => {
          const r = await fetch("https://api.coinbase.com/v1/tokenized-stocks",
            { headers: { "user-agent": "VolatiAI/1.0", "accept": "application/json" }, signal: AbortSignal.timeout(15000) });
          if (!r.ok) throw new Error("http_" + r.status);
          const j = await r.json();
          const arr = Array.isArray(j) ? j : (j.data || j.tokens || []);
          if (!Array.isArray(arr)) throw new Error("not_array");
          return arr.length;
        }),
      },
    }),
  },
  stocks: {
    config: { metric: "us_listings", threshold_pct: 0.5, threshold_abs: 5, window: "24h", ttl: 3600, context_keys: [] },
    collectAll: async () => ({
      sources: {
        us_listings: await fetchSafe(async () => {
          const r = await fetch("https://blockrun.ai/api/v1/stocks/US/list",
            { headers: { "user-agent": "VolatiAI/1.0" }, signal: AbortSignal.timeout(15000) });
          if (!r.ok) throw new Error("http_" + r.status);
          const j = await r.json();
          const arr = Array.isArray(j) ? j : (j.data || j.tickers || j.symbols || []);
          if (!Array.isArray(arr)) throw new Error("not_array");
          return arr.length;
        }),
      },
    }),
  },
  "mental-health": {
    config: { metric: "mh_indicators", threshold_pct: 0.5, threshold_abs: 1, window: "24h", ttl: 3600, context_keys: [] },
    collectAll: async () => ({
      sources: {
        mh_indicators: await fetchSafe(async () => {
          const r = await fetch("https://ghoapi.azureedge.net/api/Indicator?$filter=contains(IndicatorName,'mental%20health')",
            { headers: { "user-agent": "VolatiAI/1.0" }, signal: AbortSignal.timeout(15000) });
          if (!r.ok) throw new Error("http_" + r.status);
          const j = await r.json();
          if (!Array.isArray(j.value)) throw new Error("no_value");
          return j.value.length;
        }),
      },
    }),
  },
  "renewable-energy": {
    config: { metric: "renewable_share_pct", threshold_pct: 1, threshold_abs: 0.5, window: "24h", ttl: 86400, context_keys: [] },
    collectAll: async () => ({
      sources: {
        renewable_share_pct: await fetchSafe(async () => {
          const r = await fetch("https://api.worldbank.org/v2/country/WLD/indicator/EG.FEC.RNEW.ZS?format=json&per_page=5&date=2020:2024",
            { headers: { "user-agent": "VolatiAI/1.0" }, signal: AbortSignal.timeout(15000) });
          if (!r.ok) throw new Error("http_" + r.status);
          const j = await r.json();
          const arr = j?.[1];
          if (!Array.isArray(arr)) throw new Error("no_data");
          const row = arr.find(x => x.value !== null);
          if (!row) throw new Error("no_value");
          return row.value;
        }),
      },
    }),
  },
  infrastructure: {
    config: { metric: "electricity_access_pct", threshold_pct: 0.5, threshold_abs: 0.5, window: "24h", ttl: 86400, context_keys: [] },
    collectAll: async () => ({
      sources: {
        electricity_access_pct: await fetchSafe(async () => {
          const r = await fetch("https://api.worldbank.org/v2/country/WLD/indicator/EG.ELC.ACCS.ZS?format=json&per_page=5&date=2020:2024",
            { headers: { "user-agent": "VolatiAI/1.0" }, signal: AbortSignal.timeout(15000) });
          if (!r.ok) throw new Error("http_" + r.status);
          const j = await r.json();
          const arr = j?.[1];
          if (!Array.isArray(arr)) throw new Error("no_data");
          const row = arr.find(x => x.value !== null);
          if (!row) throw new Error("no_value");
          return row.value;
        }),
      },
    }),
  },
  construction: {
    config: { metric: "industry_value_added_usd", threshold_pct: 1, threshold_abs: 1e10, window: "24h", ttl: 86400, context_keys: [] },
    collectAll: async () => ({
      sources: {
        industry_value_added_usd: await fetchSafe(async () => {
          const r = await fetch("https://api.worldbank.org/v2/country/WLD/indicator/NV.IND.TOTL.CD?format=json&per_page=5&date=2020:2024",
            { headers: { "user-agent": "VolatiAI/1.0" }, signal: AbortSignal.timeout(15000) });
          if (!r.ok) throw new Error("http_" + r.status);
          const j = await r.json();
          const arr = j?.[1];
          if (!Array.isArray(arr)) throw new Error("no_data");
          const row = arr.find(x => x.value !== null);
          if (!row) throw new Error("no_value");
          return row.value;
        }),
      },
    }),
  },
  beauty: {
    config: { metric: "beauty_products", threshold_pct: 0.5, threshold_abs: 100, window: "24h", ttl: 3600, context_keys: [] },
    collectAll: async () => ({
      sources: {
        beauty_products: await fetchSafe(async () => {
          const r = await fetch("https://world.openbeautyfacts.org/api/v2/search?page_size=1",
            { headers: { "user-agent": "VolatiAI/1.0" }, signal: AbortSignal.timeout(15000) });
          if (!r.ok) throw new Error("http_" + r.status);
          const j = await r.json();
          if (typeof j.count !== "number") throw new Error("no_count");
          return j.count;
        }),
      },
    }),
  },
});


Object.assign(COLLECTORS, {
  ev: {
    config: { metric: "ev_sales", threshold_pct: 5, threshold_abs: 10000, window: "24h", ttl: 86400, context_keys: [] },
    collectAll: async () => ({
      sources: {
        ev_sales: await fetchSafe(async () => {
          const r = await fetch("https://chinadata.live/api/v2/data/ev-sales-comparison",
            { headers: { "user-agent": "VolatiAI/1.0", "accept": "application/json" }, signal: AbortSignal.timeout(15000) });
          if (!r.ok) throw new Error("http_" + r.status);
          const j = await r.json();
          const rows = j?.data?.data;
          if (!Array.isArray(rows) || rows.length === 0) {
            throw new Error("no_rows: data_keys=" + Object.keys(j?.data || {}).join(","));
          }
          const last = rows[rows.length - 1];
          const v = typeof last?.value === "number" ? last.value
                  : typeof last?.y === "number" ? last.y
                  : typeof last === "number" ? last
                  : null;
          if (v === null) throw new Error("no_value: row_keys=" + Object.keys(last || {}).join(","));
          return v;
        }),
      },
    }),
  },
  "computer-networks": {
    config: { metric: "internet_exchanges", threshold_pct: 1, threshold_abs: 2, window: "24h", ttl: 3600, context_keys: [] },
    collectAll: async () => ({
      sources: {
        internet_exchanges: await fetchSafe(async () => {
          const r = await fetch("https://www.peeringdb.com/api/ix",
            { headers: { "user-agent": "VolatiAI/1.0" }, signal: AbortSignal.timeout(15000) });
          if (!r.ok) throw new Error("http_" + r.status);
          const j = await r.json();
          if (!Array.isArray(j.data)) throw new Error("no_data");
          return j.data.length;
        }),
      },
    }),
  },
  networking: {
    config: { metric: "ripe_probes", threshold_pct: 1, threshold_abs: 50, window: "24h", ttl: 3600, context_keys: [] },
    collectAll: async () => ({
      sources: {
        ripe_probes: await fetchSafe(async () => {
          const r = await fetch("https://atlas.ripe.net/api/v2/probes/?format=json&page_size=1",
            { headers: { "user-agent": "VolatiAI/1.0" }, signal: AbortSignal.timeout(15000) });
          if (!r.ok) throw new Error("http_" + r.status);
          const j = await r.json();
          if (typeof j.count !== "number") throw new Error("no_count");
          return j.count;
        }),
      },
    }),
  },
  optoelectronics: {
    config: { metric: "papers", threshold_pct: 5, threshold_abs: 50, window: "24h", ttl: 3600, context_keys: [] },
    collectAll: async () => ({
      sources: {
        papers: await fetchSafe(async () => {
          const r = await fetch("https://export.arxiv.org/api/query?search_query=cat:physics.optics&start=0&max_results=1",
            { headers: { "user-agent": "VolatiAI/1.0" }, signal: AbortSignal.timeout(15000) });
          if (!r.ok) throw new Error("http_" + r.status);
          const t = await r.text();
          const m = t.match(/<opensearch:totalResults[^>]*>\s*(\d+)\s*<\/opensearch:totalResults>/);
          if (!m) throw new Error("no_count");
          return parseInt(m[1], 10);
        }),
      },
    }),
  },
});


Object.assign(COLLECTORS, {
  electricity: {
    config: { metric: "grid_frequency_hz", threshold_pct: 0.1, threshold_abs: 0.05, window: "24h", ttl: 1800, context_keys: [] },
    collectAll: async () => ({
      sources: {
        grid_frequency_hz: await fetchSafe(async () => {
          const r = await fetch("https://data.elexon.co.uk/bmrs/api/v1/system/frequency",
            { headers: { "user-agent": "VolatiAI/1.0", "accept": "application/json" }, signal: AbortSignal.timeout(15000) });
          if (!r.ok) throw new Error("http_" + r.status);
          const j = await r.json();
          const arr = j?.data;
          if (!Array.isArray(arr) || !arr.length) throw new Error("no_data");
          const v = arr[0].frequency;
          if (typeof v !== "number") throw new Error("no_value");
          return v;
        }),
      },
    }),
  },
  "particle-physics": {
    config: { metric: "hep_papers", threshold_pct: 0.5, threshold_abs: 50, window: "24h", ttl: 3600, context_keys: [] },
    collectAll: async () => ({
      sources: {
        hep_papers: await fetchSafe(async () => {
          const r = await fetch("https://inspirehep.net/api/literature?q=arxiv_categories%3A%22hep-ph%22&size=1",
            { headers: { "user-agent": "VolatiAI/1.0", "accept": "application/json" }, signal: AbortSignal.timeout(15000) });
          if (!r.ok) throw new Error("http_" + r.status);
          const j = await r.json();
          const t = j?.hits?.total;
          const n = typeof t === "number" ? t
                  : typeof t?.value === "number" ? t.value
                  : null;
          if (n === null) throw new Error("no_count: total_type=" + typeof t + " keys=" + Object.keys(t || {}).join(","));
          return n;
        }),
      },
    }),
  },
  satellites: {
    config: { metric: "tracked_satellites", threshold_pct: 0.5, threshold_abs: 10, window: "24h", ttl: 3600, context_keys: [] },
    collectAll: async () => ({
      sources: {
        tracked_satellites: await fetchSafe(async () => {
          const r = await fetch("https://tle.ivanstanojevic.me/api/tle?search=starlink",
            { headers: { "user-agent": "VolatiAI/1.0", "accept": "application/json" }, signal: AbortSignal.timeout(15000) });
          if (!r.ok) throw new Error("http_" + r.status);
          const j = await r.json();
          const n = j?.totalItems;
          if (typeof n !== "number") throw new Error("no_count");
          return n;
        }),
      },
    }),
  },
});


Object.assign(COLLECTORS, {
  electricity: {
    config: { metric: "grid_frequency_hz", threshold_pct: 0.05, threshold_abs: 0.03, window: "24h", ttl: 900, context_keys: [] },
    collectAll: async () => ({
      sources: {
        grid_frequency_hz: await fetchSafe(async () => {
          const r = await fetch("https://trydan.uk/api/frequency",
            { headers: { "user-agent": "VolatiAI/1.0", "accept": "application/json" }, signal: AbortSignal.timeout(15000) });
          if (!r.ok) throw new Error("http_" + r.status);
          const j = await r.json();
          const v = j?.hz;
          if (typeof v !== "number") throw new Error("no_value");
          return v;
        }),
      },
    }),
  },
});


Object.assign(COLLECTORS, {
  smr: {
    config: { metric: "tracked_units", threshold_pct: 0.5, threshold_abs: 1, window: "24h", ttl: 3600, context_keys: [] },
    collectAll: async () => ({
      sources: {
        tracked_units: await fetchSafe(async () => {
          const r = await fetch("https://www.nuclearnewsnetwork.com/api/v1/projects",
            { headers: { "user-agent": "VolatiAI/1.0", "accept": "application/json" }, signal: AbortSignal.timeout(15000) });
          if (!r.ok) throw new Error("http_" + r.status);
          const j = await r.json();
          const n = typeof j?.count === "number" ? j.count
                  : Array.isArray(j?.units) ? j.units.length
                  : null;
          if (n === null) throw new Error("no_count: keys=" + Object.keys(j || {}).join(","));
          return n;
        }),
      },
    }),
  },
  "api-directory": {
    config: { metric: "num_apis", threshold_pct: 0.5, threshold_abs: 10, window: "24h", ttl: 3600, context_keys: [] },
    collectAll: async () => ({
      sources: {
        num_apis: await fetchSafe(async () => {
          const r = await fetch("https://api.apis.guru/v2/metrics.json",
            { headers: { "user-agent": "VolatiAI/1.0", "accept": "application/json" }, signal: AbortSignal.timeout(15000) });
          if (!r.ok) throw new Error("http_" + r.status);
          const j = await r.json();
          const n = j?.numAPIs ?? j?.numAPIsTotal ?? null;
          if (typeof n !== "number") throw new Error("no_count");
          return n;
        }),
      },
    }),
  },
});


Object.assign(COLLECTORS, {
  utilities: {
    config: { metric: "power_price_eur_mwh", threshold_pct: 10, threshold_abs: 5, window: "24h", ttl: 1800, context_keys: [] },
    collectAll: async () => ({
      sources: {
        power_price_eur_mwh: await fetchSafe(async () => {
          const r = await fetch("https://infranode.dev/api/v1/cities/berlin/power-price",
            { headers: { "user-agent": "VolatiAI/1.0", "accept": "application/json" }, signal: AbortSignal.timeout(15000) });
          if (!r.ok) throw new Error("http_" + r.status);
          const j = await r.json();
          const pl = j?.data?.payload;
          const candidates = [
            pl?.value, pl?.price,
            Array.isArray(pl?.values) ? pl.values[0]?.price : null,
            Array.isArray(pl?.values) ? pl.values[0]?.value : null,
            Array.isArray(pl?.data) ? pl.data[0]?.price : null,
            j?.data?.price, j?.price,
          ];
          for (const v of candidates) {
            if (typeof v === "number" && Number.isFinite(v)) return v;
          }
          throw new Error("no_price: payload_keys=" + Object.keys(pl || {}).join(",") + " top_keys=" + Object.keys(j || {}).join(","));
        }),
      },
    }),
  },
});


Object.assign(COLLECTORS, {
  science: {
    config: { metric: "datasets", threshold_pct: 0.5, threshold_abs: 100, window: "24h", ttl: 3600, context_keys: [] },
    collectAll: async () => ({
      sources: {
        datasets: await fetchSafe(async () => {
          const r = await fetch("https://www.pangaea.de/advanced/search.php?q=ocean+temperature&count=1&type=json",
            { headers: { "user-agent": "VolatiAI/1.0", "accept": "application/json" }, signal: AbortSignal.timeout(20000) });
          if (!r.ok) throw new Error("http_" + r.status);
          const j = await r.json();
          const n = j?.totalCount ?? j?.total ?? j?.count ?? j?.hits?.total;
          if (typeof n === "number") return n;
          throw new Error("shape_mismatch: keys=" + Object.keys(j || {}).join(","));
        }),
      },
    }),
  },
  fintech: {
    config: { metric: "markets", threshold_pct: 5, threshold_abs: 2, window: "24h", ttl: 1800, context_keys: [] },
    collectAll: async () => ({
      sources: {
        markets: await fetchSafe(async () => {
          const r = await fetch("https://api.orderly.org/v1/public/query", {
            method: "POST",
            headers: { "content-type": "application/json", "user-agent": "VolatiAI/1.0" },
            body: JSON.stringify({ type: "marketSummary" }),
            signal: AbortSignal.timeout(15000),
          });
          if (!r.ok) throw new Error("http_" + r.status);
          const j = await r.json();
          if (j?.success !== true) throw new Error("api_error: " + JSON.stringify(j).slice(0, 200));
          const d = j?.data;
          const arr = Array.isArray(d) ? d
                    : Array.isArray(d?.rows) ? d.rows
                    : Array.isArray(d?.markets) ? d.markets
                    : null;
          if (arr === null) throw new Error("shape_mismatch: data_keys=" + Object.keys(d || {}).join(","));
          return arr.length;
        }),
      },
    }),
  },
  "institutional-finance": {
    config: { metric: "filings_24h", threshold_pct: 20, threshold_abs: 100, window: "24h", ttl: 1800, context_keys: [] },
    collectAll: async () => ({
      sources: {
        filings_24h: await fetchSafe(async () => {
          const today = new Date().toISOString().slice(0, 10);
          const yesterday = new Date(Date.now() - 864e5).toISOString().slice(0, 10);
          const url = "https://efts.sec.gov/LATEST/search-index?q=&forms=8-K&dateRange=custom&startdt=" + yesterday + "&enddt=" + today;
          const r = await fetch(url, {
            headers: {
              "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
              "accept": "application/json",
            },
            signal: AbortSignal.timeout(20000),
          });
          if (!r.ok) throw new Error("http_" + r.status);
          const j = await r.json();
          const n = j?.hits?.total?.value ?? j?.hits?.total;
          if (typeof n === "number") return n;
          throw new Error("shape_mismatch: keys=" + Object.keys(j || {}).join(","));
        }),
      },
    }),
  },
  population: {
    config: { metric: "world_population", threshold_pct: 0.01, threshold_abs: 100000, window: "24h", ttl: 86400, context_keys: [] },
    collectAll: async () => ({
      sources: {
        world_population: await fetchSafe(async () => {
          const r = await fetch("https://api.worldbank.org/v2/country/WLD/indicator/SP.POP.TOTL?format=json&per_page=5&date=2020:2024",
            { headers: { "user-agent": "VolatiAI/1.0" }, signal: AbortSignal.timeout(15000) });
          if (!r.ok) throw new Error("http_" + r.status);
          const j = await r.json();
          const arr = j?.[1];
          if (!Array.isArray(arr)) throw new Error("no_data");
          const row = arr.find(x => x.value !== null);
          if (!row) throw new Error("no_value");
          return row.value;
        }),
      },
    }),
  },
  laws: {
    config: { metric: "documents", threshold_pct: 10, threshold_abs: 20, window: "24h", ttl: 1800, context_keys: [] },
    collectAll: async () => ({
      sources: {
        documents: await fetchSafe(async () => {
          const r = await fetch("https://www.federalregister.gov/api/v1/documents.json?per_page=1",
            { headers: { "user-agent": "VolatiAI/1.0", "accept": "application/json" }, signal: AbortSignal.timeout(15000) });
          if (!r.ok) throw new Error("http_" + r.status);
          const j = await r.json();
          if (typeof j.count !== "number") throw new Error("shape_mismatch: keys=" + Object.keys(j || {}).join(","));
          return j.count;
        }),
      },
    }),
  },
});


Object.assign(COLLECTORS, {
  simulations: {
    config: { metric: "projected_temp_c", threshold_pct: 5, threshold_abs: 0.5, window: "24h", ttl: 86400, context_keys: [] },
    collectAll: async () => ({
      sources: {
        projected_temp_c: await fetchSafe(async () => {
          const r = await fetch("https://climate-api.open-meteo.com/v1/climate?latitude=52.52&longitude=13.41&start_date=2049-01-01&end_date=2049-01-31&models=MRI_AGCM3_2_S&daily=temperature_2m_max",
            { headers: { "user-agent": "VolatiAI/1.0" }, signal: AbortSignal.timeout(20000) });
          if (!r.ok) throw new Error("http_" + r.status);
          const j = await r.json();
          const arr = j?.daily?.temperature_2m_max;
          if (!Array.isArray(arr) || arr.length === 0) throw new Error("no_daily: keys=" + Object.keys(j?.daily || {}).join(","));
          const v = arr[0];
          if (typeof v !== "number") throw new Error("no_value");
          return v;
        }),
      },
    }),
  },
});


Object.assign(COLLECTORS, {
  hackernews: {
    config: { metric: "stories_24h", threshold_pct: 20, threshold_abs: 50, window: "24h", ttl: 1800, context_keys: [] },
    collectAll: async () => ({
      sources: {
        stories_24h: await fetchSafe(async () => {
          const cutoff = Math.floor((Date.now() - 864e5) / 1000);
          const r = await fetch("https://hn.algolia.com/api/v1/search?tags=story&numericFilters=created_at_i>" + cutoff + "&hitsPerPage=1",
            { headers: { "user-agent": "VolatiAI/1.0" }, signal: AbortSignal.timeout(15000) });
          if (!r.ok) throw new Error("http_" + r.status);
          const j = await r.json();
          if (typeof j.nbHits !== "number") throw new Error("no_nbhits: keys=" + Object.keys(j || {}).join(","));
          return j.nbHits;
        }),
      },
    }),
  },
  "pypi-activity": {
    config: { metric: "weekly_downloads", threshold_pct: 10, threshold_abs: 10000000, window: "24h", ttl: 3600, context_keys: [] },
    collectAll: async () => ({
      sources: {
        weekly_downloads: await fetchSafe(async () => {
          const pkgs = ["requests", "numpy", "pandas", "flask", "django"];
          const results = await Promise.all(pkgs.map(p =>
            fetch("https://pypistats.org/api/packages/" + p + "/recent",
              { headers: { "user-agent": "VolatiAI/1.0" }, signal: AbortSignal.timeout(15000) })
          ));
          let total = 0;
          for (const r of results) {
            if (r.ok) { const j = await r.json(); const v = j?.data?.last_week; if (typeof v === "number") total += v; }
          }
          if (total === 0) throw new Error("all_packages_failed");
          return total;
        }),
      },
    }),
  },
  "crates-io": {
    config: { metric: "total_crates", threshold_pct: 0.1, threshold_abs: 100, window: "24h", ttl: 3600, context_keys: [] },
    collectAll: async () => ({
      sources: {
        total_crates: await fetchSafe(async () => {
          const r = await fetch("https://crates.io/api/v1/crates?page=1&per_page=1",
            { headers: { "user-agent": "VolatiAI/1.0" }, signal: AbortSignal.timeout(15000) });
          if (!r.ok) throw new Error("http_" + r.status);
          const j = await r.json();
          const n = j?.meta?.total;
          if (typeof n !== "number") throw new Error("no_total: keys=" + Object.keys(j?.meta || {}).join(","));
          return n;
        }),
      },
    }),
  },
});


Object.assign(COLLECTORS, {
  "space-news": {
    config: { metric: "articles_24h", threshold_pct: 20, threshold_abs: 10, window: "24h", ttl: 1800, context_keys: [] },
    collectAll: async () => ({
      sources: {
        articles_24h: await fetchSafe(async () => {
          const r = await fetch("https://api.spaceflightnewsapi.net/v4/articles/?limit=100",
            { headers: { "user-agent": "VolatiAI/1.0", "accept": "application/json" }, signal: AbortSignal.timeout(15000) });
          if (!r.ok) throw new Error("http_" + r.status);
          const j = await r.json();
          const arr = j?.results;
          if (!Array.isArray(arr)) throw new Error("no_results: keys=" + Object.keys(j || {}).join(","));
          return arr.length;
        }),
      },
    }),
  },
  forums: {
    config: { metric: "active_topics", threshold_pct: 20, threshold_abs: 5, window: "24h", ttl: 1800, context_keys: [] },
    collectAll: async () => ({
      sources: {
        active_topics: await fetchSafe(async () => {
          const r = await fetch("https://meta.discourse.org/latest.json",
            { headers: { "user-agent": "VolatiAI/1.0", "accept": "application/json" }, signal: AbortSignal.timeout(15000) });
          if (!r.ok) throw new Error("http_" + r.status);
          const j = await r.json();
          const topics = j?.topic_list?.topics;
          if (!Array.isArray(topics)) throw new Error("no_topics: keys=" + Object.keys(j || {}).join(","));
          return topics.length;
        }),
      },
    }),
  },
  "theoretical-cs": {
    config: { metric: "papers_7d", threshold_pct: 10, threshold_abs: 20, window: "24h", ttl: 3600, context_keys: [] },
    collectAll: async () => ({
      sources: {
        papers_7d: await fetchSafe(async () => {
          const d = new Date(Date.now() - 7*864e5).toISOString().slice(0,10).replace(/-/g,"");
          const r = await fetch("https://export.arxiv.org/api/query?search_query=cat%3Acs.DS&start=0&max_results=1",
            { headers: { "user-agent": "VolatiAI/1.0" }, signal: AbortSignal.timeout(20000) });
          if (!r.ok) throw new Error("http_" + r.status);
          const t = await r.text();
          const m = t.match(/<opensearch:totalResults[^>]*>\s*(\d+)\s*<\/opensearch:totalResults>/);
          if (!m) throw new Error("no_totalResults");
          return parseInt(m[1], 10);
        }),
      },
    }),
  },
});


Object.assign(COLLECTORS, {
  museums: {
    config: { metric: "total_objects", threshold_pct: 0.1, threshold_abs: 100, window: "24h", ttl: 86400, context_keys: [] },
    collectAll: async () => {
      const met = await fetchSafe(async () => {
        const r = await fetch("https://collectionapi.metmuseum.org/public/collection/v1/objects",
          { headers: { "user-agent": "VolatiAI/1.0" }, signal: AbortSignal.timeout(20000) });
        if (!r.ok) throw new Error("http_" + r.status);
        const j = await r.json();
        if (typeof j.total !== "number") throw new Error("no_total: keys=" + Object.keys(j || {}).join(","));
        return j.total;
      });
      const artic = await fetchSafe(async () => {
        const r = await fetch("https://api.artic.edu/api/v1/artworks?limit=1",
          { headers: { "user-agent": "VolatiAI/1.0" }, signal: AbortSignal.timeout(15000) });
        if (!r.ok) throw new Error("http_" + r.status);
        const j = await r.json();
        const n = j?.pagination?.total;
        if (typeof n !== "number") throw new Error("no_total: keys=" + Object.keys(j?.pagination || {}).join(","));
        return n;
      });
      const total = (met.data || 0) + (artic.data || 0);
      return {
        sources: {
          total_objects: { ok: met.ok || artic.ok, data: (met.ok || artic.ok) ? total : null,
                           error: (met.ok || artic.ok) ? null : "both_failed" },
          met: { ok: met.ok, data: met.data, error: met.error },
          artic: { ok: artic.ok, data: artic.data, error: artic.error },
        },
      };
    },
  },
  "korean-culture": {
    config: { metric: "works", threshold_pct: 0.5, threshold_abs: 100, window: "24h", ttl: 86400, context_keys: [] },
    collectAll: async () => ({
      sources: {
        works: await fetchSafe(async () => {
          const r = await fetch("https://openlibrary.org/subjects/korea.json?limit=1",
            { headers: { "user-agent": "VolatiAI/1.0" }, signal: AbortSignal.timeout(15000) });
          if (!r.ok) throw new Error("http_" + r.status);
          const j = await r.json();
          if (typeof j.work_count !== "number") throw new Error("no_count: keys=" + Object.keys(j || {}).join(","));
          return j.work_count;
        }),
      },
    }),
  },
});


Object.assign(COLLECTORS, {
  languages: {
    config: { metric: "wiki_count", threshold_pct: 0.1, threshold_abs: 5, window: "24h", ttl: 86400, context_keys: [] },
    collectAll: async () => ({
      sources: {
        wiki_count: await fetchSafe(async () => {
          const r = await fetch("https://meta.wikimedia.org/w/api.php?action=sitematrix&format=json",
            { headers: { "user-agent": "VolatiAI/1.0" }, signal: AbortSignal.timeout(20000) });
          if (!r.ok) throw new Error("http_" + r.status);
          const j = await r.json();
          const n = j?.sitematrix?.count;
          if (typeof n !== "number") throw new Error("no_count: keys=" + Object.keys(j?.sitematrix || {}).slice(0, 5).join(","));
          return n;
        }),
      },
    }),
  },
  calendars: {
    config: { metric: "upcoming_holidays", threshold_pct: 10, threshold_abs: 5, window: "24h", ttl: 1800, context_keys: [] },
    collectAll: async () => ({
      sources: {
        upcoming_holidays: await fetchSafe(async () => {
          const r = await fetch("https://date.nager.at/api/v3/NextPublicHolidaysWorldwide",
            { headers: { "user-agent": "VolatiAI/1.0", "accept": "application/json" }, signal: AbortSignal.timeout(15000) });
          if (!r.ok) throw new Error("http_" + r.status);
          const j = await r.json();
          const arr = Array.isArray(j) ? j : (Array.isArray(j?.data) ? j.data : null);
          if (!arr) throw new Error("no_array: keys=" + Object.keys(j || {}).join(","));
          return arr.length;
        }),
      },
    }),
  },
  programming: {
    config: { metric: "top_score", threshold_pct: 2, threshold_abs: 1, window: "24h", ttl: 3600, context_keys: [] },
    collectAll: async () => ({
      sources: {
        top_score: await fetchSafe(async () => {
          const r = await fetch("https://langpop.com/api/v1/rankings?limit=1",
            { headers: { "user-agent": "VolatiAI/1.0" }, signal: AbortSignal.timeout(15000) });
          if (!r.ok) throw new Error("http_" + r.status);
          const j = await r.json();
          const v = j?.data?.[0]?.composite_score;
          if (typeof v !== "number") throw new Error("no_score: keys=" + Object.keys(j?.data?.[0] || {}).join(","));
          return v;
        }),
      },
    }),
  },
  statistics: {
    config: { metric: "series_count", threshold_pct: 0.1, threshold_abs: 100000, window: "24h", ttl: 86400, context_keys: [] },
    collectAll: async () => ({
      sources: {
        series_count: await fetchSafe(async () => {
          const r = await fetch("https://api.db.nomics.world/v22/providers",
            { headers: { "user-agent": "VolatiAI/1.0" }, signal: AbortSignal.timeout(25000) });
          if (!r.ok) throw new Error("http_" + r.status);
          const j = await r.json();
          const n = j?.nb_series;
          if (typeof n !== "number") throw new Error("no_count: keys=" + Object.keys(j || {}).join(","));
          return n;
        }),
      },
    }),
  },
  entertainment: {
    config: { metric: "episodes_today", threshold_pct: 20, threshold_abs: 20, window: "24h", ttl: 1800, context_keys: [] },
    collectAll: async () => ({
      sources: {
        episodes_today: await fetchSafe(async () => {
          const r = await fetch("https://api.tvmaze.com/schedule",
            { headers: { "user-agent": "VolatiAI/1.0" }, signal: AbortSignal.timeout(20000) });
          if (!r.ok) throw new Error("http_" + r.status);
          const j = await r.json();
          if (!Array.isArray(j)) throw new Error("not_array: keys=" + Object.keys(j || {}).join(","));
          return j.length;
        }),
      },
    }),
  },
});


Object.assign(COLLECTORS, {
  "ai-news": {
    config: { metric: "ai_stories_24h", threshold_pct: 30, threshold_abs: 10, window: "24h", ttl: 1800, context_keys: [] },
    collectAll: async () => ({
      sources: {
        ai_stories_24h: await fetchSafe(async () => {
          const cutoff = Math.floor((Date.now() - 864e5) / 1000);
          const r = await fetch("https://hn.algolia.com/api/v1/search?query=AI&tags=story&numericFilters=created_at_i>" + cutoff + "&hitsPerPage=1",
            { headers: { "user-agent": "VolatiAI/1.0" }, signal: AbortSignal.timeout(15000) });
          if (!r.ok) throw new Error("http_" + r.status);
          const j = await r.json();
          if (typeof j.nbHits !== "number") throw new Error("no_nbhits: keys=" + Object.keys(j || {}).join(","));
          return j.nbHits;
        }),
      },
    }),
  },
  "science-news": {
    config: { metric: "papers_7d", threshold_pct: 2, threshold_abs: 500, window: "24h", ttl: 3600, context_keys: [] },
    collectAll: async () => ({
      sources: {
        papers_7d: await fetchSafe(async () => {
          const today = new Date().toISOString().slice(0,10).replace(/-/g,"/");
          const weekAgo = new Date(Date.now()-7*864e5).toISOString().slice(0,10).replace(/-/g,"/");
          const url = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=pubmed&term="
                    + encodeURIComponent(weekAgo + ":" + today + "[dp]")
                    + "&retmode=json&retmax=0";
          const r = await fetch(url, { headers: { "user-agent": "VolatiAI/1.0" }, signal: AbortSignal.timeout(15000) });
          if (!r.ok) throw new Error("http_" + r.status);
          const j = await r.json();
          const raw = j?.esearchresult?.count;
          if (raw == null) throw new Error("no_count: keys=" + Object.keys(j?.esearchresult || {}).join(","));
          const n = typeof raw === "number" ? raw : parseInt(raw, 10);
          if (Number.isNaN(n)) throw new Error("bad_count: " + raw);
          return n;
        }),
      },
    }),
  },
});


Object.assign(COLLECTORS, {
  "grid-demand": {
    config: { metric: "demand_mw", threshold_pct: 10, threshold_abs: 1000, window: "24h", ttl: 1800, context_keys: [] },
    collectAll: async () => ({
      sources: {
        demand_mw: await fetchSafe(async () => {
          const r = await fetch("https://trydan.uk/api/live",
            { headers: { "user-agent": "VolatiAI/1.0", "accept": "application/json" }, signal: AbortSignal.timeout(15000) });
          if (!r.ok) throw new Error("http_" + r.status);
          const j = await r.json();
          const d = j?.demand;
          if (typeof d === "number" && Number.isFinite(d)) return d;
          if (d && typeof d === "object") {
            for (const k of ["mw", "value", "current", "total", "demand_mw", "estimated"]) {
              if (typeof d[k] === "number" && Number.isFinite(d[k])) return d[k];
            }
            const numKeys = Object.keys(d).filter(k => typeof d[k] === "number");
            if (numKeys.length) return d[numKeys[0]];
            throw new Error("demand_no_number: keys=" + Object.keys(d).join(","));
          }
          throw new Error("no_demand: demand_type=" + typeof d + " top=" + Object.keys(j || {}).join(","));
        }),
      },
    }),
  },
  "grid-mix": {
    config: { metric: "renewable_pct", threshold_pct: 15, threshold_abs: 5, window: "24h", ttl: 1800, context_keys: [] },
    collectAll: async () => ({
      sources: {
        renewable_pct: await fetchSafe(async () => {
          const r = await fetch("https://trydan.uk/api/live",
            { headers: { "user-agent": "VolatiAI/1.0", "accept": "application/json" }, signal: AbortSignal.timeout(15000) });
          if (!r.ok) throw new Error("http_" + r.status);
          const j = await r.json();
          for (const k of ["renewable_share", "renewables_pct", "renewable_pct"]) {
            if (typeof j?.[k] === "number") return j[k];
          }
          const mix = j?.mix;
          if (Array.isArray(mix)) {
            const REN = ["wind","solar","hydro","biomass","other_renewable","renewable","renewables","wave","tidal"];
            let pctSum = 0, pctFound = false;
            let renMw = 0, totMw = 0, mwFound = false;
            for (const el of mix) {
              if (!el || typeof el !== "object") continue;
              const fuel = String(el.fuel || el.source || el.name || el.type || el.label || "").toLowerCase();
              const isRen = REN.some(r => fuel.includes(r));
              const pct = el.share ?? el.pct ?? el.percentage ?? el.percent;
              const mw  = el.mw ?? el.value ?? el.generation_mw;
              if (typeof pct === "number") { pctFound = true; if (isRen) pctSum += pct; }
              if (typeof mw === "number")  { mwFound = true;  totMw += mw; if (isRen) renMw += mw; }
            }
            if (pctFound && pctSum > 0) return Math.round(pctSum * 100) / 100;
            if (mwFound && totMw > 0)  return Math.round((renMw / totMw) * 10000) / 100;
            throw new Error("mix_no_renewable: sample=" + JSON.stringify(mix[0] || {}).slice(0, 300));
          }
          if (mix && typeof mix === "object") {
            const REN = ["wind","solar","hydro","biomass","other_renewable","renewables"];
            let sum = 0, found = false;
            for (const k of Object.keys(mix)) {
              if (REN.some(r => k.toLowerCase().includes(r)) && typeof mix[k] === "number") { sum += mix[k]; found = true; }
            }
            if (found) return Math.round(sum * 100) / 100;
            throw new Error("mix_obj_no_renewable: keys=" + Object.keys(mix).join(","));
          }
          throw new Error("no_mix: keys=" + Object.keys(j || {}).join(","));
        }),
      },
    }),
  },
  "grid-balance": {
    config: { metric: "system_balance_mw", threshold_pct: 50, threshold_abs: 100, window: "24h", ttl: 1800, context_keys: [] },
    collectAll: async () => ({
      sources: {
        system_balance_mw: await fetchSafe(async () => {
          const end = new Date().toISOString().replace(/\.\d+Z$/, ".000Z");
          const start = new Date(Date.now() - 3600e3).toISOString().replace(/\.\d+Z$/, ".000Z");
          const url = "https://dashboard.elering.ee/api/system/with-plan?start="
                    + encodeURIComponent(start) + "&end=" + encodeURIComponent(end);
          const r = await fetch(url, { headers: { "user-agent": "VolatiAI/1.0" }, signal: AbortSignal.timeout(20000) });
          if (!r.ok) throw new Error("http_" + r.status);
          const j = await r.json();
          if (j?.success !== true) throw new Error("api_error: success=" + String(j?.success));
          const real = j?.data?.real;
          if (!Array.isArray(real) || real.length === 0) {
            throw new Error("no_real_series: data_keys=" + Object.keys(j?.data || {}).join(","));
          }
          const last = real[real.length - 1];
          const v = last?.system_balance;
          if (typeof v !== "number") throw new Error("no_balance: row_keys=" + Object.keys(last || {}).join(","));
          return v;
        }),
      },
    }),
  },
});


Object.assign(COLLECTORS, {
  "botnet-c2": {
    config: { metric: "tracked_c2", threshold_pct: 5, threshold_abs: 10, window: "24h", ttl: 3600, context_keys: [] },
    collectAll: async () => ({
      sources: {
        tracked_c2: await fetchSafe(async () => {
          const r = await fetch("https://feodotracker.abuse.ch/downloads/ipblocklist.json",
            { headers: { "user-agent": "VolatiAI/1.0" }, signal: AbortSignal.timeout(20000) });
          if (!r.ok) throw new Error("http_" + r.status);
          const j = await r.json();
          if (!Array.isArray(j)) throw new Error("not_array: keys=" + Object.keys(j || {}).join(","));
          const online = j.filter(x => x && x.status === "online").length;
          const total = j.length;
          return { total, online };
        }),
      },
    }),
  },
  "bot-activity": {
    config: { metric: "agent_hits_24h", threshold_pct: 25, threshold_abs: 500, window: "24h", ttl: 1800, context_keys: [] },
    collectAll: async () => ({
      sources: {
        agent_hits_24h: await fetchSafe(async () => {
          const r = await fetch("https://robauto.ai/agent-leaderboard.json",
            { headers: { "user-agent": "VolatiAI/1.0", "accept": "application/json" }, signal: AbortSignal.timeout(15000) });
          if (!r.ok) throw new Error("http_" + r.status);
          const j = await r.json();
          const n = j?.summary?.total_agent_hits_24h;
          if (typeof n !== "number") throw new Error("no_count: summary_keys=" + Object.keys(j?.summary || {}).join(","));
          return n;
        }),
      },
    }),
  },
  "agent-census": {
    config: { metric: "named_agents", threshold_pct: 5, threshold_abs: 5, window: "24h", ttl: 86400, context_keys: [] },
    collectAll: async () => ({
      sources: {
        named_agents: await fetchSafe(async () => {
          const r = await fetch("https://fetchgate.dev/v1/agent-census.json",
            { headers: { "user-agent": "VolatiAI/1.0" }, signal: AbortSignal.timeout(15000) });
          if (!r.ok) throw new Error("http_" + r.status);
          const j = await r.json();
          const n = j?.totals?.namedAgents;
          if (typeof n !== "number") throw new Error("no_count: totals_keys=" + Object.keys(j?.totals || {}).join(","));
          return n;
        }),
      },
    }),
  },
});


Object.assign(COLLECTORS, {
});


Object.assign(COLLECTORS, {
  "open-data": {
    config: { metric: "socrata_datasets", threshold_pct: 0.5, threshold_abs: 100, window: "24h", ttl: 3600, context_keys: [] },
    collectAll: async () => ({
      sources: {
        socrata_datasets: await fetchSafe(async () => {
          const r = await fetch("https://api.us.socrata.com/api/catalog/v1?limit=1",
            { headers: { "user-agent": "VolatiAI/1.0", "accept": "application/json" }, signal: AbortSignal.timeout(20000) });
          if (!r.ok) throw new Error("http_" + r.status);
          const j = await r.json();
          const n = j?.resultSetSize;
          if (typeof n !== "number") throw new Error("no_count: keys=" + Object.keys(j || {}).join(","));
          return n;
        }),
      },
    }),
  },
});


Object.assign(COLLECTORS, {
  "bike-share": {
    config: { metric: "networks", threshold_pct: 2, threshold_abs: 5, window: "24h", ttl: 3600, context_keys: [] },
    collectAll: async () => ({
      sources: {
        networks: await fetchSafe(async () => {
          const r = await fetch("https://api.citybik.es/v2/networks",
            { headers: { "user-agent": "VolatiAI/1.0", "accept": "application/json" }, signal: AbortSignal.timeout(20000) });
          if (!r.ok) throw new Error("http_" + r.status);
          const j = await r.json();
          const arr = j?.networks;
          if (!Array.isArray(arr)) throw new Error("no_networks: keys=" + Object.keys(j || {}).join(","));
          return arr.length;
        }),
      },
    }),
  },
});


Object.assign(COLLECTORS, {
  "malware-families": {
    config: { metric: "tracked_families", threshold_pct: 0.5, threshold_abs: 10, window: "24h", ttl: 86400, context_keys: [] },
    collectAll: async () => ({
      sources: {
        tracked_families: await fetchSafe(async () => {
          const r = await fetch("https://jordanricky1604-ship-it.github.io/malware-families-catalog/api/families.json",
            { headers: { "user-agent": "VolatiAI/1.0", "accept": "application/json" }, signal: AbortSignal.timeout(20000) });
          if (!r.ok) throw new Error("http_" + r.status);
          const j = await r.json();
          const arr = j?.families;
          if (!Array.isArray(arr)) throw new Error("no_array: keys=" + Object.keys(j || {}).join(","));
          return arr.length;
        }),
      },
    }),
  },
});


Object.assign(COLLECTORS, {
  weather: {
    config: { metric: "temperature_c", threshold_pct: 10, threshold_abs: 1, window: "24h", ttl: 1800, context_keys: [] },
    collectAll: async () => ({
      sources: {
        temperature_c: await fetchSafe(async () => {
          const r = await fetch("https://api.open-meteo.com/v1/forecast?latitude=52.52&longitude=13.41&current=temperature_2m",
            { headers: { "user-agent": "VolatiAI/1.0", "accept": "application/json" }, signal: AbortSignal.timeout(15000) });
          if (!r.ok) throw new Error("http_" + r.status);
          const j = await r.json();
          const v = j?.current?.temperature_2m;
          if (typeof v !== "number") throw new Error("no_temp: current_keys=" + Object.keys(j?.current || {}).join(","));
          return v;
        }),
      },
    }),
  },
  "fema-disasters": {
    config: { metric: "total_declarations", threshold_pct: 0.1, threshold_abs: 10, window: "24h", ttl: 3600, context_keys: [] },
    collectAll: async () => ({
      sources: {
        total_declarations: await fetchSafe(async () => {
          const r = await fetch("https://www.fema.gov/api/open/v2/DisasterDeclarationsSummaries?$top=1&$inlinecount=allpages",
            { headers: { "user-agent": "VolatiAI/1.0", "accept": "application/json" }, signal: AbortSignal.timeout(20000) });
          if (!r.ok) throw new Error("http_" + r.status);
          const j = await r.json();
          const n = j?.["@odata.count"] ?? j?.metadata?.count ?? j?.count ?? j?.totalCount;
          if (typeof n !== "number") throw new Error("no_count: top_keys=" + Object.keys(j || {}).slice(0,8).join(",") + " meta_keys=" + Object.keys(j?.metadata || {}).join(","));
          return n;
        }),
      },
    }),
  },
});


Object.assign(COLLECTORS, {
  courtlistener: {
    config: { metric: "total_opinions", threshold_pct: 0.1, threshold_abs: 1000, window: "24h", ttl: 86400, context_keys: [] },
    collectAll: async () => ({
      sources: {
        total_opinions: await fetchSafe(async () => {
          const r = await fetch("https://www.courtlistener.com/api/rest/v4/search/?q=*&type=o&order_by=dateFiled+desc",
            { headers: { "user-agent": "VolatiAI/1.0", "accept": "application/json" }, signal: AbortSignal.timeout(20000) });
          if (!r.ok) throw new Error("http_" + r.status);
          const j = await r.json();
          const n = j?.count;
          if (typeof n !== "number") throw new Error("no_count: keys=" + Object.keys(j || {}).join(","));
          return n;
        }),
      },
    }),
  },
  "usgs-streamflow": {
    config: { metric: "discharge_cfs", threshold_pct: 20, threshold_abs: 10000, window: "24h", ttl: 1800, context_keys: [] },
    collectAll: async () => ({
      sources: {
        discharge_cfs: await fetchSafe(async () => {
          const r = await fetch("https://waterservices.usgs.gov/nwis/iv/?format=json&sites=07010000&parameterCd=00060&period=PT2H",
            { headers: { "user-agent": "VolatiAI/1.0" }, signal: AbortSignal.timeout(20000) });
          if (!r.ok) throw new Error("http_" + r.status);
          const j = await r.json();
          const ts = j?.value?.timeSeries;
          if (!Array.isArray(ts) || !ts.length) throw new Error("no_series: top_keys=" + Object.keys(j || {}).join(","));
          const vals = ts[0]?.values?.[0]?.value;
          if (!Array.isArray(vals) || !vals.length) throw new Error("no_values: ts_keys=" + Object.keys(ts[0] || {}).join(","));
          const v = vals[0]?.value;
          const n = typeof v === "number" ? v : parseFloat(v);
          if (Number.isNaN(n)) throw new Error("bad_value: " + String(v));
          return n;
        }),
      },
    }),
  },
  "openfda-recalls": {
    config: { metric: "total_recalls", threshold_pct: 0.1, threshold_abs: 10, window: "24h", ttl: 3600, context_keys: [] },
    collectAll: async () => ({
      sources: {
        total_recalls: await fetchSafe(async () => {
          const r = await fetch("https://api.fda.gov/drug/enforcement.json?limit=1",
            { headers: { "user-agent": "VolatiAI/1.0" }, signal: AbortSignal.timeout(20000) });
          if (!r.ok) throw new Error("http_" + r.status);
          const j = await r.json();
          const n = j?.meta?.results?.total;
          if (typeof n !== "number") throw new Error("no_total: meta_keys=" + Object.keys(j?.meta || {}).join(","));
          return n;
        }),
      },
    }),
  },
  "exchange-rate": {
    config: { metric: "eur_usd", threshold_pct: 1, threshold_abs: 0.005, window: "24h", ttl: 3600, context_keys: [] },
    collectAll: async () => ({
      sources: {
        eur_usd: await fetchSafe(async () => {
          const r = await fetch("https://open.er-api.com/v6/latest/USD",
            { headers: { "user-agent": "VolatiAI/1.0" }, signal: AbortSignal.timeout(15000) });
          if (!r.ok) throw new Error("http_" + r.status);
          const j = await r.json();
          const v = j?.rates?.EUR;
          if (typeof v !== "number") throw new Error("no_rate: rates_keys=" + Object.keys(j?.rates || {}).slice(0,5).join(","));
          return v;
        }),
      },
    }),
  },
});


Object.assign(COLLECTORS, {
  "aviation-weather": {
    config: { metric: "metar_stations", threshold_pct: 15, threshold_abs: 20, window: "24h", ttl: 1800, context_keys: [] },
    collectAll: async () => ({
      sources: {
        metar_stations: await fetchSafe(async () => {
          const r = await fetch("https://aviationweather.gov/api/data/metar?bbox=35,-15,60,30&format=json",
            { headers: { "user-agent": "VolatiAI/1.0", "accept": "application/json" }, signal: AbortSignal.timeout(20000) });
          if (!r.ok) throw new Error("http_" + r.status);
          const j = await r.json();
          if (!Array.isArray(j)) throw new Error("not_array: keys=" + Object.keys(j || {}).join(","));
          return j.length;
        }),
      },
    }),
  },
  "openlibrary-books": {
    config: { metric: "num_found", threshold_pct: 0.1, threshold_abs: 10000, window: "24h", ttl: 86400, context_keys: [] },
    collectAll: async () => ({
      sources: {
        num_found: await fetchSafe(async () => {
          const r = await fetch("https://openlibrary.org/search.json?q=history&limit=1",
            { headers: { "user-agent": "VolatiAI/1.0" }, signal: AbortSignal.timeout(20000) });
          if (!r.ok) throw new Error("http_" + r.status);
          const j = await r.json();
          const n = j?.numFound;
          if (typeof n !== "number") throw new Error("no_numFound: keys=" + Object.keys(j || {}).join(","));
          return n;
        }),
      },
    }),
  },
  "worldbank-indicators": {
    config: { metric: "indicator_count", threshold_pct: 0.1, threshold_abs: 50, window: "24h", ttl: 86400, context_keys: [] },
    collectAll: async () => ({
      sources: {
        indicator_count: await fetchSafe(async () => {
          const r = await fetch("https://api.worldbank.org/v2/indicator?format=json&per_page=1",
            { headers: { "user-agent": "VolatiAI/1.0" }, signal: AbortSignal.timeout(20000) });
          if (!r.ok) throw new Error("http_" + r.status);
          const j = await r.json();
          const n = j?.[0]?.total ?? j?.[0]?.pages;
          if (typeof n !== "number") throw new Error("no_total: keys=" + JSON.stringify(Object.keys(j?.[0] || {})).slice(0,200));
          return n;
        }),
      },
    }),
  },
  "npm-search": {
    config: { metric: "total_matches", threshold_pct: 0.5, threshold_abs: 500, window: "24h", ttl: 86400, context_keys: [] },
    collectAll: async () => ({
      sources: {
        total_matches: await fetchSafe(async () => {
          const r = await fetch("https://registry.npmjs.org/-/v1/search?text=keywords:react&size=1",
            { headers: { "user-agent": "VolatiAI/1.0", "accept": "application/json" }, signal: AbortSignal.timeout(20000) });
          if (!r.ok) throw new Error("http_" + r.status);
          const j = await r.json();
          const n = j?.total;
          if (typeof n !== "number") throw new Error("no_total: keys=" + Object.keys(j || {}).join(","));
          return n;
        }),
      },
    }),
  },
});


Object.assign(COLLECTORS, {
  "sports-scores": {
    config: { metric: "games_today", threshold_pct: 50, threshold_abs: 5, window: "24h", ttl: 1800, context_keys: [] },
    collectAll: async () => ({
      sources: {
        games_today: await fetchSafe(async () => {
          const r = await fetch("https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard",
            { headers: { "user-agent": "VolatiAI/1.0" }, signal: AbortSignal.timeout(15000) });
          if (!r.ok) throw new Error("http_" + r.status);
          const j = await r.json();
          const events = j?.events;
          if (!Array.isArray(events)) throw new Error("no_events: keys=" + Object.keys(j || {}).join(","));
          return events.length;
        }),
      },
    }),
  },
  "nutrition-foods": {
    config: { metric: "total_foods", threshold_pct: 0.1, threshold_abs: 1000, window: "24h", ttl: 86400, context_keys: [] },
    collectAll: async () => ({
      sources: {
        total_foods: await fetchSafe(async () => {
          const r = await fetch("https://api.nal.usda.gov/fdc/v1/foods/search?api_key=DEMO_KEY&query=apple&pageSize=1",
            { headers: { "user-agent": "VolatiAI/1.0" }, signal: AbortSignal.timeout(20000) });
          if (!r.ok) throw new Error("http_" + r.status);
          const j = await r.json();
          const n = j?.totalHits;
          if (typeof n !== "number") throw new Error("no_totalHits: keys=" + Object.keys(j || {}).join(","));
          return n;
        }),
      },
    }),
  },
  "species-observations": {
    config: { metric: "occurrence_count", threshold_pct: 1, threshold_abs: 1000000, window: "24h", ttl: 86400, context_keys: [] },
    collectAll: async () => ({
      sources: {
        occurrence_count: await fetchSafe(async () => {
          const r = await fetch("https://api.gbif.org/v1/occurrence/search?limit=1",
            { headers: { "user-agent": "VolatiAI/1.0" }, signal: AbortSignal.timeout(20000) });
          if (!r.ok) throw new Error("http_" + r.status);
          const j = await r.json();
          const n = j?.count;
          if (typeof n !== "number") throw new Error("no_count: keys=" + Object.keys(j || {}).join(","));
          return n;
        }),
      },
    }),
  },
  "nature-observations": {
    config: { metric: "total_observations", threshold_pct: 1, threshold_abs: 10000, window: "24h", ttl: 86400, context_keys: [] },
    collectAll: async () => ({
      sources: {
        total_observations: await fetchSafe(async () => {
          const r = await fetch("https://api.inaturalist.org/v1/observations?per_page=1",
            { headers: { "user-agent": "VolatiAI/1.0" }, signal: AbortSignal.timeout(20000) });
          if (!r.ok) throw new Error("http_" + r.status);
          const j = await r.json();
          const n = j?.total_results;
          if (typeof n !== "number") throw new Error("no_total_results: keys=" + Object.keys(j || {}).join(","));
          return n;
        }),
      },
    }),
  },
  "radio-stations": {
    config: { metric: "total_stations", threshold_pct: 1, threshold_abs: 100, window: "24h", ttl: 86400, context_keys: [] },
    collectAll: async () => ({
      sources: {
        total_stations: await fetchSafe(async () => {
          const r = await fetch("https://de1.api.radio-browser.info/json/stats",
            { headers: { "user-agent": "VolatiAI/1.0" }, signal: AbortSignal.timeout(15000) });
          if (!r.ok) throw new Error("http_" + r.status);
          const j = await r.json();
          const n = j?.stations;
          if (typeof n !== "number") throw new Error("no_stations: keys=" + Object.keys(j || {}).join(","));
          return n;
        }),
      },
    }),
  },
  "climate-datasets": {
    config: { metric: "dataset_count", threshold_pct: 0.5, threshold_abs: 10, window: "24h", ttl: 86400, context_keys: [] },
    collectAll: async () => ({
      sources: {
        dataset_count: await fetchSafe(async () => {
          const r = await fetch("https://www.ncei.noaa.gov/access/services/search/v1/datasets?limit=1",
            { headers: { "user-agent": "VolatiAI/1.0" }, signal: AbortSignal.timeout(20000) });
          if (!r.ok) throw new Error("http_" + r.status);
          const j = await r.json();
          const n = j?.count;
          if (typeof n !== "number") throw new Error("no_count: keys=" + Object.keys(j || {}).join(","));
          return n;
        }),
      },
    }),
  },
  "nasa-neo": {
    config: { metric: "neo_total", threshold_pct: 5, threshold_abs: 50, window: "24h", ttl: 3600, context_keys: [] },
    collectAll: async () => ({
      sources: {
        neo_total: await fetchSafe(async () => {
          const r = await fetch("https://api.nasa.gov/neo/rest/v1/neo/browse?api_key=DEMO_KEY&size=1",
            { headers: { "user-agent": "VolatiAI/1.0" }, signal: AbortSignal.timeout(20000) });
          if (!r.ok) throw new Error("http_" + r.status);
          const j = await r.json();
          const n = j?.page?.total_elements;
          if (typeof n !== "number") throw new Error("no_total_elements: keys=" + Object.keys(j?.page || {}).join(","));
          return n;
        }),
      },
    }),
  },
  "frankfurter-fx": {
    config: { metric: "usd_eur", threshold_pct: 1, threshold_abs: 0.005, window: "24h", ttl: 3600, context_keys: [] },
    collectAll: async () => ({
      sources: {
        usd_eur: await fetchSafe(async () => {
          const r = await fetch("https://api.frankfurter.app/latest?from=USD&to=EUR",
            { headers: { "user-agent": "VolatiAI/1.0" }, signal: AbortSignal.timeout(15000) });
          if (!r.ok) throw new Error("http_" + r.status);
          const j = await r.json();
          const v = j?.rates?.EUR;
          if (typeof v !== "number") throw new Error("no_rate: rates_keys=" + Object.keys(j?.rates || {}).join(","));
          return v;
        }),
      },
    }),
  },
  "devto-articles": {
    config: { metric: "article_count", threshold_pct: 10, threshold_abs: 100, window: "24h", ttl: 3600, context_keys: [] },
    collectAll: async () => ({
      sources: {
        article_count: await fetchSafe(async () => {
          const r = await fetch("https://dev.to/api/articles?per_page=100",
            { headers: { "user-agent": "VolatiAI/1.0" }, signal: AbortSignal.timeout(15000) });
          if (!r.ok) throw new Error("http_" + r.status);
          const j = await r.json();
          if (!Array.isArray(j)) throw new Error("not_array: keys=" + Object.keys(j || {}).join(","));
          return j.length;
        }),
      },
    }),
  },
});


Object.assign(COLLECTORS, {
  "flux-nodes": {
    config: { metric: "total_nodes", threshold_pct: 2, threshold_abs: 50, window: "24h", ttl: 3600, context_keys: [] },
    collectAll: async () => ({
      sources: {
        total_nodes: await fetchSafe(async () => {
          const r = await fetch("https://api.runonflux.io/daemon/getfluxnodecount",
            { headers: { "user-agent": "VolatiAI/1.0", "accept": "application/json" }, signal: AbortSignal.timeout(15000) });
          if (!r.ok) throw new Error("http_" + r.status);
          const j = await r.json();
          const n = j?.data?.total;
          if (typeof n !== "number") throw new Error("no_total: keys=" + Object.keys(j?.data || {}).join(","));
          return n;
        }),
      },
    }),
  },
  "helium-hotspots": {
    config: { metric: "total_hotspots", threshold_pct: 0.5, threshold_abs: 500, window: "24h", ttl: 3600, context_keys: [] },
    collectAll: async () => ({
      sources: {
        total_hotspots: await fetchSafe(async () => {
          const r = await fetch("https://entities.nft.helium.io/v2/hotspots/pagination-metadata?subnetwork=iot",
            { headers: { "user-agent": "VolatiAI/1.0", "accept": "application/json" }, signal: AbortSignal.timeout(15000) });
          if (!r.ok) throw new Error("http_" + r.status);
          const j = await r.json();
          const n = j?.totalItems;
          if (typeof n !== "number") throw new Error("no_totalItems: keys=" + Object.keys(j || {}).join(","));
          return n;
        }),
      },
    }),
  },
  "filecoin-miners": {
    config: { metric: "active_miners", threshold_pct: 1, threshold_abs: 5, window: "24h", ttl: 3600, context_keys: [] },
    collectAll: async () => ({
      sources: {
        active_miners: await fetchSafe(async () => {
          const r = await fetch("https://filfox.info/api/v1/overview",
            { headers: { "user-agent": "VolatiAI/1.0", "accept": "application/json" }, signal: AbortSignal.timeout(15000) });
          if (!r.ok) throw new Error("http_" + r.status);
          const j = await r.json();
          const n = j?.activeMiners;
          if (typeof n !== "number") throw new Error("no_activeMiners: keys=" + Object.keys(j || {}).slice(0,8).join(","));
          return n;
        }),
      },
    }),
  },
  "depin-networks": {
    config: { metric: "networks_with_telemetry", threshold_pct: 1, threshold_abs: 2, window: "24h", ttl: 3600, context_keys: [] },
    collectAll: async () => ({
      sources: {
        networks_with_telemetry: await fetchSafe(async () => {
          const r = await fetch("https://kairossignal.com/v1/supply",
            { headers: { "user-agent": "VolatiAI/1.0", "accept": "application/json" }, signal: AbortSignal.timeout(20000) });
          if (!r.ok) throw new Error("http_" + r.status);
          const j = await r.json();
          const n = j?.n_networks_available ?? j?.n_networks;
          if (typeof n !== "number") throw new Error("no_networks: keys=" + Object.keys(j || {}).join(","));
          return n;
        }),
      },
    }),
  },
});


Object.assign(COLLECTORS, {
  "policy-rates": {
    config: { metric: "us_policy_rate", threshold_pct: 1, threshold_abs: 0.05, window: "24h", ttl: 3600, context_keys: [] },
    collectAll: async () => ({
      sources: {
        us_policy_rate: await fetchSafe(async () => {
          const r = await fetch("https://stats.bis.org/api/v1/data/WS_CBPOL/D.US?lastNObservations=1&format=csv",
            { headers: { "user-agent": "VolatiAI/1.0" }, signal: AbortSignal.timeout(20000) });
          if (!r.ok) throw new Error("http_" + r.status);
          const text = await r.text();
          const lines = text.trim().split("\n");
          if (lines.length < 2) throw new Error("no_data_rows: lines=" + lines.length);
          const headers = lines[0].split(",").map(h => h.trim().replace(/^"|"$/g, ""));
          const values = lines[1].split(",").map(v => v.trim().replace(/^"|"$/g, ""));
          const idx = headers.indexOf("OBS_VALUE");
          if (idx === -1) throw new Error("no_OBS_VALUE: headers=" + headers.join("|"));
          const n = parseFloat(values[idx]);
          if (Number.isNaN(n)) throw new Error("bad_value: " + values[idx]);
          return n;
        }),
      },
    }),
  },
  "nport-filings": {
    config: { metric: "filings_24h", threshold_pct: 20, threshold_abs: 10, window: "24h", ttl: 1800, context_keys: [] },
    collectAll: async () => ({
      sources: {
        filings_24h: await fetchSafe(async () => {
          const today = new Date().toISOString().slice(0, 10);
          const yesterday = new Date(Date.now() - 864e5).toISOString().slice(0, 10);
          const url = "https://efts.sec.gov/LATEST/search-index?q=&forms=NPORT-P&dateRange=custom&startdt=" + yesterday + "&enddt=" + today;
          const r = await fetch(url, {
            headers: {
              "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
              "accept": "application/json",
            },
            signal: AbortSignal.timeout(20000),
          });
          if (!r.ok) throw new Error("http_" + r.status);
          const j = await r.json();
          const n = j?.hits?.total?.value ?? j?.hits?.total;
          if (typeof n !== "number") throw new Error("no_count: keys=" + Object.keys(j || {}).join(","));
          return n;
        }),
      },
    }),
  },
  "xbrl-frames": {
    config: { metric: "reporting_filers", threshold_pct: 5, threshold_abs: 50, window: "24h", ttl: 86400, context_keys: [] },
    collectAll: async () => ({
      sources: {
        reporting_filers: await fetchSafe(async () => {
          const now = new Date();
          let q = Math.floor(now.getMonth() / 3) + 1;
          let y = now.getFullYear();
          // Frames for the just-closed quarter are populated first
          q -= 1;
          if (q === 0) { q = 4; y -= 1; }
          const period = "CY" + y + "Q" + q + "I";
          const url = "https://data.sec.gov/api/xbrl/frames/us-gaap/Assets/USD/" + period + ".json";
          const r = await fetch(url, {
            headers: { "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36" },
            signal: AbortSignal.timeout(20000),
          });
          if (!r.ok) throw new Error("http_" + r.status);
          const j = await r.json();
          const arr = j?.data;
          if (!Array.isArray(arr)) throw new Error("no_data: keys=" + Object.keys(j || {}).join(","));
          return arr.length;
        }),
      },
    }),
  },
});


Object.assign(COLLECTORS, {
  "13f-holdings": {
    config: { metric: "filings_24h", threshold_pct: 20, threshold_abs: 5, window: "24h", ttl: 1800, context_keys: [] },
    collectAll: async () => ({
      sources: {
        filings_24h: await fetchSafe(async () => {
          const today = new Date().toISOString().slice(0, 10);
          const yesterday = new Date(Date.now() - 864e5).toISOString().slice(0, 10);
          const url = "https://efts.sec.gov/LATEST/search-index?q=&forms=13F-HR&dateRange=custom&startdt=" + yesterday + "&enddt=" + today;
          const r = await fetch(url, {
            headers: { "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36", "accept": "application/json" },
            signal: AbortSignal.timeout(20000),
          });
          if (!r.ok) throw new Error("http_" + r.status);
          const j = await r.json();
          const n = j?.hits?.total?.value ?? j?.hits?.total;
          if (typeof n !== "number") throw new Error("no_count: keys=" + Object.keys(j || {}).join(","));
          return n;
        }),
      },
    }),
  },
  "form-d-filings": {
    config: { metric: "filings_24h", threshold_pct: 20, threshold_abs: 10, window: "24h", ttl: 1800, context_keys: [] },
    collectAll: async () => ({
      sources: {
        filings_24h: await fetchSafe(async () => {
          const today = new Date().toISOString().slice(0, 10);
          const yesterday = new Date(Date.now() - 864e5).toISOString().slice(0, 10);
          const url = "https://efts.sec.gov/LATEST/search-index?q=&forms=D&dateRange=custom&startdt=" + yesterday + "&enddt=" + today;
          const r = await fetch(url, {
            headers: { "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36", "accept": "application/json" },
            signal: AbortSignal.timeout(20000),
          });
          if (!r.ok) throw new Error("http_" + r.status);
          const j = await r.json();
          const n = j?.hits?.total?.value ?? j?.hits?.total;
          if (typeof n !== "number") throw new Error("no_count: keys=" + Object.keys(j || {}).join(","));
          return n;
        }),
      },
    }),
  },
  "hedge-fund-monitor": {
    config: { metric: "total_nav_usd", threshold_pct: 2, threshold_abs: 1e10, window: "24h", ttl: 3600, context_keys: [] },
    collectAll: async () => ({
      sources: {
        total_nav_usd: await fetchSafe(async () => {
          const r = await fetch("https://data.financialresearch.gov/hf/v1/series/full/?mnemonic=FPF-ALLQHF_NAV_SUM",
            { headers: { "user-agent": "VolatiAI/1.0", "accept": "application/json" }, signal: AbortSignal.timeout(20000) });
          if (!r.ok) throw new Error("http_" + r.status);
          const j = await r.json();
          const key = Object.keys(j || {})[0];
          const series = j?.[key];
          const ts = series?.timeseries;
          const obs = Array.isArray(ts) ? ts
                    : Array.isArray(series?.observations) ? series.observations
                    : null;
          if (!obs || !obs.length) throw new Error("no_obs: series_keys=" + Object.keys(series || {}).join(","));
          const last = obs[obs.length - 1];
          const v = typeof last?.value === "number" ? last.value
                  : typeof last?.[1] === "number" ? last[1]
                  : null;
          if (v === null) throw new Error("no_value: last_keys=" + Object.keys(last || {}).join(","));
          return v;
        }),
      },
    }),
  },
  "yc-companies": {
    config: { metric: "total_companies", threshold_pct: 0.5, threshold_abs: 10, window: "24h", ttl: 86400, context_keys: [] },
    collectAll: async () => ({
      sources: {
        total_companies: await fetchSafe(async () => {
          const r = await fetch("https://yc-oss.github.io/api/meta.json",
            { headers: { "user-agent": "VolatiAI/1.0", "accept": "application/json" }, signal: AbortSignal.timeout(15000) });
          if (!r.ok) throw new Error("http_" + r.status);
          const j = await r.json();
          const all = j?.companies?.all;
          if (Array.isArray(all)) return all.length;
          const comp = j?.companies;
          if (comp && typeof comp === "object") {
            const total = Object.values(comp).reduce((s, arr) => s + (Array.isArray(arr) ? arr.length : 0), 0);
            if (total > 0) return total;
          }
          throw new Error("no_companies: keys=" + Object.keys(j?.companies || {}).join(","));
        }),
      },
    }),
  },
  gitdealflow: {
    config: { metric: "tracked_startups", threshold_pct: 2, threshold_abs: 5, window: "24h", ttl: 3600, context_keys: [] },
    collectAll: async () => ({
      sources: {
        tracked_startups: await fetchSafe(async () => {
          const r = await fetch("https://signals.gitdealflow.com/api/signals.json",
            { headers: { "user-agent": "VolatiAI/1.0", "accept": "application/json" }, signal: AbortSignal.timeout(15000) });
          if (!r.ok) throw new Error("http_" + r.status);
          const j = await r.json();
          const arr = Array.isArray(j) ? j : (j?.signals ?? j?.data ?? j?.companies ?? []);
          if (!Array.isArray(arr)) throw new Error("no_array: keys=" + Object.keys(j || {}).join(","));
          return arr.length;
        }),
      },
    }),
  },
  "ai-models": {
    config: { metric: "available_models", threshold_pct: 2, threshold_abs: 1, window: "24h", ttl: 3600, context_keys: [] },
    collectAll: async () => ({
      sources: {
        available_models: await fetchSafe(async () => {
          const r = await fetch("https://text.pollinations.ai/models",
            { headers: { "user-agent": "VolatiAI/1.0", "accept": "application/json" }, signal: AbortSignal.timeout(15000) });
          if (!r.ok) throw new Error("http_" + r.status);
          const j = await r.json();
          if (!Array.isArray(j)) throw new Error("not_array: keys=" + Object.keys(j || {}).join(","));
          return j.length;
        }),
      },
    }),
  },
  "bluesky-posts": {
    config: { metric: "ai_posts_24h", threshold_pct: 30, threshold_abs: 10, window: "24h", ttl: 1800, context_keys: [] },
    collectAll: async () => ({
      sources: {
        ai_posts_24h: await fetchSafe(async () => {
          const r = await fetch("https://api.bsky.app/xrpc/app.bsky.feed.searchPosts?q=AI&limit=100",
            { headers: { "user-agent": "VolatiAI/1.0", "accept": "application/json" }, signal: AbortSignal.timeout(15000) });
          if (!r.ok) throw new Error("http_" + r.status);
          const j = await r.json();
          const posts = j?.posts;
          if (!Array.isArray(posts)) throw new Error("no_posts: keys=" + Object.keys(j || {}).join(","));
          return posts.length;
        }),
      },
    }),
  },
  "vc-funding": {
    config: { metric: "total_rounds", threshold_pct: 0.5, threshold_abs: 50, window: "24h", ttl: 3600, context_keys: [] },
    collectAll: async () => ({
      sources: {
        total_rounds: await fetchSafe(async () => {
          const r = await fetch("https://funding.tech.eu/api/v1/rounds?limit=1",
            { headers: { "user-agent": "VolatiAI/1.0", "accept": "application/json" }, signal: AbortSignal.timeout(20000) });
          if (!r.ok) throw new Error("http_" + r.status);
          const j = await r.json();
          const n = j?.count ?? j?.total;
          if (typeof n === "number") return n;
          throw new Error("no_count: keys=" + Object.keys(j || {}).join(","));
        }),
      },
    }),
  },
  "ma-exits": {
    config: { metric: "total_exits", threshold_pct: 0.5, threshold_abs: 10, window: "24h", ttl: 3600, context_keys: [] },
    collectAll: async () => ({
      sources: {
        total_exits: await fetchSafe(async () => {
          const r = await fetch("https://funding.tech.eu/api/v1/exits?limit=1",
            { headers: { "user-agent": "VolatiAI/1.0", "accept": "application/json" }, signal: AbortSignal.timeout(20000) });
          if (!r.ok) throw new Error("http_" + r.status);
          const j = await r.json();
          const n = j?.total ?? j?.count ?? j?.meta?.total;
          if (typeof n === "number") return n;
          const arr = Array.isArray(j) ? j : j?.data ?? j?.exits;
          if (Array.isArray(arr)) return arr.length;
          throw new Error("no_count: keys=" + Object.keys(j || {}).join(", "));
        }),
      },
    }),
  },
  "ma-transactions": {
    config: { metric: "total_transactions", threshold_pct: 1, threshold_abs: 5, window: "24h", ttl: 3600, context_keys: [] },
    collectAll: async () => ({
      sources: {
        total_transactions: await fetchSafe(async () => {
          const r = await fetch("https://windsordrake.com/market-intelligence/api/transactions.json",
            { headers: { "user-agent": "VolatiAI/1.0", "accept": "application/json" }, signal: AbortSignal.timeout(20000) });
          if (!r.ok) throw new Error("http_" + r.status);
          const j = await r.json();
          const arr = Array.isArray(j) ? j : (j?.transactions ?? j?.data ?? []);
          if (!Array.isArray(arr)) throw new Error("no_array: keys=" + Object.keys(j || {}).join(","));
          return arr.length;
        }),
      },
    }),
  },
});



Object.assign(COLLECTORS, {
  "eu-open-data": {
    config: { metric: "total_datasets", threshold_pct: 0.1, threshold_abs: 1000, window: "24h", ttl: 86400, context_keys: [] },
    collectAll: async () => ({
      sources: {
        total_datasets: await fetchSafe(async () => {
          const r = await fetch("https://data.europa.eu/api/hub/search/search?limit=1",
            { headers: { "user-agent": "VolatiAI/1.0", "accept": "application/json" }, signal: AbortSignal.timeout(20000) });
          if (!r.ok) throw new Error("http_" + r.status);
          const j = await r.json();
          const n = j?.result?.count;
          if (typeof n !== "number") throw new Error("no_count: keys=" + Object.keys(j?.result || {}).join(","));
          return n;
        }),
      },
    }),
  },
  "ted-tenders": {
    config: { metric: "notices_7d", threshold_pct: 10, threshold_abs: 100, window: "24h", ttl: 3600, context_keys: [] },
    collectAll: async () => ({
      sources: {
        notices_7d: await fetchSafe(async () => {
          const d7 = new Date(Date.now() - 7*864e5);
          const pd = d7.getUTCFullYear() + String(d7.getUTCMonth()+1).padStart(2,"0") + String(d7.getUTCDate()).padStart(2,"0");
          const r = await fetch("https://api.ted.europa.eu/v3/notices/search", {
            method: "POST",
            headers: { "content-type": "application/json", "user-agent": "VolatiAI/1.0" },
            body: JSON.stringify({ query: "PD>=" + pd, limit: 1, scope: "ALL" }),
            signal: AbortSignal.timeout(25000),
          });
          if (!r.ok) throw new Error("http_" + r.status);
          const j = await r.json();
          const n = j?.totalNoticeCount;
          if (typeof n !== "number") throw new Error("no_count: keys=" + Object.keys(j || {}).join(","));
          return n;
        }),
      },
    }),
  },
  "eu-legal-acts": {
    config: { metric: "acts_30d", threshold_pct: 20, threshold_abs: 50, window: "24h", ttl: 3600, context_keys: [] },
    collectAll: async () => ({
      sources: {
        acts_30d: await fetchSafe(async () => {
          const d30 = new Date(Date.now() - 30*864e5).toISOString().slice(0, 10);
          const q = "PREFIX cdm: <http://publications.europa.eu/ontology/cdm#> "
                  + "SELECT (COUNT(?w) AS ?c) WHERE { "
                  + "?w a cdm:work ; cdm:work_date_document ?d . "
                  + "FILTER(?d >= \"" + d30 + "\"^^xsd:date) }";
          const url = "https://publications.europa.eu/webapi/rdf/sparql?format=application%2Fsparql-results%2Bjson&query="
                    + encodeURIComponent(q);
          const r = await fetch(url, {
            headers: { "user-agent": "VolatiAI/1.0", "accept": "application/sparql-results+json" },
            signal: AbortSignal.timeout(25000),
          });
          if (!r.ok) throw new Error("http_" + r.status);
          const j = await r.json();
          const v = j?.results?.bindings?.[0]?.c?.value;
          if (v == null) throw new Error("no_count: keys=" + Object.keys(j?.results || {}).join(","));
          return parseInt(v, 10);
        }),
      },
    }),
  },
  "eurostat-hicp": {
    config: { metric: "eu_hicp_pct", threshold_pct: 2, threshold_abs: 0.05, window: "24h", ttl: 86400, context_keys: [] },
    collectAll: async () => ({
      sources: {
        eu_hicp_pct: await fetchSafe(async () => {
          const url = "https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/prc_hicp_manr"
                    + "?geo=EU27_2020&coicop=CP00&lastTimePeriod=1";
          const r = await fetch(url,
            { headers: { "user-agent": "VolatiAI/1.0", "accept": "application/json" }, signal: AbortSignal.timeout(20000) });
          if (!r.ok) throw new Error("http_" + r.status);
          const j = await r.json();
          const vals = j?.value;
          if (!vals || typeof vals !== "object") throw new Error("no_value: keys=" + Object.keys(j || {}).join(","));
          const arr = Object.values(vals);
          if (!arr.length) throw new Error("empty_value");
          const v = arr[arr.length - 1];
          if (typeof v !== "number") throw new Error("bad_value: " + String(v));
          return v;
        }),
      },
    }),
  },
});


export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const parts = url.pathname.split("/").filter(Boolean);

    if (parts.length === 0) {
      return json({ ok: true, density: "dense", sectors: Object.keys(COLLECTORS) });
    }

    const sectorName = parts[0];
    const action = parts[1] || "signal";
    const collector = COLLECTORS[sectorName];

    if (!collector) return json({ error: "unknown sector", sector: sectorName }, 404);

    if (action === "health") {
      return json({ ok: true, sector: sectorName, density: "dense" });
    }

    if (action === "raw") {
      return json(await collector.collectAll(env));
    }

    if (action === "signal") {
      let stage = "start";
      try {
        stage = "collectAll";
        const result = await collector.collectAll(env);
        const config = collector.config;
        if (!config) {
          return json({ error: "no config", sector: sectorName }, 500);
        }
        if (!config.metric) {
          return json({ error: "no config.metric", sector: sectorName, config_keys: Object.keys(config) }, 500);
        }
        stage = "kv_read";
        const kvKey = sectorName + "_" + config.metric;
        const prevStr = await env.SECTOR_KV.get(kvKey);
        const prev = prevStr ? parseFloat(prevStr) : null;
        stage = "buildValueEnvelope";
        const envelope = buildValueEnvelope(sectorName, config, result, prev);
        stage = "kv_write";
        const current = result.sources[config.metric]?.ok ? result.sources[config.metric].data : null;
        // Only write if value actually changed — saves ~99% of KV writes
        if (current !== null && current !== undefined && String(current) !== prevStr) {
          try {
            await env.SECTOR_KV.put(kvKey, String(current), { expirationTtl: config.ttl || 3600 });
          } catch (kvErr) {
            // Log but don't fail the request — KV quota exhausted
            console.log("KV put failed:", String(kvErr));
          }
        }
        return json(envelope);
      } catch (e) {
        return json({
          error: "signal_failed",
          stage: stage,
          sector: sectorName,
          message: String(e),
          stack: String((e && e.stack) || "").slice(0, 600)
        }, 500);
      }
    }

    return json({ error: "not found" }, 404);
  },
};
