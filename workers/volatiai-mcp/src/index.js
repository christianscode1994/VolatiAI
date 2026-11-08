// VolatiAI MCP server — read-only, stateless, $0 forever.
// Reads active.json from GitHub Pages. No KV, no R2, no auth, no card.

const ACTIVE_JSON_URL = "https://christianscode1994.github.io/VolatiAI/active.json";
const SECTOR_BASES = [
  "https://sector-dense.fourieranalys.workers.dev",
  "https://sector-sparse.fourieranalys.workers.dev",
  "https://sector-slow.fourieranalys.workers.dev",
];
const SERVER_INFO = { name: "volatiai-mcp", version: "0.1.0" };
const PROTOCOL_VERSION = "2025-06-18";

const TOOLS = [
  {
    name: "list_active_signals",
    description: "List ranked active signals from VolatiAI (severity x confidence x magnitude x novelty). Filter by severity or category.",
    inputSchema: {
      type: "object",
      properties: {
        limit: { type: "integer", minimum: 1, maximum: 100, default: 25 },
        severity: { type: "string", enum: ["info", "notice", "warning", "alert", "critical"] },
        category: { type: "string", description: "Security, Crypto, Environment, Tech, Markets, Health, Governance, or Other" },
      },
    },
  },
  {
    name: "get_sector",
    description: "Get current data for one sector. Sector slugs from list_active_signals output.",
    inputSchema: {
      type: "object",
      properties: { sector: { type: "string", description: "e.g. nvd-new-cves-count, kraken-btc-usd" } },
      required: ["sector"],
    },
  },
  {
    name: "list_categories",
    description: "List signal categories with counts.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "verify_snapshot",
    description: "Verify a VolatiAI snapshot's chain integrity and return its signature fields for independent verification. Use this to prove the data hasn't been tampered with.",
    inputSchema: {
      type: "object",
      properties: { date: { type: "string", description: "YYYY-MM-DD snapshot date" } },
      required: ["date"],
    },
  },
  {
    name: "find_corroborations",
    description: "Find groups of active signals measuring the same metric (e.g. BTC price from multiple exchanges). High disagreement_pct (>1%) suggests arbitrage or a data-source discrepancy.",
    inputSchema: { type: "object", properties: {} },
  },
];

function categorize(sector) {
  const s = (sector || "").toLowerCase();
  const map = [
    ["Security", ["nvd-", "cisa-", "phishunt", "tweetfeed", "cve-", "osv-", "cyber-", "security"]],
    ["Crypto", ["kraken-", "defi-", "stablecoin", "dex-", "coinrithm", "blockchain", "cryptocurrency", "web3-", "nft", "gemini-"]],
    ["Environment", ["uk-carbon", "energinet", "nws-", "usgs-", "noaa-", "gdacs", "nasa-eonet", "nature-", "obis-", "climate-", "weather", "wttr-", "7timer-"]],
    ["Tech", ["hackernews-", "pypi-", "npm-", "github-", "open-digger", "devto-", "mastodon-", "bluesky-", "huggingface-"]],
    ["Markets", ["treasur", "fed-", "fred-", "frankfurter", "exchange-rate", "policy-", "eurostat", "eia-", "worldbank", "fhfa", "dbnomics"]],
    ["Health", ["pubmed", "europepmc", "corona", "disease", "openfda", "cdc-", "who-", "clinicaltrials"]],
    ["Governance", ["ballotwatch", "un-", "swiss-", "eu-", "micar", "regulatory", "courtlistener", "poligraph", "laws"]],
  ];
  for (const [label, prefixes] of map) {
    if (prefixes.some(p => s.startsWith(p) || p.includes(s))) return label;
  }
  return "Other";
}

async function fetchJson(url, ms = 5000) {
  const r = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(ms) });
  if (!r.ok) throw new Error(`HTTP ${r.status} for ${url}`);
  return r.json();
}

function jsonRpc(id, result) { return { jsonrpc: "2.0", id, result }; }
function jsonRpcError(id, code, message) { return { jsonrpc: "2.0", id, error: { code, message } }; }
function jsonResult(obj) { return { content: [{ type: "text", text: JSON.stringify(obj, null, 2) }] }; }

async function toolListActiveSignals(args = {}) {
  const data = await fetchJson(ACTIVE_JSON_URL);
  let signals = data.signals || [];
  const limit = Math.min(args.limit || 25, 100);
  if (args.severity) signals = signals.filter(s => s.severity === args.severity);
  if (args.category) signals = signals.filter(s => categorize(s.sector) === args.category);
  signals = signals.slice(0, limit);
  return jsonResult({
    generated_at: data.generated_at,
    window: data.window,
    total_in_window: data.count,
    returned: signals.length,
    signals: signals.map(s => ({
      sector: s.sector, severity: s.severity,
      magnitude: s.magnitude, confidence: s.confidence,
      score: s.score, summary: s.summary,
      category: categorize(s.sector), timestamp: s.timestamp,
      attribution: s.attribution,
    })),
  });
}

async function toolGetSector(args = {}) {
  const sector = (args.sector || "").trim();
  if (!sector) throw new Error("sector is required");
  for (const base of SECTOR_BASES) {
    try {
      const r = await fetch(`${base}/${sector}`, { cache: "no-store", signal: AbortSignal.timeout(5000) });
      if (!r.ok) continue;
      const data = await r.json();
      if (data && data.sector) return jsonResult(data);
    } catch (e) { /* try next worker */ }
  }
  throw new Error(`Sector '${sector}' not found on any worker`);
}

async function toolListCategories() {
  const data = await fetchJson(ACTIVE_JSON_URL);
  const counts = {};
  for (const s of (data.signals || [])) {
    const cat = categorize(s.sector);
    counts[cat] = (counts[cat] || 0) + 1;
  }
  return jsonResult({
    generated_at: data.generated_at,
    total_signals: (data.signals || []).length,
    categories: counts,
  });
}

async function toolVerifySnapshot(args = {}) {
  const date = String(args.date || "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error("date must be YYYY-MM-DD");

  const snapshotUrl = `https://christianscode1994.github.io/VolatiAI/snapshots/${date}.json`;
  const r = await fetch(snapshotUrl, { cache: "no-store", signal: AbortSignal.timeout(8000) });
  if (!r.ok) throw new Error(`Snapshot ${date} not found (HTTP ${r.status})`);
  const snapshot = await r.json();

  const prevDate = new Date(date + "T00:00:00Z");
  prevDate.setUTCDate(prevDate.getUTCDate() - 1);
  const prevDateStr = prevDate.toISOString().slice(0, 10);

  let prevSnapshot = null;
  let chain_intact = null;
  try {
    const pr = await fetch(
      `https://christianscode1994.github.io/VolatiAI/snapshots/${prevDateStr}.json`,
      { cache: "no-store", signal: AbortSignal.timeout(8000) }
    );
    if (pr.ok) {
      prevSnapshot = await pr.json();
      // Only compare hashes when BOTH snapshots are signed.
      // null === null would incorrectly report "intact".
      chain_intact = (snapshot.hash && prevSnapshot.hash)
        ? (snapshot.prev_hash === prevSnapshot.hash)
        : null;
    }
  } catch (e) {
    chain_intact = null;
  }

  let note;
  if (!snapshot.signature && !snapshot.hash) {
    note = "UNSIGNED SNAPSHOT: this file has no signature fields. Signing is not yet enabled in the publishing workflow.";
  } else if (chain_intact === true) {
    note = "Chain verified: prev_hash matches previous day's hash.";
  } else if (chain_intact === false) {
    note = "CHAIN BROKEN: prev_hash does not match. History may be tampered.";
  } else {
    note = "Signature present but previous day's snapshot unavailable. Signature can be verified independently against published pubkey.";
  }

  return jsonResult({
    date,
    signature_present: !!snapshot.signature,
    hash: snapshot.hash || null,
    prev_hash: snapshot.prev_hash || null,
    pubkey_id: snapshot.pubkey_id || null,
    signed_at: snapshot.signed_at || null,
    chain_intact,
    verified_against_date: prevSnapshot ? prevDateStr : null,
    snapshot_url: snapshotUrl,
    note,
  });
}

async function toolFindCorroborations() {
  const data = await fetchJson(ACTIVE_JSON_URL);
  const signals = data.signals || [];

  const groups = {};
  for (const s of signals) {
    const d = s.delta || {};
    const metric = d.metric;
    if (!metric) continue;
    (groups[metric] = groups[metric] || []).push({
      sector: s.sector,
      current: d.current,
      pct_change: d.pct_change,
      severity: s.severity,
      confidence: s.confidence,
    });
  }

  const corroborations = [];
  for (const [metric, entries] of Object.entries(groups)) {
    if (entries.length < 2) continue;
    const values = entries.map(e => e.current).filter(v => typeof v === "number");
    if (values.length < 2) continue;
    const min = Math.min(...values);
    const max = Math.max(...values);
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const disagreement_pct = mean !== 0 ? Math.abs(max - min) / Math.abs(mean) * 100 : 0;
    corroborations.push({
      metric,
      sources: entries,
      values_min: min,
      values_max: max,
      values_mean: Number(mean.toFixed(4)),
      disagreement_pct: Number(disagreement_pct.toFixed(3)),
    });
  }

  corroborations.sort((a, b) => b.disagreement_pct - a.disagreement_pct);

  return jsonResult({
    generated_at: data.generated_at,
    total_active_signals: signals.length,
    corroboration_groups: corroborations.length,
    note: "Groups of active signals sharing the same metric. High disagreement_pct (>1%) suggests arbitrage or source discrepancy. Only reflects signals currently active — correlated sectors that are quiet won't appear.",
    groups: corroborations,
  });
}

async function handleToolsCall(params = {}) {
  const name = params.name;
  const args = params.arguments || {};
  switch (name) {
    case "list_active_signals":  return await toolListActiveSignals(args);
    case "get_sector":            return await toolGetSector(args);
    case "list_categories":       return await toolListCategories();
    case "verify_snapshot":       return await toolVerifySnapshot(args);
    case "find_corroborations":   return await toolFindCorroborations();
    default: throw new Error(`Unknown tool: ${name}`);
  }
}

async function handleRPC(msg) {
  const { id, method, params } = msg;
  try {
    switch (method) {
      case "initialize":
        return jsonRpc(id, {
          protocolVersion: PROTOCOL_VERSION,
          capabilities: { tools: {} },
          serverInfo: SERVER_INFO,
        });
      case "notifications/initialized":
        return null;
      case "tools/list":
        return jsonRpc(id, { tools: TOOLS });
      case "tools/call":
        return jsonRpc(id, await handleToolsCall(params));
      case "ping":
        return jsonRpc(id, {});
      default:
        return jsonRpcError(id, -32601, `Method not found: ${method}`);
    }
  } catch (e) {
    return jsonRpcError(id, -32000, String(e.message || e));
  }
}

export default {
  async fetch(req) {
    const url = new URL(req.url);
    const cors = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Accept",
    };

    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });

    if (url.pathname === "/" || url.pathname === "/health") {
      return new Response(JSON.stringify({
        name: "volatiai-mcp", status: "ok",
        protocol: PROTOCOL_VERSION,
        tools: TOOLS.map(t => t.name),
        docs: "https://christianscode1994.github.io/VolatiAI/",
      }), { headers: { "Content-Type": "application/json", ...cors } });
    }

    if (url.pathname === "/mcp") {
      if (req.method !== "POST") return new Response("MCP expects POST", { status: 405, headers: cors });
      let body;
      try { body = await req.json(); }
      catch { return new Response(JSON.stringify(jsonRpcError(null, -32700, "Parse error")), { status: 400, headers: { "Content-Type": "application/json", ...cors } }); }
      const messages = Array.isArray(body) ? body : [body];
      const responses = [];
      for (const msg of messages) {
        const resp = await handleRPC(msg);
        if (resp !== null) responses.push(resp);
      }
      const out = responses.length === 1 ? responses[0] : responses;
      return new Response(JSON.stringify(out), { headers: { "Content-Type": "application/json", ...cors } });
    }

    return new Response("Not found", { status: 404, headers: cors });
  },
};
