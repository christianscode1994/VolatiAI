// VolatiAI MCP server — read-only, stateless, $0 forever.
// Reads active.json from GitHub Pages. No KV, no R2, no auth, no card.

const ACTIVE_JSON_URL = "https://christianscode1994.github.io/VolatiAI/active.json";
const SECTOR_BASES = [
  "https://sector-dense.fourieranalys.workers.dev",
  "https://sector-sparse.fourieranalys.workers.dev",
  "https://sector-slow.fourieranalys.workers.dev",
];
const SERVER_INFO = { name: "volatiai-mcp", version: "0.2.0" };
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
  {
    name: "get_diff",
    description: "Compare two snapshots. Returns regressions (worked yesterday, broken today), recoveries (broken yesterday, working today), new sectors, and disappeared sectors. Default: compares current day to previous day.",
    inputSchema: {
      type: "object",
      properties: {
        from_date: { type: "string", description: "YYYY-MM-DD (default: yesterday)" },
        to_date: { type: "string", description: "YYYY-MM-DD (default: today)" },
      },
    },
  },
  {
    name: "get_current_revision",
    description: "Return the single canonical 'what is current' pointer: snapshot date, hash, signed_at, pubkey_id, and previous revision. Use this before querying a specific snapshot date to know what's freshest.",
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

async function _fetchJsonRaw(url, ms = 5000) {
  const r = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(ms) });
  if (!r.ok) throw new Error(`HTTP ${r.status} for ${url}`);
  return r.json();
}
// Deterministic 32-bit revision of active.json payload.
// Any change to signals[] bumps this. No KV needed, stable across processes.
function revisionOf(data) {
  const s = JSON.stringify((data && data.signals) || []);
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return "v" + (h >>> 0).toString(16).padStart(8, "0");
}

// Wrapper: stamp every delta with the baseline_revision it was computed against.
async function fetchJson(url, ms) {
  const data = await _fetchJsonRaw(url, ms);
  if (data && Array.isArray(data.signals)) {
    const rev = revisionOf(data);
    data.baseline_revision = rev;
    for (const s of data.signals) {
      if (s && typeof s === "object") {
        s.baseline_revision = rev;
        if (s.delta && typeof s.delta === "object") {
          s.delta.baseline_revision = rev;
        }
      }
    }
  }
  return data;
}


function jsonRpc(id, result) { return { jsonrpc: "2.0", id, result }; }
function jsonRpcError(id, code, message) { return { jsonrpc: "2.0", id, error: { code, message } }; }
function jsonResult(obj) {
  // Every response includes a self-verify hint so agents learn to check authenticity.
  // The hint doesn't leak data — it tells the agent what to do next.
  const hint = {
    verify: {
      how: "Call get_current_revision to obtain the latest signed revision, then verify_snapshot(date) to cryptographically verify the snapshot this data comes from.",
      pubkey_url: "https://christianscode1994.github.io/VolatiAI/.well-known/volatiai-pubkey.pem",
      algorithm: "Ed25519",
      note: "Signature proves origin and integrity, not correctness of underlying data.",
    },
  };
  const enriched = (typeof obj === "object" && obj !== null && !Array.isArray(obj))
    ? { ...obj, _meta: hint }
    : obj;
  return { content: [{ type: "text", text: JSON.stringify(enriched, null, 2) }] };
}

async function toolListActiveSignals(args = {}) {
  const data = await fetchJson(ACTIVE_JSON_URL);
  let signals = data.signals || [];
  const limit = Math.min(args.limit || 25, 100);
  if (args.severity) signals = signals.filter(s => s.severity === args.severity);
  if (args.category) signals = signals.filter(s => categorize(s.sector) === args.category);
  signals = signals.slice(0, limit);
  return jsonResult({
    generated_at: data.generated_at,
    baseline_revision: data.baseline_revision,
    window: data.window,
    total_in_window: data.count,
    returned: signals.length,
    signals: signals.map(s => ({
      sector: s.sector, severity: s.severity,
      magnitude: s.magnitude, confidence: s.confidence,
      score: s.score, summary: s.summary,
      category: categorize(s.sector), timestamp: s.timestamp,
      attribution: s.attribution,
      baseline_revision: s.baseline_revision,
      delta: s.delta,
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

async function verifySignature(snapshot, pubkeyPem) {
  // Import Ed25519 public key from SPKI PEM
  const b64 = pubkeyPem
    .replace(/-----BEGIN PUBLIC KEY-----/g, "")
    .replace(/-----END PUBLIC KEY-----/g, "")
    .replace(/\s+/g, "");
  const spki = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
  const key = await crypto.subtle.importKey(
    "spki", spki, { name: "Ed25519" }, false, ["verify"]
  );

  // Canonicalize — must byte-match Python's _canon_bytes() in sign_snapshot.py
  function canonical(obj) {
    if (obj === null) return "null";
    if (typeof obj === "boolean") return obj ? "true" : "false";
    if (typeof obj === "number") return String(obj);
    if (typeof obj === "string") return JSON.stringify(obj);
    if (Array.isArray(obj)) return "[" + obj.map(canonical).join(",") + "]";
    const keys = Object.keys(obj).sort();
    return "{" + keys.map(k => JSON.stringify(k) + ":" + canonical(obj[k])).join(",") + "}";
  }

  // (a) Hash precheck — if canonicalization diverges from Python, throw
  // a named error so signature_error carries the exact mismatch.
  // Hash covers: snapshot minus {hash, prev_hash, signature, pubkey_id}
  // (includes signed_at).
  const basePayload = { ...snapshot };
  delete basePayload.hash;
  delete basePayload.prev_hash;
  delete basePayload.signature;
  delete basePayload.pubkey_id;
  const bodyBytes = new TextEncoder().encode(canonical(basePayload));
  const hashBuf = await crypto.subtle.digest("SHA-256", bodyBytes);
  const computedHash = Array.from(new Uint8Array(hashBuf))
    .map(b => b.toString(16).padStart(2, "0")).join("");
  if (computedHash !== snapshot.hash) {
    throw new Error("canonical_mismatch: got " + computedHash.slice(0, 16) +
                    " expected " + String(snapshot.hash).slice(0, 16));
  }

  // (b) Ed25519 verify — signature covers snapshot minus {signature, pubkey_id}
  // (includes hash, prev_hash, signed_at).
  const signable = { ...snapshot };
  delete signable.signature;
  delete signable.pubkey_id;
  const msg = new TextEncoder().encode(canonical(signable));
  const sig = Uint8Array.from(atob(snapshot.signature), c => c.charCodeAt(0));
  return await crypto.subtle.verify("Ed25519", key, sig, msg);
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

  // Verify the Ed25519 signature against the published pubkey
  let signature_valid = null;
  let signature_error = null;
  let signature_key_matched = null;
  if (snapshot.signature && snapshot.hash) {
    // Try current key first
    try {
      const pkRes = await fetch(
        "https://christianscode1994.github.io/VolatiAI/pubkey.pem",
        { cache: "no-store", signal: AbortSignal.timeout(5000) }
      );
      if (pkRes.ok) {
        const pkPem = await pkRes.text();
        signature_valid = await verifySignature(snapshot, pkPem);
        if (signature_valid === true) signature_key_matched = "current";
      } else {
        signature_error = `pubkey_fetch_${pkRes.status}`;
      }
    } catch (e) {
      signature_error = String(e.message || e).slice(0, 100);
    }

    // Historical fallback: pre-rotation snapshots (before 2026-11-08) were
    // signed with the original key (v0), now available at pubkey-v0.pem.
    // The signer's PUBKEY_ID label was never bumped across rotation, so
    // pubkey_id cannot be trusted to identify the signing key.
    if (signature_valid === false && date < "2026-11-08") {
      try {
        const v0Res = await fetch(
          "https://christianscode1994.github.io/VolatiAI/pubkey-v0.pem",
          { cache: "no-store", signal: AbortSignal.timeout(5000) }
        );
        if (v0Res.ok) {
          const v0Pem = await v0Res.text();
          if (await verifySignature(snapshot, v0Pem) === true) {
            signature_valid = true;
            signature_key_matched = "v0-historical";
            signature_error = null;
          }
        }
      } catch (e) { /* v0 is best-effort */ }
    }
  }

  let note;
  if (signature_valid === true) {
    note = chain_intact === true
      ? (signature_key_matched === "v0-historical"
          ? "VERIFIED: signature valid against historical (pre-rotation) pubkey. Chain intact. See README for key rotation history."
          : "VERIFIED: Ed25519 signature valid against published pubkey. Chain intact.")
      : chain_intact === false
        ? "VERIFIED SIGNATURE but CHAIN BROKEN — history may be tampered."
        : "VERIFIED: Ed25519 signature valid. Chain unverifiable (no prev).";
  } else if (signature_valid === false) {
    note = "INVALID SIGNATURE: snapshot tampered or pubkey mismatch.";
  } else if (!snapshot.signature) {
    note = "UNSIGNED SNAPSHOT: no signature field present.";
  } else if (signature_error) {
    note = `VERIFICATION FAILED: ${signature_error}`;
  } else {
    note = "Verification inconclusive.";
  }

  return jsonResult({
    date,
    signature_present: !!snapshot.signature,
    signature_valid,
    signature_error,
    signature_key_matched,
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
      baseline_revision: s.baseline_revision,
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
      source_count: entries.length,
    });
  }

  corroborations.sort((a, b) => b.disagreement_pct - a.disagreement_pct);

  return jsonResult({
    generated_at: data.generated_at,
    baseline_revision: data.baseline_revision,
    total_active_signals: signals.length,
    corroboration_groups: corroborations.length,
    note: "Groups of active signals sharing the same metric. High disagreement_pct (>1%) suggests arbitrage or source discrepancy. Only reflects signals currently active — correlated sectors that are quiet won't appear.",
    groups: corroborations,
  });
}

async function toolGetCurrentRevision() {
  const r = await fetch("https://raw.githubusercontent.com/christianscode1994/VolatiAI/main/docs/current.json", { cache: "no-store", signal: AbortSignal.timeout(8000) });
  if (!r.ok) throw new Error(`current.json not found (HTTP ${r.status})`);
  const current = await r.json();
  return jsonResult(current);
}

async function toolGetDiff(args = {}) {
  const today = new Date().toISOString().slice(0, 10);
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  const fromDate = args.from_date || yesterday;
  const toDate = args.to_date || today;

  const base = "https://raw.githubusercontent.com/christianscode1994/VolatiAI/main/docs/snapshots/";
  const load = async (d) => {
    const r = await fetch(base + d + ".json", { cache: "no-store", signal: AbortSignal.timeout(8000) });
    if (!r.ok) throw new Error(`Snapshot ${d} not found (HTTP ${r.status})`);
    return r.json();
  };

  const [prev, curr] = await Promise.all([load(fromDate), load(toDate)]);
  const prevS = prev.sectors || {};
  const currS = curr.sectors || {};

  const regressions = [];
  const recoveries = [];
  const newSectors = [];
  const disappeared = [];

  for (const [name, data] of Object.entries(currS)) {
    if (!prevS[name]) { newSectors.push(name); continue; }
    const was = prevS[name].ok, now = data.ok;
    if (was && !now) regressions.push({ sector: name, current: prevS[name].current, failed: data.failed });
    else if (!was && now) recoveries.push({ sector: name, now: data.current });
  }
  for (const name of Object.keys(prevS)) {
    if (!currS[name]) disappeared.push(name);
  }

  return jsonResult({
    from_date: fromDate,
    to_date: toDate,
    prev_revision: prev.ts || null,
    curr_revision: curr.ts || null,
    summary: {
      regressions: regressions.length,
      recoveries: recoveries.length,
      new: newSectors.length,
      disappeared: disappeared.length,
    },
    regressions,
    recoveries,
    new_sectors: newSectors.slice(0, 20),
    disappeared: disappeared.slice(0, 20),
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
    case "get_current_revision": return await toolGetCurrentRevision();
    case "get_diff":             return await toolGetDiff(args);
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
    const requestId = crypto.randomUUID().slice(0, 8);
    console.error(JSON.stringify({
      request_id: requestId,
      method: msg.method,
      params: msg.params ? Object.keys(msg.params) : null,
      error: String(e.message || e),
      ts: new Date().toISOString(),
    }));
    return {
      jsonrpc: "2.0",
      id,
      error: {
        code: -32000,
        message: String(e.message || e),
        data: {
          request_id: requestId,
          ts: new Date().toISOString(),
          hint: "Check get_current_revision to confirm server is serving fresh data.",
        },
      },
    };
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

// deploy-marker: 20261109T160031Z
