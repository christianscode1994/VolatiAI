const SECTOR = "blockchain";

const RPC_URLS = [
  "https://nullrpc.dev/eth",
  "https://rpcfree.com/ethereum-rpc",
  "https://eth.blockrazor.xyz",
  "https://ethereum-rpc.publicnode.com"
];

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
    ttl_seconds: 300,
  }), { headers: { "content-type": "application/json" } });
}

async function fetchSafe(fn) {
  try { return { ok: true, data: await fn() }; }
  catch (e) { return { ok: false, error: String(e).slice(0, 120) }; }
}

async function fetchBlockFromAnyRPC() {
  let lastError = "no RPC attempted";
  for (const url of RPC_URLS) {
    try {
      const r = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", method: "eth_blockNumber", params: [], id: 1 }),
      });
      const text = await r.text();
      let j;
      try { j = JSON.parse(text); }
      catch (e) { lastError = `non-json status=${r.status} from ${url}`; continue; }
      if (j.error) { lastError = `rpc error from ${url}: ${JSON.stringify(j.error).slice(0, 80)}`; continue; }
      if (!j.result) { lastError = `no result from ${url}`; continue; }
      return { block: parseInt(j.result, 16), source_url: url };
    } catch (e) {
      lastError = `${url}: ${String(e).slice(0, 80)}`;
    }
  }
  throw new Error(lastError);
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

    const gas = result.sources.gas.ok ? result.sources.gas.data : null;
    let previous = null;
    let pct = 0;
    if (gas !== null) {
      previous = await env.SECTOR_KV.get("gas_price");
      if (previous) pct = ((gas - parseFloat(previous)) / parseFloat(previous)) * 100;
      await env.SECTOR_KV.put("gas_price", String(gas), { expirationTtl: 86400 });
    }

    const prevNum = previous ? parseFloat(previous) : gas;
    const absChange = Math.abs(gas - prevNum);
    const MIN_ABS_GWEI = 3;
    const hasSignal = Math.abs(pct) > 20 && absChange >= MIN_ABS_GWEI;
    const sev = Math.abs(pct) > 100 && absChange > 10 ? "alert"
              : hasSignal ? "notice"
              : "info";
    return envelope({
      has_signal: hasSignal,
      severity: sev,
      summary: hasSignal
        ? `Gas ${pct > 0 ? "+" : ""}${pct.toFixed(0)}% (${gas} gwei, ${absChange.toFixed(1)} Δ)`
        : "quiet",
      delta: gas !== null
        ? { metric: "gas_price", current: gas, previous: previous ? parseFloat(previous) : null, pct_change: pct, window: "24h" }
        : null,
      context: {
        eth_block: result.sources.block.ok ? result.sources.block.data.block : null,
        rpc_used: result.sources.block.ok ? result.sources.block.data.source_url : null,
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
      gas: await fetchSafe(async () => {
        let lastError = "no RPC attempted";
        for (const url of RPC_URLS) {
          try {
            const r = await fetch(url, {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ jsonrpc: "2.0", method: "eth_gasPrice", params: [], id: 1 }),
            });
            const text = await r.text();
            let j;
            try { j = JSON.parse(text); }
            catch (e) { lastError = `non-json from ${url}`; continue; }
            if (j.error) { lastError = `rpc error from ${url}`; continue; }
            if (!j.result) { lastError = `no result from ${url}`; continue; }
            const wei = BigInt(j.result);
            const gwei = Number(wei) / 1e9;
            return Math.round(gwei * 100) / 100;
          } catch (e) {
            lastError = `${url}: ${String(e).slice(0, 80)}`;
          }
        }
        throw new Error(lastError);
      }),
      block: await fetchSafe(fetchBlockFromAnyRPC),
      polkadot: await fetchSafe(async () => {
        const r = await fetch("https://rpc.polkadot.io", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            jsonrpc: "2.0",
            method: "chain_getHeader",
            params: [],
            id: 1,
          }),
        });
        const j = await r.json();
        if (j.error) throw new Error(`rpc error: ${JSON.stringify(j.error).slice(0, 80)}`);
        if (!j.result || !j.result.number) throw new Error("no block number");
        return parseInt(j.result.number, 16);
      }),
    },
  };
}
