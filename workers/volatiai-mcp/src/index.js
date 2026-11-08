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

async function handleToolsCall(params = {}) {
  const name = params.name;
  const args = params.arguments || {};
  switch (name) {
    case "list_active_signals": return await toolListActiveSignals(args);
    case "get_sector":          return await toolGetSector(args);
    case "list_categories":     return await toolListCategories();
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
