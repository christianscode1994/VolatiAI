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
  const severity = Math.abs(pct) >= tp * 3 ? "alert" : "notice";

  const context = {};
  for (const key of (config.context_keys || [])) {
    if (sources[key]?.ok) context[key] = sources[key].data;
  }

  return {
    sector, density: "dense",
    has_signal: hasSignal,
    severity: hasSignal ? severity : "info",
    confidence: healthy / Math.max(total, 1),
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
    config: { metric: "pm25", threshold_pct: 20.0, threshold_abs: 5.0, window: "24h", ttl: 3600, context_keys: ["no2"] },
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
          const r = await fetch("https://pro-api.coinmarketcap.com/public-api/v1/global-metrics/quotes/latest?convert=USD");
          if (!r.ok) throw new Error("status " + r.status);
          const j = await r.json();
          return Math.round(j.data.quote.USD.total_market_cap);
        }),
        btc_dominance: await fetchSafe(async () => {
          const r = await fetch("https://pro-api.coinmarketcap.com/public-api/v1/global-metrics/quotes/latest?convert=USD");
          const j = await r.json();
          return Math.round(j.data.btc_dominance * 100) / 100;
        }),
        eth_dominance: await fetchSafe(async () => {
          const r = await fetch("https://pro-api.coinmarketcap.com/public-api/v1/global-metrics/quotes/latest?convert=USD");
          const j = await r.json();
          return Math.round(j.data.eth_dominance * 100) / 100;
        }),
      },
    }),
  },

  "altcoin-season": {
    config: { metric: "altcoin_index", threshold_pct: 10.0, threshold_abs: 5, window: "24h", ttl: 3600, context_keys: [] },
    collectAll: async (env) => ({
      sources: {
        altcoin_index: await fetchSafe(async () => {
          const r = await fetch("https://pro-api.coinmarketcap.com/public-api/v1/altcoin-season-index/latest");
          if (!r.ok) throw new Error("status " + r.status);
          const j = await r.json();
          return j.data.altcoin_index;
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

};

// ─── ROUTER ─────────────────────────────────────────────────

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
