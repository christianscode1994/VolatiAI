import { generateJwt } from '@coinbase/cdp-sdk/auth';
// VolatiAI MCP server — read-only, stateless, $0 forever.
// Reads active.json from GitHub Pages. No KV, no R2, no auth, no card.

import openapiSpec from "../openapi.json";
import {
  declareSIWxExtension,
  parseSIWxHeader,
  validateSIWxMessage,
  verifySIWxSignature,
} from '@x402/extensions/sign-in-with-x';


const ACTIVE_JSON_URL = "https://christianscode1994.github.io/VolatiAI/active.json";
const ACTIVE_WITH_TRUST_URL = "https://christianscode1994.github.io/VolatiAI/active_with_trust.json";
const SECTOR_BASES = [
  "https://sector-dense.fourieranalys.workers.dev",
  "https://sector-sparse.fourieranalys.workers.dev",
  "https://sector-slow.fourieranalys.workers.dev",];const SERVER_INFO = { name: "volatiai-mcp", version: "0.2.0" };
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
    inputSchema: { type: "object", properties: {
        envelope: {
          type: "object",
          description: "Optional inline envelope JSON. If provided, verified against the baked-in pubkey with zero network fetch. Response gains _verification.source = \"inline-baked\".",
        },
      } },
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
  {
    name: "get_anchor",
    description: "Return anchor-log status for a snapshot date: was an anchor entry recorded, what was the file SHA-256 at anchor time vs now, is a FreeTSA .tsr present. Detects post-hoc rewrites that signature verification alone cannot.",
    inputSchema: {
      type: "object",
      properties: {
        date: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$", description: "Snapshot date YYYY-MM-DD." },
      },
      required: ["date"],
    },
  },
  {
    name: "get_trust_manifest",
    description: "One-call discovery: returns all URLs, algorithms, tools, and the 4-step verification chain a consumer needs to independently verify VolatiAI data. No snapshot fetch. Use first to learn where everything lives.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "resolve_entity",
    description: "Resolve a slug, alias, or entity ID to a canonical VolatiAI entity. Returns the entity metadata, all sectors it appears in, external ID mappings (CoinGecko, Wikidata), and evidence links from the entity registry. Warnings flag metric incomparability (e.g. btc-exchange-spread and eth-exchange-spread share metric \"spread_pct\" but measure different assets — do NOT compare their values).",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Entity ID (e.g. \"bitcoin\"), alias (e.g. \"BTC\"), or sector slug (e.g. \"btc-exchange-spread\")" },
      },
      required: ["query"],
    },
  },
  {
    name: "get_snapshot",
    description: "Fetch a historical snapshot by date (YYYY-MM-DD). Returns signed snapshot, hash, and publication metadata. Use verify_snapshot to cryptographically verify integrity.",
    inputSchema: {
      type: "object",
      properties: {
        date: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$", description: "Snapshot date (YYYY-MM-DD)" },
      },
      required: ["date"],
    },
  },
  {
    name: "purchase",
    description: "Execute a paid tool by providing a valid x402 payment header. Returns the tool result and a signed receipt with transaction hash. Use this to purchase any paid tool in one atomic call.",
    inputSchema: {
      type: "object",
      properties: {
        tool_name: { type: "string", description: "Name of the paid tool to execute" },
        arguments: { type: "object", description: "Arguments for the tool" },
        x_payment: { type: "string", description: "Base64-encoded x402 payment header (X-PAYMENT)" },
      },
      required: ["tool_name", "arguments", "x_payment"],
    },
  },
  {
    name: "list_entities",
    description: "List all canonical entities in the VolatiAI entity registry. Use to discover what entities are known and which sectors map to them. Optional type filter (e.g. \"asset\", \"organization\", \"product\", \"game\").",
    inputSchema: {
      type: "object",
      properties: {
        type: { type: "string", description: "Optional filter: asset, organization, product, game, etc." },
      },
    },
  },
  {
    name: "explain_pricing",
    description: "Free. Returns full tool catalog with prices, network details (asset, payTo), and how to pay. Use before making any payment.",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "get_eth_balance",
    description: "Get ETH balance for a Base mainnet address. Returns balance_wei (string) and balance_eth (formatted).",
    inputSchema: {
      type: "object",
      properties: {
        address: { type: "string", description: "0x-prefixed 40-char hex address" },
      },
      required: ["address"],
    },
  },
  {
    name: "get_token_balance",
    description: "Get ERC-20 token balance on Base. decimals_assumed=6 (USDC-style). Use balance_raw for exact integer.",
    inputSchema: {
      type: "object",
      properties: {
        address: { type: "string", description: "Wallet address" },
        token: { type: "string", description: "Token contract (USDC: 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913)" },
      },
      required: ["address", "token"],
    },
  },
  {
    name: "get_block_number",
    description: "Latest Base mainnet block number.",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "get_gas_price",
    description: "Current Base mainnet gas price in Gwei.",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "get_wallet_nonce",
    description: "Transaction count (nonce) for a wallet address on Base mainnet.",
    inputSchema: {
      type: "object",
      properties: {
        address: { type: "string", description: "0x-prefixed 40-char hex address" },
      },
      required: ["address"],
    },
  },
  {
    name: "get_wallet_summary",
    description: "Composite read: returns ETH balance, USDC balance, nonce, latest block, and gas price for any wallet in ONE call (5 RPC reads executed in parallel). Replaces 5 separate tool calls — 5x faster, 5x cheaper than calling individual tools.",
    inputSchema: {
      type: "object",
      properties: {
        address: { type: "string", description: "0x-prefixed 40-char hex wallet address" },
      },
      required: ["address"],
    },
  },
  {
    name: "page_to_markdown",
    description: "Fetch any URL and return clean Markdown. Strips scripts, styles, and HTML tags; preserves headings, links, bold/italic, lists. Useful for reading docs, news, or competitor pages into an LLM context. Deterministic and stateless — no LLM, no API key. 15s timeout, 50KB default output cap.",
    inputSchema: {
      type: "object",
      properties: {
        url: { type: "string", description: "http:// or https:// URL to fetch" },
        max_length: { type: "integer", minimum: 1000, maximum: 200000, default: 50000, description: "Max characters to return (content truncated beyond this)" },
      },
      required: ["url"],
    },
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


// SIWX storage backed by the PAYMENT_REPLAY KV namespace.
// TTL 30 days. Implements SIWxStorage: { hasPaid, recordPayment }.
class KVSIWxStorage {
  constructor(kv) { this.kv = kv; }
  async hasPaid(resource, address) {
    if (!this.kv) return false;
    const v = await this.kv.get(`siwx:${resource}:${String(address).toLowerCase()}`);
    return !!v;
  }
  async recordPayment(resource, address) {
    if (!this.kv) return;
    const key = `siwx:${resource}:${String(address).toLowerCase()}`;
    // Skip write if record already exists — reads are free, writes count toward quota
    const existing = await this.kv.get(key);
    if (existing) return;
    await this.kv.put(key, "1", { expirationTtl: 60 * 60 * 24 * 30 });
  }
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
  // Prefer active_with_trust.json (has per-signal .trust). Fall back to
  // active.json if the trust step failed for any reason — this tool must
  // work even if scoring is broken.
  let data;
  let trust_available = false;
  try {
    data = await fetchJson(ACTIVE_WITH_TRUST_URL);
    trust_available = true;
  } catch (e) {
    data = await fetchJson(ACTIVE_JSON_URL);
  }
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
      why_ranked: s.why_ranked,
      trust: s.trust,
    })),
    trust_model: trust_available ? {
      version: 2,
      doc: "https://christianscode1994.github.io/VolatiAI/TRUST_MODEL.md",
      note: "trust.score measures weight-to-give-signal (0-1), not importance or correctness. See TRUST_MODEL.md for weights and limits.",
    } : undefined,
  });
}

async function toolGetSnapshot(args) {
  const { date } = args || {};
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error("date must be YYYY-MM-DD");
  const url = `https://christianscode1994.github.io/VolatiAI/snapshots/${date}.json`;
  const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error(`Snapshot ${date} not found (HTTP ${res.status})`);
  return await res.json();
}

async function toolPurchase(args, env) {
  const { tool_name, arguments: toolArgs, x_payment } = args || {};
  if (!tool_name || !x_payment) throw new Error("tool_name and x_payment required");
  const decoded = JSON.parse(Buffer.from(x_payment, "base64").toString("utf-8"));
  const sig = decoded.payload && decoded.payload.signature;
  if (!sig) throw new Error("Invalid payment payload: missing signature");
  const settleResp = await fetchWithRetry("https://api.cdp.coinbase.com/platform/v2/x402/settle", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      x402Version: 1,
      paymentPayload: { x402Version: 1, scheme: "exact", network: "base", payload: decoded.payload },
      paymentRequirements: {
        scheme: "exact", network: "base", maxAmountRequired: "10000",
        resource: "https://volatiai-mcp.fourieranalys.workers.dev/premium/mcp",
        description: "VolatiAI premium tool", mimeType: "application/json",
        payTo: "0x3EE508f75342315164301B2282f302DF3d3beD47",
        maxTimeoutSeconds: 60, asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
        extra: { name: "USD Coin", version: "2" },
      },
    }),
    signal: AbortSignal.timeout(30000),
  });
  const settleResult = await settleResp.json();
  if (!settleResult.success) throw new Error("Payment failed: " + (settleResult.errorReason || "unknown"));
  const result = await handleToolsCall({ name: tool_name, arguments: toolArgs }, env);
  return { success: true, transaction: settleResult.transaction, tool: tool_name, result };
}

async function toolGetSector(args = {}, env = {}) {
  const sector = (args.sector || "").trim();
  if (!sector) throw new Error("sector is required");
  // Debug sentinel: returns env diagnostics as a normal result (not an error,
  // so jsonRpcError doesn't strip the fields). Used to verify whether CF's
  // runtime is actually populating env.SECTOR_* bindings at fetch time.
  if (sector === "__debug_env__") {
    return jsonResult({
      sector: "__debug_env__",
      env_keys: Object.keys(env || {}),
      env_key_count: Object.keys(env || {}).length,
      has_sector_dense: "SECTOR_DENSE" in (env || {}),
      has_sector_sparse: "SECTOR_SPARSE" in (env || {}),
      has_sector_slow: "SECTOR_SLOW" in (env || {}),
      sector_dense_type: typeof (env || {}).SECTOR_DENSE,
      sector_dense_has_fetch: !!(env && env.SECTOR_DENSE && typeof env.SECTOR_DENSE.fetch === "function"),
    });
  }
  const SECTOR_BINDINGS = ["SECTOR_DENSE", "SECTOR_SPARSE", "SECTOR_SLOW"];
  const attempts = [];
  for (const name of SECTOR_BINDINGS) {
    const binding = env[name];
    if (!binding) {
      attempts.push({ binding: name, error: "binding_not_configured" });
      continue;
    }
    try {
      // Service binding: pass path only, or a Request — the target worker
      // sees the path as the request URL. A synthetic hostname like
      // https://internal/ sometimes causes fetch() to fail silently.
      // Service binding fetch requires an absolute URL. The binding
      // routes to the target worker regardless of hostname, but the URL
      // must parse as absolute. Use the real worker hostname (derived
      // from the binding name) so the target sees a coherent request URL.
      const workerHost = name.toLowerCase().replace("_", "-") + ".fourieranalys.workers.dev";
      const res = await binding.fetch("https://" + workerHost + "/" + sector, { method: "GET" });
      const text = await res.text();
      let body = null;
      try { body = JSON.parse(text); } catch (_) {}
      attempts.push({
        binding: name,
        status: res.status,
        ok: res.ok,
        content_type: res.headers.get("content-type") || "",
        body_preview: text.slice(0, 120),
        has_sector: !!(body && body.sector),
      });
      if (res.ok && body && body.sector) return jsonResult(body);
    } catch (e) {
      attempts.push({ binding: name, error: String(e.message || e).slice(0, 120) });
    }
  }
  console.log("[get_sector] failed. attempts:", JSON.stringify(attempts));
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
          } else {
            signature_error = "v0_signature_invalid";
          }
        } else {
          signature_error = "v0_pubkey_fetch_" + v0Res.status;
        }
      } catch (e) {
        signature_error = "v0_fetch_error: " + String(e.message || e).slice(0, 60);
      }
    }
  }

  // Revocation check: reject snapshots signed after their key was revoked.
  // Reads volatiai-key.json (current) or volatiai-key-v0.json (historical)
  // based on signature_key_matched. Fail-open: metadata fetch failure does
  // NOT block verification. If revoked_at is set AND signed_at > revoked_at,
  // snapshot is marked invalid regardless of signature correctness.
  if (signature_valid === true && snapshot.signed_at && signature_key_matched) {
    try {
      const keyFile = signature_key_matched === "v0-historical" ? "volatiai-key-v0.json" : "volatiai-key.json";
      const keyMetaUrl = "https://christianscode1994.github.io/VolatiAI/.well-known/" + keyFile;
      const keyMetaRes = await fetch(keyMetaUrl, { cache: "no-store", signal: AbortSignal.timeout(5000) });
      if (keyMetaRes.ok) {
        const keyMeta = await keyMetaRes.json();
        if (keyMeta.revoked_at) {
          const signedMs = new Date(snapshot.signed_at).getTime();
          const revokedMs = new Date(keyMeta.revoked_at).getTime();
          if (Number.isFinite(signedMs) && Number.isFinite(revokedMs) && signedMs > revokedMs) {
            signature_valid = false;
            signature_error = "key_revoked_at_" + keyMeta.revoked_at;
            signature_key_matched = null;
          }
        }
      }
    } catch (e) {
      // fail-open: transient metadata fetch failure should not invalidate all snapshots
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

  // Best-effort entities.json fetch for metric guard enforcement.
  // On failure, guards are silently skipped — the tool returns unfiltered
  // groups rather than erroring.
  let entityData = null;
  try {
    const entRes = await fetch(
      "https://christianscode1994.github.io/VolatiAI/entities.json",
      { cache: "no-store", signal: AbortSignal.timeout(5000) }
    );
    if (entRes.ok) entityData = await entRes.json();
  } catch (e) { /* guard enforcement disabled */ }

  const sectorToEntities = new Map();
  if (entityData && entityData.entities) {
    for (const [canonId, ent] of Object.entries(entityData.entities)) {
      for (const slug of (ent.sectors_expected || [])) {
        if (!sectorToEntities.has(slug)) sectorToEntities.set(slug, new Set());
        sectorToEntities.get(slug).add(canonId);
      }
    }
  }

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

  const metricGuards = (entityData && entityData.spread_metrics) || {};
  const corroborations = [];
  const suppressedGroups = [];

  for (const [metric, entries] of Object.entries(groups)) {
    if (entries.length < 2) continue;
    const guard = metricGuards[metric];
    if (guard && Array.isArray(guard.not_comparable_across)) {
      const entryEntities = entries.map(e => sectorToEntities.get(e.sector) || new Set());
      let suppressed = false;
      for (let i = 0; i < entries.length && !suppressed; i++) {
        for (let j = i + 1; j < entries.length && !suppressed; j++) {
          const ei = entryEntities[i], ej = entryEntities[j];
          let shared = false;
          for (const a of ei) if (ej.has(a)) { shared = true; break; }
          if (shared) continue;
          const eiGuarded = [...ei].some(a => guard.not_comparable_across.includes(a));
          const ejGuarded = [...ej].some(b => guard.not_comparable_across.includes(b));
          if (eiGuarded && ejGuarded) {
            suppressed = true;
            suppressedGroups.push({
              metric,
              reason: "not_comparable_across",
              sectors: entries.map(e => e.sector),
              example_pair: [entries[i].sector, entries[j].sector],
              guard_note: guard.example_of_wrong_grouping || guard.described_as,
            });
          }
        }
      }
      if (suppressed) continue;
    }
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
    suppressed_groups: suppressedGroups.length > 0 ? suppressedGroups : undefined,
    metric_guards_enforced: entityData !== null,
    note: "Groups of active signals sharing the same metric. Metric guards from entities.json are enforced — groups spanning incomparable entities are suppressed and listed in suppressed_groups.",
    groups: corroborations,
  });
}

async function toolGetAnchor(args = {}) {
  const date = String(args.date || "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error("date must be YYYY-MM-DD");

  const base = "https://christianscode1994.github.io/VolatiAI/snapshots/";

  const anchorsRes = await fetch(base + "_anchors.jsonl", { cache: "no-store", signal: AbortSignal.timeout(8000) });
  if (!anchorsRes.ok) throw new Error("_anchors.jsonl fetch failed (HTTP " + anchorsRes.status + ")");
  const anchorsText = await anchorsRes.text();

  const matches = [];
  for (const line of anchorsText.split("\n")) {
    if (!line.trim()) continue;
    try {
      const e = JSON.parse(line);
      if (e.date === date) matches.push(e);
    } catch (err) { /* skip malformed */ }
  }
  const anchor = matches[0] || null;

  const snapRes = await fetch(base + date + ".json", { cache: "no-store", signal: AbortSignal.timeout(8000) });
  if (!snapRes.ok) throw new Error("Snapshot " + date + " not found (HTTP " + snapRes.status + ")");
  const snapBytes = new Uint8Array(await snapRes.arrayBuffer());
  const hashBuf = await crypto.subtle.digest("SHA-256", snapBytes);
  const fileSha256Now = Array.from(new Uint8Array(hashBuf))
    .map(b => b.toString(16).padStart(2, "0")).join("");

  let snap = {};
  try { snap = JSON.parse(new TextDecoder().decode(snapBytes)); } catch (e) { /* leave {} */ }

  let tsaPresent = false;
  try {
    const tsrRes = await fetch(base + date + ".json.tsr", { method: "HEAD", cache: "no-store", signal: AbortSignal.timeout(5000) });
    tsaPresent = tsrRes.ok;
  } catch (e) { /* leave false */ }

  const anchored = !!anchor;
  let tampered = null;
  if (anchor) tampered = (fileSha256Now !== anchor.file_sha256);

  let note;
  if (!anchored) {
    note = "No anchor entry for " + date + ".";
  } else if (tampered) {
    note = "FILE CHANGED SINCE ANCHOR — investigate. anchored=" +
           anchor.file_sha256.slice(0, 16) + "…  current=" + fileSha256Now.slice(0, 16) + "…";
  } else {
    note = "File matches anchor — unchanged since " + anchor.anchored_at + ".";
  }

  return jsonResult({
    date,
    anchored,
    file_sha256_at_anchor: anchor ? anchor.file_sha256 : null,
    file_sha256_now: fileSha256Now,
    tampered_since_anchor: tampered,
    anchored_at: anchor ? anchor.anchored_at : null,
    tsa_file: anchor ? anchor.tsa_file : null,
    tsa_present: tsaPresent,
    tsa_source: anchor ? anchor.tsa_source : null,
    snapshot_hash: snap.hash || null,
    snapshot_signature_present: !!snap.signature,
    snapshot_pubkey_id: snap.pubkey_id || null,
    duplicate_anchor_entries: matches.length > 1 ? matches : undefined,
    verify_instructions: {
      signature: "Call verify_snapshot(date=\"" + date + "\") or run scripts/verify_signature.py",
      timestamp: tsaPresent
        ? "openssl ts -verify -in " + date + ".json.tsr -data " + date + ".json -CAfile freetsa-cacert.pem -untrusted freetsa-tsa.crt"
        : "no .tsr file — snapshot was not timestamped",
      did: "https://christianscode1994.github.io/VolatiAI/.well-known/did.json",
      full_guide: "https://christianscode1994.github.io/VolatiAI/VERIFICATION.md",
    },
    note,
  });
}

async function toolGetTrustManifest() {
  return jsonResult({
    server: SERVER_INFO,
    protocol_version: PROTOCOL_VERSION,
    discoverability: {
      did: "https://christianscode1994.github.io/VolatiAI/.well-known/did.json",
      current_pubkey: "https://christianscode1994.github.io/VolatiAI/.well-known/volatiai-pubkey.pem",
      v0_historical_pubkey: "https://christianscode1994.github.io/VolatiAI/.well-known/volatiai-pubkey-v0.pem",
      current_key_meta: "https://christianscode1994.github.io/VolatiAI/.well-known/volatiai-key.json",
      v0_key_meta: "https://christianscode1994.github.io/VolatiAI/.well-known/volatiai-key-v0.json",
      security_contact: "https://christianscode1994.github.io/VolatiAI/.well-known/security.txt",
      verification_guide: "https://christianscode1994.github.io/VolatiAI/VERIFICATION.md",
      key_rotation_history: "https://christianscode1994.github.io/VolatiAI/KEY_ROTATION.md",
    },
    snapshot_url_pattern: "https://christianscode1994.github.io/VolatiAI/snapshots/{YYYY-MM-DD}.json",
    anchor_log_url: "https://christianscode1994.github.io/VolatiAI/snapshots/_anchors.jsonl",
    timestamp_file_pattern: "https://christianscode1994.github.io/VolatiAI/snapshots/{YYYY-MM-DD}.json.tsr",
    algorithms: {
      signature: "Ed25519",
      hash: "SHA-256",
      canonicalization: "json.dumps(obj, separators=(',',':'), sort_keys=True, ensure_ascii=False)",
      timestamp: "RFC 3161 (FreeTSA.org)",
    },
    tools: TOOLS.map(t => ({ name: t.name, description: t.description })),
    verification_chain: [
      "1. Fetch snapshot JSON from snapshot_url_pattern",
      "2. Call verify_snapshot(date) — proves signer approval + integrity",
      "3. Call get_anchor(date) — proves unchanged since anchored (FreeTSA-attested time)",
      "4. Follow did.json or VERIFICATION.md for full independent reproduction",
    ],
    note: "Signature proves origin + integrity, not correctness of underlying data.",
  });
}

async function toolResolveEntity(args = {}) {
  const query = String(args.query || args.sector || args.entity || "").trim();
  if (!query) throw new Error("query (entity id, alias, or sector slug) is required");

  const base = "https://christianscode1994.github.io/VolatiAI/";

  // Fetch the entity registry
  const entRes = await fetch(base + "entities.json", { cache: "no-store", signal: AbortSignal.timeout(8000) });
  if (!entRes.ok) throw new Error("entities.json fetch failed (HTTP " + entRes.status + ")");
  const entityData = await entRes.json();
  const entities = entityData.entities || {};

  // Fetch the link table (best-effort, no failure if missing)
  let links = [];
  try {
    const linksRes = await fetch(base + "entity_links.jsonl", { cache: "no-store", signal: AbortSignal.timeout(8000) });
    if (linksRes.ok) {
      const text = await linksRes.text();
      for (const line of text.split("\n")) {
        if (!line.trim()) continue;
        try { links.push(JSON.parse(line)); } catch (e) { /* skip malformed */ }
      }
    }
  } catch (e) { /* links are optional */ }

  // Resolution order: exact entity id → alias → sector slug
  const q = query.toLowerCase();
  const resolved = [];
  for (const [canonId, e] of Object.entries(entities)) {
    if (canonId.toLowerCase() === q) { resolved.push({ method: "entity_id", entity: canonId, entry: e }); continue; }
    for (const alias of (e.aliases || [])) {
      if (alias.toLowerCase() === q) { resolved.push({ method: "alias", entity: canonId, alias, entry: e }); break; }
    }
    for (const slug of (e.sectors_expected || [])) {
      if (slug.toLowerCase() === q) { resolved.push({ method: "sector", entity: canonId, sector: slug, entry: e }); break; }
    }
  }

  // Also check entity_links for direct matches on query
  const linkMatches = links.filter(l =>
    (l.source || "").toLowerCase() === q || (l.target || "").toLowerCase() === q);

  if (resolved.length === 0 && linkMatches.length === 0) {
    return jsonResult({
      query,
      resolved: false,
      note: "No entity or link matched '" + query + "'. Check the entity registry for known entities.",
      known_entity_ids: Object.keys(entities).sort(),
    });
  }

  // Metric guards: warn if any resolved entity is in a "not_comparable_across" set
  const metricGuards = entityData.spread_metrics || {};
  const warnings = [];
  const resolvedEntityIds = resolved.map(r => r.entity);
  for (const [metricKey, guard] of Object.entries(metricGuards)) {
    if (metricKey.startsWith("_")) continue;
    const notComparable = guard.not_comparable_across || [];
    const overlapping = resolvedEntityIds.filter(id => notComparable.includes(id));
    if (overlapping.length > 0) {
      warnings.push({
        metric: metricKey,
        affected_entities: overlapping,
        guard: guard.example_of_wrong_grouping || guard.described_as,
      });
    }
  }

  // Indirect links: any link involving a resolved entity as source/target
  const linkByEntity = links.filter(l =>
    resolvedEntityIds.includes(l.source) || resolvedEntityIds.includes(l.target));

  return jsonResult({
    query,
    resolved: true,
    matches: resolved.map(r => ({
      method: r.method,
      entity_id: r.entity,
      canonical_name: r.entry.canonical_name,
      type: r.entry.type,
      aliases: r.entry.aliases || [],
      external_ids: r.entry.external_ids || {},
      sectors_expected: r.entry.sectors_expected || [],
      matched_via: r.method === "alias" ? r.alias : (r.method === "sector" ? r.sector : r.entity),
    })),
    links: linkByEntity,
    warnings: warnings.length > 0 ? warnings : undefined,
    _registry: {
      entities_url: base + "entities.json",
      entity_links_url: base + "entity_links.jsonl",
      note: "Resolution is curated, not inferred. Cross-domain identity is deliberate human judgment. See docs/entities.json for how to add entries.",
    },
  });
}

async function toolListEntities(args = {}) {
  const base = "https://christianscode1994.github.io/VolatiAI/";
  const res = await fetch(base + "entities.json", { cache: "no-store", signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error("entities.json fetch failed (HTTP " + res.status + ")");
  const entityData = await res.json();
  const entities = entityData.entities || {};

  const filterType = args.type ? String(args.type).toLowerCase() : null;
  const filtered = Object.entries(entities)
    .filter(([_, e]) => !filterType || (e.type || "").toLowerCase() === filterType)
    .map(([id, e]) => ({
      id,
      type: e.type,
      canonical_name: e.canonical_name,
      aliases: e.aliases || [],
      sectors_expected: e.sectors_expected || [],
    }));

  return jsonResult({
    total_entities: Object.keys(entities).length,
    returned: filtered.length,
    entities: filtered,
    _registry: { entities_url: base + "entities.json" },
  });
}

// Resolves a pubkey ID to its baked PEM, if present. Baked keys let the
// verifier run with zero network fetch. Only fall back to fetching from a
// URL if the envelope names an ID we don't ship in [vars].
function pubkeyForId(id, env) {
  if (!id || !env) return null;
  if (id === env.PUBKEY_CURRENT_ID) return env.PUBKEY_CURRENT_PEM || null;
  if (id === env.PUBKEY_V0_HIST_ID) return env.PUBKEY_V0_HIST_PEM || null;
  return null;
}

function pubkeyLabelForId(id, env) {
  if (!id || !env) return null;
  if (id === env.PUBKEY_CURRENT_ID) return "current";
  if (id === env.PUBKEY_V0_HIST_ID) return "v0-historical";
  return null;
}

async function verifyEnvelope(envelope, pubkeyPem) {
  // Import Ed25519 key (same SPKI parsing as verifySignature)
  const b64 = pubkeyPem
    .replace(/-----BEGIN PUBLIC KEY-----/g, "")
    .replace(/-----END PUBLIC KEY-----/g, "")
    .replace(/\s+/g, "");
  const spki = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
  const key = await crypto.subtle.importKey(
    "spki", spki, { name: "Ed25519" }, false, ["verify"]
  );

  // Canonicalize exactly as sign_envelope does in sign_snapshot.py:
  // strip envelope_signature AND envelope_pubkey_id, then canonical() over the rest
  function canonical(obj) {
    if (obj === null) return "null";
    if (typeof obj === "boolean") return obj ? "true" : "false";
    if (typeof obj === "number") return String(obj);
    if (typeof obj === "string") return JSON.stringify(obj);
    if (Array.isArray(obj)) return "[" + obj.map(canonical).join(",") + "]";
    const keys = Object.keys(obj).sort();
    return "{" + keys.map(k => JSON.stringify(k) + ":" + canonical(obj[k])).join(",") + "}";
  }

  // The signature covers envelope - {envelope_signature, envelope_pubkey_id}.
  // sign_envelope() adds envelope_pubkey_id AFTER signing, so including it
  // here produces different bytes than what was signed.
  const signable = { ...envelope };
  delete signable.envelope_signature;
  delete signable.envelope_pubkey_id;

  const msg = new TextEncoder().encode(canonical(signable));

  // envelope_signature is HEX (from sign_envelope: sig.hex()), unlike
  // snapshot signatures which are base64. Strict 128-char check catches
  // both wrong-encoding errors and truncated signatures.
  const hexStr = String(envelope.envelope_signature || "");
  if (hexStr.length !== 128) {
    throw new Error("envelope_sig_not_128_hex_chars: " + hexStr.length);
  }
  const sig = new Uint8Array(64);
  for (let i = 0; i < 64; i++) {
    sig[i] = parseInt(hexStr.substr(i * 2, 2), 16);
  }
  return await crypto.subtle.verify("Ed25519", key, sig, msg);
}

async function toolGetCurrentRevision(env = {}, args = {}) {
  // Verification paths, in order of trust independence:
  //   1. Inline envelope + baked key  — zero network fetch.
  //      Consumer passes the envelope they hold; we verify against
  //      the PEM in [vars]. No GitHub, no Pages.
  //   2. Fetched envelope + baked key — verify against the fetched
  //      current.json using the shipped PEM. No pubkey fetch.
  //   3. Fetched envelope + Pages-fetched key — fallback for an
  //      envelope_pubkey_id we don't ship.
  // envelope_key_matched is a real identity claim (which baked key
  // matched), not a hardcoded string.

  const verif = (ok, err, matched, source) => ({
    envelope_signature_valid: ok,
    envelope_signature_error: err,
    envelope_key_matched: matched,
    source,
  });

  // Path 1: inline envelope — no network at all.
  if (args && args.envelope && typeof args.envelope === "object") {
    const envJson = args.envelope;
    const bakedPem = pubkeyForId(envJson.envelope_pubkey_id, env);
    if (!bakedPem) {
      return jsonResult({
        ...envJson,
        _verification: verif(
          false,
          "unknown_pubkey_id_not_baked: " + (envJson.envelope_pubkey_id || "<missing>"),
          null,
          "inline-baked",
        ),
      });
    }
    try {
      const ok = await verifyEnvelope(envJson, bakedPem);
      return jsonResult({
        ...envJson,
        _verification: verif(
          ok,
          ok ? null : "sig_verify_false",
          ok ? pubkeyLabelForId(envJson.envelope_pubkey_id, env) : null,
          "inline-baked",
        ),
      });
    } catch (e) {
      return jsonResult({
        ...envJson,
        _verification: verif(
          false,
          String(e.message || e).slice(0, 100),
          null,
          "inline-baked",
        ),
      });
    }
  }

  // Paths 2 & 3: fetch current.json (raw GitHub) then verify.
  const r = await fetch(
    "https://raw.githubusercontent.com/christianscode1994/VolatiAI/main/docs/current.json",
    { cache: "no-store", signal: AbortSignal.timeout(8000) },
  );
  if (!r.ok) throw new Error(`current.json not found (HTTP ${r.status})`);
  const current = await r.json();

  let ok = null, err = null, matched = null, source = "none";

  if (current.envelope_signature && current.envelope_pubkey_id) {
    const bakedPem = pubkeyForId(current.envelope_pubkey_id, env);
    if (bakedPem) {
      try {
        ok = await verifyEnvelope(current, bakedPem);
        if (ok === true) matched = pubkeyLabelForId(current.envelope_pubkey_id, env);
        else if (ok === false) err = "sig_verify_false";
        source = "fetched-baked";
      } catch (e) {
        err = String(e.message || e).slice(0, 100);
        source = "fetched-baked";
      }
    } else {
      try {
        const pkRes = await fetch(
          "https://christianscode1994.github.io/VolatiAI/.well-known/volatiai-pubkey.pem",
          { cache: "no-store", signal: AbortSignal.timeout(5000) },
        );
        if (pkRes.ok) {
          const pkPem = await pkRes.text();
          ok = await verifyEnvelope(current, pkPem);
          if (ok === true) matched = "pages-fallback";
          else if (ok === false) err = "sig_verify_false";
        } else {
          err = "pubkey_fetch_" + pkRes.status;
        }
        source = "fetched-pages";
      } catch (e) {
        err = String(e.message || e).slice(0, 100);
        source = "fetched-pages";
      }
    }
  }

  return jsonResult({
    ...current,
    _verification: verif(ok, err, matched, source),
  });
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

const BASE_RPC_URL = "https://mainnet.base.org";

const RPC_ENDPOINTS = [
  "https://base-mainnet.public.blastapi.io",   // fastest, works from CF Workers
  "https://1rpc.io/base",
  "https://base.drpc.org",
  "https://base.gateway.tenderly.co",
  "https://mainnet.base.org",                   // rate-limited from CF IPs, last resort
  "https://base.llamarpc.com",                  // returns HTML sometimes, last
];

// Per-isolate in-memory cache. Free, no KV writes. Resets on cold start.
const __rpcCache = new Map();
function rpcCacheKey(method, params) {
  return method + ":" + JSON.stringify(params || []);
}

async function baseRpcCall(method, params, cacheMs = 0) {
  const cacheKey = rpcCacheKey(method, params);
  if (cacheMs > 0) {
    const hit = __rpcCache.get(cacheKey);
    if (hit && Date.now() - hit.ts < cacheMs) {
      return hit.val;
    }
  }
  let lastErr = null;
  for (const url of RPC_ENDPOINTS) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
      });
      if (res.status === 429) {
        lastErr = new Error("RPC 429 at " + url);
        continue;
      }
      if (!res.ok) {
        lastErr = new Error("RPC HTTP " + res.status + " at " + url);
        continue;
      }
      const json = await res.json();
      if (json.error) {
        lastErr = new Error("RPC " + (json.error.message || "error") + " at " + url);
        continue;
      }
      if (cacheMs > 0) {
        __rpcCache.set(cacheKey, { val: json.result, ts: Date.now() });
      }
      return json.result;
    } catch (e) {
      lastErr = new Error("RPC fetch failed at " + url + ": " + (e.message || e));
      continue;
    }
  }
  throw lastErr || new Error("All " + RPC_ENDPOINTS.length + " RPC endpoints failed");
}

function isValidAddr(a) {
  return typeof a === "string" && /^0x[0-9a-fA-F]{40}$/.test(a);
}

async function toolExplainPricing(env = {}) {
  return {
    network: "base",
    asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
    payTo: "0x3EE508f75342315164301B2282f302DF3d3beD47",
    scheme: "exact",
    price_usdc_flat: 0.01,
    maxTimeoutSeconds: 60,
    how_to_pay: "Sign EIP-712 TransferWithAuthorization; send base64 JSON as X-PAYMENT header",
    free_tools: ["explain_pricing", "tools/list"],
    paid_tools: [
      { name: "get_eth_balance",     args: ["address"],               what: "ETH balance on Base" },
      { name: "get_token_balance",   args: ["address", "token"],      what: "ERC-20 balance (decimals 6)" },
      { name: "get_block_number",    args: [],                        what: "Latest Base block" },
      { name: "get_gas_price",       args: [],                        what: "Current Base gas in Gwei" },
      { name: "get_wallet_nonce",    args: ["address"],               what: "Transaction count for wallet" },
      { name: "list_active_signals", args: ["limit?", "severity?", "category?"], what: "Ranked signals" },
      { name: "get_sector",          args: ["sector"],                what: "Sector data" },
      { name: "list_categories",     args: [],                        what: "Signal categories" },
      { name: "verify_snapshot",     args: ["date"],                  what: "Snapshot integrity" },
      { name: "find_corroborations", args: [],                        what: "Cross-source corroboration" },
      { name: "get_diff",            args: ["from_date?", "to_date?"], what: "Snapshot diff" },
      { name: "get_current_revision",args: [],                        what: "Current revision pointer" },
      { name: "get_anchor",          args: ["date"],                  what: "Anchor log status" },
      { name: "get_trust_manifest",  args: [],                        what: "Verification chain" },
      { name: "resolve_entity",      args: ["query"],                 what: "Entity lookup" },
      { name: "list_entities",       args: ["type?"],                 what: "Entity registry" },
    ],
    note: "All paid tools are 0.01 USDC flat. Chain reads will be repriced to 0.001 in a future release.",
  };
}

async function toolGetEthBalance(args) {
  const { address } = args || {};
  if (!isValidAddr(address)) throw new Error("Invalid address: expected 0x-prefixed 40-char hex");
  const weiHex = await baseRpcCall("eth_getBalance", [address, "latest"]);
  const wei = BigInt(weiHex);
  const eth = Number(wei) / 1e18;
  return { address, balance_wei: wei.toString(), balance_eth: eth.toFixed(18) };
}

async function toolGetTokenBalance(args) {
  const { address, token } = args || {};
  if (!isValidAddr(address)) throw new Error("Invalid address");
  if (!isValidAddr(token)) throw new Error("Invalid token address");
  const data = "0x70a08231" + address.slice(2).padStart(64, "0");
  const rawHex = await baseRpcCall("eth_call", [{ to: token, data }, "latest"]);
  const raw = BigInt(rawHex);
  const decimals = 6;
  const amount = Number(raw) / Math.pow(10, decimals);
  return {
    address, token,
    balance_raw: raw.toString(),
    balance: amount.toFixed(decimals),
    decimals_assumed: decimals,
    hint: "For non-USDC tokens, divide balance_raw by 10^actual_decimals",
  };
}

async function toolGetBlockNumber() {
  const hex = await baseRpcCall("eth_blockNumber", [], 2000);
  return { block_number: parseInt(hex, 16), hex };
}

async function toolGetGasPrice() {
  const hex = await baseRpcCall("eth_gasPrice", [], 5000);
  const wei = BigInt(hex);
  return { gas_price_wei: wei.toString(), gas_price_gwei: (Number(wei) / 1e9).toFixed(4) };
}

async function toolGetWalletNonce(args) {
  const { address } = args || {};
  if (!isValidAddr(address)) throw new Error("Invalid address: expected 0x-prefixed 40-char hex");
  const hex = await baseRpcCall("eth_getTransactionCount", [address, "latest"]);
  return { address, nonce: parseInt(hex, 16), hex };
}

async function toolGetWalletSummary(args) {
  const { address } = args || {};
  if (!isValidAddr(address)) throw new Error("Invalid address: expected 0x-prefixed 40-char hex");
  const USDC_BASE = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
  const usdcData = "0x70a08231" + address.slice(2).padStart(64, "0");
  const [ethRes, nonceRes, usdcRes, blockRes, gasRes] = await Promise.allSettled([
    baseRpcCall("eth_getBalance", [address, "latest"]),
    baseRpcCall("eth_getTransactionCount", [address, "latest"]),
    baseRpcCall("eth_call", [{ to: USDC_BASE, data: usdcData }, "latest"], 5000),
    baseRpcCall("eth_blockNumber", [], 2000),
    baseRpcCall("eth_gasPrice", [], 5000),
  ]);
  const ethHex = ethRes.status === "fulfilled" ? ethRes.value : null;
  const nonceHex = nonceRes.status === "fulfilled" ? nonceRes.value : null;
  const usdcHex = usdcRes.status === "fulfilled" ? usdcRes.value : null;
  const blockHex = blockRes.status === "fulfilled" ? blockRes.value : null;
  const gasHex = gasRes.status === "fulfilled" ? gasRes.value : null;
  if (ethHex === null && nonceHex === null && usdcHex === null && blockHex === null && gasHex === null) {
    throw new Error("All 5 RPC reads failed (endpoints rate-limited or unreachable)");
  }
  const ethWei = ethHex !== null ? BigInt(ethHex) : null;
  const usdcRaw = usdcHex !== null ? BigInt(usdcHex) : null;
  const gasWei = gasHex !== null ? BigInt(gasHex) : null;
  const failures = [
    ethHex === null ? "eth_balance" : null,
    nonceHex === null ? "nonce" : null,
    usdcHex === null ? "usdc_balance" : null,
    blockHex === null ? "latest_block" : null,
    gasHex === null ? "gas_price" : null,
  ].filter(Boolean);
  return {
    address,
    eth_balance_wei: ethWei !== null ? ethWei.toString() : null,
    eth_balance: ethWei !== null ? (Number(ethWei) / 1e18).toFixed(18) : null,
    nonce: nonceHex !== null ? parseInt(nonceHex, 16) : null,
    usdc_balance_raw: usdcRaw !== null ? usdcRaw.toString() : null,
    usdc_balance: usdcRaw !== null ? (Number(usdcRaw) / 1e6).toFixed(6) : null,
    latest_block: blockHex !== null ? parseInt(blockHex, 16) : null,
    gas_price_wei: gasWei !== null ? gasWei.toString() : null,
    gas_price_gwei: gasWei !== null ? (Number(gasWei) / 1e9).toFixed(4) : null,
    fetched_at: new Date().toISOString(),
    partial: failures.length > 0,
    failed_fields: failures.length > 0 ? failures : undefined,
    note: failures.length > 0
      ? "Partial composite — " + failures.length + " of 5 RPC reads failed; returned available fields only"
      : "5 RPC reads executed in parallel — 1 round-trip latency instead of 5 sequential",
  };
}

async function toolPageToMarkdown(args) {
  const { url, max_length = 50000 } = args || {};
  if (typeof url !== "string" || !/^https?:\/\//i.test(url)) {
    throw new Error("Invalid URL: must start with http:// or https://");
  }
  const res = await fetch(url, {
    headers: {
      "User-Agent": "VolatiAI-MCP/1.0 (+https://volatiai-mcp.fourieranalys.workers.dev)",
      "Accept": "text/html,application/xhtml+xml,text/plain,*/*",
    },
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error("HTTP " + res.status + " from " + url);
  const contentType = res.headers.get("content-type") || "";
  const raw = await res.text();
  if (!contentType.includes("html") && !contentType.includes("xml")) {
    return { url, content_type: contentType, markdown: raw.slice(0, max_length), length: raw.length, truncated: raw.length > max_length, fetched_at: new Date().toISOString() };
  }
  let html = raw
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<!--[\s\S]*?-->/g, "");
  html = html
    .replace(/<h1[^>]*>([\s\S]*?)<\/h1>/gi, "# $1\n\n")
    .replace(/<h2[^>]*>([\s\S]*?)<\/h2>/gi, "## $1\n\n")
    .replace(/<h3[^>]*>([\s\S]*?)<\/h3>/gi, "### $1\n\n")
    .replace(/<h4[^>]*>([\s\S]*?)<\/h4>/gi, "#### $1\n\n")
    .replace(/<strong[^>]*>([\s\S]*?)<\/strong>/gi, "**$1**")
    .replace(/<b[^>]*>([\s\S]*?)<\/b>/gi, "**$1**")
    .replace(/<em[^>]*>([\s\S]*?)<\/em>/gi, "*$1*")
    .replace(/<i[^>]*>([\s\S]*?)<\/i>/gi, "*$1*")
    .replace(/<code[^>]*>([\s\S]*?)<\/code>/gi, "`$1`")
    .replace(/<a[^>]*href=["']([^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi, "[$2]($1)")
    .replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, "- $1\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<[^>]+>/g, "");
  html = html
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, " ");
  html = html.replace(/\n{3,}/g, "\n\n").trim();
  return { url, content_type: contentType, markdown: html.slice(0, max_length), length: html.length, truncated: html.length > max_length, fetched_at: new Date().toISOString() };
}

async function handleToolsCall(params = {}, env = {}) {
  const name = params.name;
  const args = params.arguments || {};
  switch (name) {
    case "list_active_signals":  return await toolListActiveSignals(args);
    case "get_sector":       return await toolGetSector(args, env);
    case "list_categories":       return await toolListCategories();
    case "verify_snapshot":       return await toolVerifySnapshot(args);
    case "get_anchor":           return await toolGetAnchor(args);
    case "get_trust_manifest":   return await toolGetTrustManifest();
    case "resolve_entity":       return await toolResolveEntity(args);
    case "list_entities":        return await toolListEntities(args);
    case "find_corroborations":   return await toolFindCorroborations();
    case "get_current_revision": return await toolGetCurrentRevision(env, args);
    case "get_diff":             return await toolGetDiff(args);
        case "explain_pricing":      return await toolExplainPricing(env);
    case "get_eth_balance":      return await toolGetEthBalance(args);
    case "get_token_balance":    return await toolGetTokenBalance(args);
    case "get_block_number":     return await toolGetBlockNumber();
    case "get_gas_price":        return await toolGetGasPrice();
    case "get_wallet_nonce":     return await toolGetWalletNonce(args);
    case "get_wallet_summary":     return await toolGetWalletSummary(args);
    case "page_to_markdown":       return await toolPageToMarkdown(args);
    case "get_snapshot":        return await toolGetSnapshot(args);
    case "purchase":            return await toolPurchase(args, env);
default: throw new Error(`Unknown tool: ${name}`);
  }
}

async function handleRPC(msg, env = {}) {
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
        return jsonRpc(id, await handleToolsCall(params, env));
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

// CDP API key auth: Ed25519 JWT with method+path bound so the token can't
// be replayed against a different endpoint. The secret is a 64-byte
// base64-encoded Ed25519 private key (seed || pubkey); we wrap the 32-byte
// seed in PKCS8 for WebCrypto.
const RESOURCE_URL = "https://volatiai-mcp.fourieranalys.workers.dev/premium/mcp";

// Bazaar discovery metadata. CDP indexer reads paymentPayload.extensions.bazaar
// on the settle request; if absent, the route is treated as an ordinary 402
// and never indexed. Hardcoded shape so we don't depend on @x402/extensions/bazaar.
const BAZAAR_EXT = {
  info: {
    input: {
      type: "http",
      method: "POST",
      bodyType: "json",
      body: { jsonrpc: "2.0", id: 1, method: "tools/list" },
    },
    output: {
      type: "json",
      example: { jsonrpc: "2.0", id: 1, result: { tools: [] } },
    },
  },
  schema: {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    type: "object",
    properties: {
      input: {
        type: "object",
        required: ["type", "method", "bodyType", "body"],
        properties: {
          type: { type: "string", const: "http" },
          method: { type: "string" },
          bodyType: { type: "string" },
          body: { type: "object" },
        },
      },
      output: {
        type: "object",
        properties: { type: { type: "string" }, example: {} },
      },
    },
    required: ["input"],
  },
};

async function cdpJwt(env, method, path) {
  // CDP requires Ed25519 (EdDSA) or ES256 JWTs, bound to the request URI.
  // The SDK auto-detects the key type and signs correctly.
  return await generateJwt({
    apiKeyId: env.CDP_API_KEY_ID,
    apiKeySecret: env.CDP_API_KEY_SECRET,
    requestMethod: method,
    requestHost: "api.cdp.coinbase.com",
    requestPath: path,
    expiresIn: 120,
  });

}


async function fetchWithRetry(url, opts, maxAttempts = 2) {
  let lastRes;
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const res = await fetch(url, opts);
      lastRes = res;
      if (res.status < 500 && res.status !== 429 && res.status !== 408) return res;
      if (i === maxAttempts - 1) return res;
    } catch (err) {
      if (i === maxAttempts - 1) throw err;
    }
    await new Promise((r) => setTimeout(r, 1000 * (2 * i + 1)));
  }
  return lastRes;
}

export default {
  async fetch(req, env, ctx) {
    const url = new URL(req.url);
    const cors = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Accept",
    };

    // OPTIONS on /premium/mcp must reach the 402 probe below (x402scan probes it).
    // All other OPTIONS get the fast CORS preflight 204.
    if (req.method === "OPTIONS" && url.pathname !== "/premium/mcp") {
      return new Response(null, { status: 204, headers: cors });
    }

    if (url.pathname === "/" || url.pathname === "/health") {
      return new Response(JSON.stringify({
        name: "volatiai-mcp", status: "ok",
        protocol: PROTOCOL_VERSION,
        tools: TOOLS.map(t => t.name),
        docs: "https://christianscode1994.github.io/VolatiAI/",
      }), { headers: { "Content-Type": "application/json", ...cors } });
    }

    if (url.pathname === "/.well-known/x402" || url.pathname === "/.well-known/x402.json") {
      // x402 discovery document — what x402scan and other indexes probe.
      // Shape per x402 v2 spec: { x402Version, resources: [{resource, mimeType, accepts}] }
      const discoveryAccepts = [
        {
          scheme: "exact",
          network: "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp",
          maxAmountRequired: "10000",
          amount: "10000",
          resource: "https://volatiai-mcp.fourieranalys.workers.dev/premium/mcp",
          description: "VolatiAI premium signals \u2014 $0.01 per request, USDC on Solana",
          mimeType: "application/json",
          payTo: "0x3EE508f75342315164301B2282f302DF3d3beD47",
          maxTimeoutSeconds: 60,
          asset: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
          extra: { name: "USDC", version: "2" },
        },
        {
          scheme: "exact",
          network: "eip155:5042",
          maxAmountRequired: "10000",
          amount: "10000",
          resource: "https://volatiai-mcp.fourieranalys.workers.dev/premium/mcp",
          description: "VolatiAI premium signals \u2014 $0.01 per request, USDC on Arc",
          mimeType: "application/json",
          payTo: "0x3EE508f75342315164301B2282f302DF3d3beD47",
          maxTimeoutSeconds: 60,
          asset: "0x3600000000000000000000000000000000000000",
          extra: { name: "USDC", version: "2" },
          extensions: {
          bazaar: BAZAAR_EXT,
          ...declareSIWxExtension({
            statement: "Sign in with your wallet to access previously purchased content",
            network: ["eip155:8453", "eip155:5042", "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp"],
            expirationSeconds: 3600,
          })
        }
        },
        {
          scheme: "exact",
          network: "base",
          maxAmountRequired: "10000",
          amount: "10000",
          resource: "https://volatiai-mcp.fourieranalys.workers.dev/premium/mcp",
          description: "VolatiAI premium signals \u2014 $0.01 per request, USDC on Base",
          mimeType: "application/json",
          payTo: "0x3EE508f75342315164301B2282f302DF3d3beD47",
          maxTimeoutSeconds: 60,
          asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
          extra: { name: "USD Coin", version: "2" },
          extensions: {
          bazaar: BAZAAR_EXT,
          ...declareSIWxExtension({
            statement: "Sign in with your wallet to access previously purchased content",
            network: ["eip155:8453", "eip155:5042", "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp"],
            expirationSeconds: 3600,
          })
        }
        }
      ];
      return new Response(JSON.stringify({
        x402Version: 1,
        version: 1,
        resources: [{
          resource: "https://volatiai-mcp.fourieranalys.workers.dev/premium/mcp",
          mimeType: "application/json",
          accepts: discoveryAccepts
        }]
      }, null, 2), {
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
          "Cache-Control": "public, max-age=300"
        }
      });
    }

    // ─── OAuth Discovery: redirect agents to x402 ────────────────────────
    // Agents (Claude Desktop, Cursor, LangChain) probe these endpoints when
    // they need to authenticate. We respond with "no OAuth — use x402."
    // RFC 9728 (Protected Resource Metadata), RFC 8414 (Auth Server), OIDC.
    if (url.pathname === "/.well-known/oauth-protected-resource" ||
        url.pathname === "/.well-known/oauth-protected-resource/mcp") {
      return new Response(JSON.stringify({
        resource: "https://volatiai-mcp.fourieranalys.workers.dev/premium/mcp",
        authorization_servers: [],
        bearer_methods_supported: [],
        resource_documentation: "https://volatiai-mcp.fourieranalys.workers.dev/.well-known/x402",
        x402_payment_required: true,
        x402_network: "base",
        x402_asset: "USDC",
        x402_asset_address: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
        x402_price_usdc: "0.01",
        x402_pay_to: "0x3EE508f75342315164301B2282f302DF3d3beD47",
        free_discovery_methods: ["tools/list", "explain_pricing", "initialize", "notifications/*", "ping"],
        paid_endpoint: "https://volatiai-mcp.fourieranalys.workers.dev/premium/mcp",
        how_to_pay: "POST /premium/mcp with X-PAYMENT header containing EIP-712 TransferWithAuthorization",
        message: "This is an x402-paid MCP server, not an OAuth-protected one. Discovery endpoints are free. All tool calls require payment in USDC on Base.",
      }, null, 2), {
        headers: { "Content-Type": "application/json", ...cors },
      });
    }

    if (url.pathname === "/.well-known/oauth-authorization-server") {
      return new Response(JSON.stringify({
        issuer: "https://volatiai-mcp.fourieranalys.workers.dev",
        authorization_endpoint: null,
        token_endpoint: null,
        jwks_uri: null,
        response_types_supported: [],
        grant_types_supported: [],
        x402_payment_required: true,
        x402_discovery: "https://volatiai-mcp.fourieranalys.workers.dev/.well-known/x402",
        message: "No OAuth authorization server. This MCP endpoint uses x402 payment (USDC on Base mainnet). See x402_discovery for details.",
      }, null, 2), {
        headers: { "Content-Type": "application/json", ...cors },
      });
    }

    if (url.pathname === "/.well-known/openid-configuration") {
      return new Response(JSON.stringify({
        issuer: "https://volatiai-mcp.fourieranalys.workers.dev",
        authorization_endpoint: null,
        token_endpoint: null,
        userinfo_endpoint: null,
        jwks_uri: null,
        scopes_supported: [],
        response_types_supported: [],
        subject_types_supported: [],
        id_token_signing_alg_values_supported: [],
        x402_payment_required: true,
        x402_discovery: "https://volatiai-mcp.fourieranalys.workers.dev/.well-known/x402",
        message: "No OIDC. This MCP endpoint uses x402 payment (USDC on Base mainnet). See x402_discovery for details.",
      }, null, 2), {
        headers: { "Content-Type": "application/json", ...cors },
      });
    }

    // agent-tools.cloud domain ownership verification
    if (url.pathname === "/.well-known/agent-tools-verify.txt") {
      if (!env.ATC_VERIFY_TOKEN) {
        return new Response("not configured", { status: 404, headers: { "Content-Type": "text/plain" } });
      }
      return new Response(env.ATC_VERIFY_TOKEN, {
        headers: {
          "Content-Type": "text/plain",
          "Cache-Control": "no-store",
          "Access-Control-Allow-Origin": "*",
        },
      });
    }

    // SIWX discovery — returns the sign-in-with-x extension for agents
    if (url.pathname === "/.well-known/sign-in-with-x") {
      try {
        const siwxExt = declareSIWxExtension({
          statement: "Sign in with your wallet to access previously purchased content",
          network: ["eip155:8453", "eip155:5042", "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp"],
          expirationSeconds: 3600,
        });
        return new Response(JSON.stringify(siwxExt), {
          headers: { "Content-Type": "application/json", ...cors },
        });
      } catch (e) {
        return new Response(JSON.stringify({ error: "siwx_unavailable", message: String(e && e.message || e) }), {
          status: 500, headers: { "Content-Type": "application/json", ...cors },
        });
      }
    }

    // /llms.txt — AI crawler discovery (https://llmstxt.org)
    if (url.pathname === "/llms.txt") {
      const llmsContent = `# VolatiAI MCP

> Signed, verifiable signals from 421 sectors. Every response carries an Ed25519 attestation verifiable offline. Paid via x402 (USDC on Base, Arc, and Solana).

## MCP Endpoint
- Free tier: https://volatiai-mcp.fourieranalys.workers.dev/mcp
- Paid tier: https://volatiai-mcp.fourieranalys.workers.dev/premium/mcp (21 tools, $0.01 USDC per call)

## Discovery
- x402 manifest: https://volatiai-mcp.fourieranalys.workers.dev/.well-known/x402
- Sign-in-with-x: https://volatiai-mcp.fourieranalys.workers.dev/.well-known/sign-in-with-x
- OAuth discovery: https://volatiai-mcp.fourieranalys.workers.dev/.well-known/oauth-protected-resource
- OpenAPI spec: https://volatiai-mcp.fourieranalys.workers.dev/openapi.json
- Server card: https://volatiai-mcp.fourieranalys.workers.dev/.well-known/mcp/server-card.json

## Tools
Chain reads: get_eth_balance, get_token_balance, get_block_number, get_gas_price, get_wallet_nonce, get_wallet_summary
Signals: list_active_signals, get_sector, list_categories, verify_snapshot, get_diff, get_anchor, get_trust_manifest, resolve_entity, list_entities, find_corroborations, get_current_revision, get_snapshot
Utility: page_to_markdown, purchase, explain_pricing (FREE)

## Payment
Protocol: x402 (HTTP 402 Payment Required)
Networks: Base mainnet, Arc (eip155:5042), Solana (in discovery)
Asset: USDC
How to pay: POST /premium/mcp with X-PAYMENT header containing base64-encoded EIP-712 TransferWithAuthorization

## Contact
contact@fourieranalys.se
`;
      return new Response(llmsContent, {
        headers: {
          "Content-Type": "text/plain; charset=utf-8",
          "Cache-Control": "public, max-age=3600",
          "Access-Control-Allow-Origin": "*",
        },
      });
    }

    if (url.pathname === "/.well-known/402index-verify.txt") {
      // Domain ownership proof for 402index.io claim flow.
      return new Response("77bc52035cd4b496d484b5a1122e267bdc504a69ffa3ff16fa28d9e14aba05f1", {
        headers: {
          "Content-Type": "text/plain; charset=utf-8",
          "Cache-Control": "public, max-age=300"
        }
      });
    }

    if (url.pathname === "/openapi.json") {
      return new Response(JSON.stringify(openapiSpec, null, 2), {
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
          "Cache-Control": "public, max-age=300",
        },
      });
    }

    if ((req.method === "GET" || req.method === "HEAD") && url.pathname === "/premium/mcp") {
      // Probes from x402scan/x402dash/PayAI send GET or HEAD, not POST.
      // Return the same 402 challenge; facilitator only settles on 2xx,
      // so this is safe and makes us probe-compatible.
      return await (async () => {
        const accepts = [
          {
            scheme: "exact",
            network: "base",
            maxAmountRequired: "10000",
            amount: "10000",
            resource: "https://volatiai-mcp.fourieranalys.workers.dev/premium/mcp",
            description: "VolatiAI premium signals \u2014 $0.01 per request, USDC on Base",
            mimeType: "application/json",
            payTo: "0x3EE508f75342315164301B2282f302DF3d3beD47",
            maxTimeoutSeconds: 60,
            asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
            extra: { name: "USD Coin", version: "2" },
          extensions: {
          bazaar: BAZAAR_EXT,
          ...declareSIWxExtension({
            statement: "Sign in with your wallet to access previously purchased content",
            network: ["eip155:8453", "eip155:5042", "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp"],
            expirationSeconds: 3600,
          })
        }
          },
        {
            scheme: "exact",
            network: "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp",
            maxAmountRequired: "10000",
            amount: "10000",
            resource: "https://volatiai-mcp.fourieranalys.workers.dev/premium/mcp",
            description: "VolatiAI premium signals \u2014 $0.01 per request, USDC on Solana",
            mimeType: "application/json",
            payTo: "0x3EE508f75342315164301B2282f302DF3d3beD47",
            maxTimeoutSeconds: 60,
            asset: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
            extra: { name: "USDC", version: "2" },
        },
        {
            scheme: "exact",
            network: "eip155:5042",
            maxAmountRequired: "10000",
            amount: "10000",
            resource: "https://volatiai-mcp.fourieranalys.workers.dev/premium/mcp",
            description: "VolatiAI premium signals \u2014 $0.01 per request, USDC on Arc",
            mimeType: "application/json",
            payTo: "0x3EE508f75342315164301B2282f302DF3d3beD47",
            maxTimeoutSeconds: 60,
            asset: "0x3600000000000000000000000000000000000000",
            extra: { name: "USDC", version: "2" },
          extensions: {
          bazaar: BAZAAR_EXT,
          ...declareSIWxExtension({
            statement: "Sign in with your wallet to access previously purchased content",
            network: ["eip155:8453", "eip155:5042", "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp"],
            expirationSeconds: 3600,
          })
        }
          }
        ];
        const requirement = {
          x402Version: 2,
          error: "Payment required",
          resource: {
            url: RESOURCE_URL,
            description: "VolatiAI premium signals — signed, verifiable, $0.01 per call",
            mimeType: "application/json",
          },
          accepts,
          extensions: {
          bazaar: BAZAAR_EXT,
          ...declareSIWxExtension({
            statement: "Sign in with your wallet to access previously purchased content",
            network: ["eip155:8453", "eip155:5042", "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp"],
            expirationSeconds: 3600,
          })
        },
        };
        const header = btoa(unescape(encodeURIComponent(JSON.stringify(requirement))));
        return new Response(JSON.stringify(requirement), {
          status: 402,
          headers: {
            "Content-Type": "application/json",
            "PAYMENT-REQUIRED": header,
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Expose-Headers": "PAYMENT-REQUIRED"
          }
        });
      })();
    }

    if ((req.method === "GET" || req.method === "HEAD") && url.pathname === "/premium/mcp") {
      // Probes from x402scan/x402dash/PayAI send GET or HEAD, not POST.
      // Return the same 402 challenge; facilitator only settles on 2xx,
      // so this is safe and makes us probe-compatible.
      return await (async () => {
        const accepts = [
          {
            scheme: "exact",
            network: "base",
            maxAmountRequired: "10000",
            amount: "10000",
            resource: "https://volatiai-mcp.fourieranalys.workers.dev/premium/mcp",
            description: "VolatiAI premium signals \u2014 $0.01 per request, USDC on Base",
            mimeType: "application/json",
            payTo: "0x3EE508f75342315164301B2282f302DF3d3beD47",
            maxTimeoutSeconds: 60,
            asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
            extra: { name: "USD Coin", version: "2" },
          extensions: {
          bazaar: BAZAAR_EXT,
          ...declareSIWxExtension({
            statement: "Sign in with your wallet to access previously purchased content",
            network: ["eip155:8453", "eip155:5042", "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp"],
            expirationSeconds: 3600,
          })
        }
          },
        {
            scheme: "exact",
            network: "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp",
            maxAmountRequired: "10000",
            amount: "10000",
            resource: "https://volatiai-mcp.fourieranalys.workers.dev/premium/mcp",
            description: "VolatiAI premium signals \u2014 $0.01 per request, USDC on Solana",
            mimeType: "application/json",
            payTo: "0x3EE508f75342315164301B2282f302DF3d3beD47",
            maxTimeoutSeconds: 60,
            asset: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
            extra: { name: "USDC", version: "2" },
        },
        {
            scheme: "exact",
            network: "eip155:5042",
            maxAmountRequired: "10000",
            amount: "10000",
            resource: "https://volatiai-mcp.fourieranalys.workers.dev/premium/mcp",
            description: "VolatiAI premium signals \u2014 $0.01 per request, USDC on Arc",
            mimeType: "application/json",
            payTo: "0x3EE508f75342315164301B2282f302DF3d3beD47",
            maxTimeoutSeconds: 60,
            asset: "0x3600000000000000000000000000000000000000",
            extra: { name: "USDC", version: "2" },
          extensions: {
          bazaar: BAZAAR_EXT,
          ...declareSIWxExtension({
            statement: "Sign in with your wallet to access previously purchased content",
            network: ["eip155:8453", "eip155:5042", "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp"],
            expirationSeconds: 3600,
          })
        }
          }
        ];
        const requirement = {
          x402Version: 2,
          error: "Payment required",
          resource: {
            url: RESOURCE_URL,
            description: "VolatiAI premium signals — signed, verifiable, $0.01 per call",
            mimeType: "application/json",
          },
          accepts,
          extensions: {
          bazaar: BAZAAR_EXT,
          ...declareSIWxExtension({
            statement: "Sign in with your wallet to access previously purchased content",
            network: ["eip155:8453", "eip155:5042", "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp"],
            expirationSeconds: 3600,
          })
        },
        };
        const header = btoa(unescape(encodeURIComponent(JSON.stringify(requirement))));
        return new Response(JSON.stringify(requirement), {
          status: 402,
          headers: {
            "Content-Type": "application/json",
            "PAYMENT-REQUIRED": header,
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Expose-Headers": "PAYMENT-REQUIRED"
          }
        });
      })();
    }

    // Glama connector claim — serves exact JSON at /.well-known/glama.json
    if (url.pathname === "/.well-known/glama.json") {
      if (!env.GLAMA_CLAIM) {
        return new Response(JSON.stringify({ error: "glama_claim_not_configured" }), {
          status: 404,
          headers: { "Content-Type": "application/json", ...cors },
        });
      }
      return new Response(JSON.stringify({
        "$schema": "https://glama.ai/mcp/schemas/connector.json",
        "claim": env.GLAMA_CLAIM,
      }, null, 2), {
        headers: { "Content-Type": "application/json", ...cors },
      });
    }

    let premiumPaid = false;

    // SIWX: grant access if client presents a valid SIGN-IN-WITH-X header
    // from a wallet that has already paid. No new payment required.
    if (req.headers.get("SIGN-IN-WITH-X") && env.PAYMENT_REPLAY) {
      try {
        const siwxHeader = req.headers.get("SIGN-IN-WITH-X");
        const siwxPayload = parseSIWxHeader(siwxHeader);
        const siwxValidation = await validateSIWxMessage(siwxPayload, new URL(req.url));
        const siwxValid = siwxValidation.isValid !== false && !siwxValidation.invalidMessage;
        if (siwxValid) {
          const siwxVerify = await verifySIWxSignature(siwxPayload);
          if (siwxVerify.isValid && siwxVerify.payer) {
            const siwxStore = new KVSIWxStorage(env.PAYMENT_REPLAY);
            const siwxPaid = await siwxStore.hasPaid("/premium/mcp", siwxVerify.payer);
            if (siwxPaid) {
              premiumPaid = true;
            }
          }
        }
      } catch (e) {
        console.error("SIWX_VERIFY_FAILED:", e && e.message ? e.message : String(e));
      }
    }

    if (url.pathname === "/premium/mcp") {

    // ─── FREE PREVIEW: tools/list without payment ────────────────────────
    // Agents must see what they're buying before they pay.
    if (url.pathname === "/premium/mcp" && req.method === "POST") {
      const previewBody = await req.clone().text();
      try {
        const rpc = JSON.parse(previewBody);
        // Free: explain_pricing is always free
        if (rpc.method === "tools/call" && rpc.params && rpc.params.name === "explain_pricing") {
          return new Response(JSON.stringify({
            jsonrpc: "2.0",
            id: rpc.id ?? null,
            result: await toolExplainPricing(env),
          }), { headers: { "Content-Type": "application/json", ...cors } });
        }
        if (rpc.method === "tools/list") {
          return new Response(JSON.stringify({
            jsonrpc: "2.0",
            id: rpc.id ?? null,
            result: {
              tools: TOOLS,
              _preview: {
                note: "Free catalog preview. Calling any tool costs 0.01 USDC on Base.",
                pricing: {
                  scheme: "exact",
                  network: "base",
                  asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
                  amount: "10000",
                  payTo: "0x3EE508f75342315164301B2282f302DF3d3beD47",
                  maxTimeoutSeconds: 60,
                },
                how_to_pay: "POST /premium/mcp with X-PAYMENT header (EIP-712 TransferWithAuthorization)",
              },
            },
          }, null, 2), { headers: { "Content-Type": "application/json", ...cors } });
        }
      } catch {}
    }


      const payment = req.headers.get("X-PAYMENT");


      // ── No payment: 402 challenge ──

      if (!payment) {

        const accepts = [

          {

            scheme: "exact",

            network: "base",

            maxAmountRequired: "10000",

            amount: "10000",

            resource: "https://volatiai-mcp.fourieranalys.workers.dev/premium/mcp",

            description: "VolatiAI premium signals — $0.01 per request, USDC on Base",

            mimeType: "application/json",

            payTo: "0x3EE508f75342315164301B2282f302DF3d3beD47",

            maxTimeoutSeconds: 60,

            asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",

            extra: { name: "USD Coin", version: "2" },
          extensions: {
          bazaar: BAZAAR_EXT,
          ...declareSIWxExtension({
            statement: "Sign in with your wallet to access previously purchased content",
            network: ["eip155:8453", "eip155:5042", "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp"],
            expirationSeconds: 3600,
          })
        }

          },
        {

            scheme: "exact",

            network: "eip155:5042",

            maxAmountRequired: "10000",

            amount: "10000",

            resource: "https://volatiai-mcp.fourieranalys.workers.dev/premium/mcp",

            description: "VolatiAI premium signals — $0.01 per request, USDC on Arc",

            mimeType: "application/json",

            payTo: "0x3EE508f75342315164301B2282f302DF3d3beD47",

            maxTimeoutSeconds: 60,

            asset: "0x3600000000000000000000000000000000000000",

            extra: { name: "USDC", version: "2" },
          extensions: {
          bazaar: BAZAAR_EXT,
          ...declareSIWxExtension({
            statement: "Sign in with your wallet to access previously purchased content",
            network: ["eip155:8453", "eip155:5042", "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp"],
            expirationSeconds: 3600,
          })
        }

          }

        ];

        const requirement = {
          x402Version: 2,
          error: "Payment required",
          resource: {
            url: RESOURCE_URL,
            description: "VolatiAI premium signals — signed, verifiable, $0.01 per call",
            mimeType: "application/json",
          },
          accepts,
          extensions: {
          bazaar: BAZAAR_EXT,
          ...declareSIWxExtension({
            statement: "Sign in with your wallet to access previously purchased content",
            network: ["eip155:8453", "eip155:5042", "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp"],
            expirationSeconds: 3600,
          })
        },
        };

        const header = btoa(unescape(encodeURIComponent(JSON.stringify(requirement))));

        return new Response(JSON.stringify(requirement), {

          status: 402,

          headers: { "Content-Type": "application/json", "PAYMENT-REQUIRED": header, ...cors }

        });

      }


      // ── Payment present: parse and settle via Circle ──

      let decoded;

      try {

        decoded = JSON.parse(atob(payment));

      } catch (e) {

        return new Response(JSON.stringify({ error: "invalid_payment_base64" }), {

          status: 400, headers: { "Content-Type": "application/json", ...cors }

        });

      }


      if (!decoded.authorization && !decoded.payload?.authorization) {

        return new Response(JSON.stringify({ error: "missing_authorization" }), {

          status: 400, headers: { "Content-Type": "application/json", ...cors }

        });

      }


      const network = decoded.network || "base";

      const ACCEPTS_MAP = {

        "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp": {
          scheme: "exact", network: "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp",
          maxAmountRequired: "10000", amount: "10000",
          resource: "https://volatiai-mcp.fourieranalys.workers.dev/premium/mcp",
          description: "VolatiAI premium signals — USDC on Solana",
          mimeType: "application/json",
          payTo: "0x3EE508f75342315164301B2282f302DF3d3beD47",
          maxTimeoutSeconds: 60,
          asset: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
          extra: { name: "USDC", version: "2" },
        },
        "eip155:5042": {

          scheme: "exact", network: "eip155:5042",

          maxAmountRequired: "10000", amount: "10000",

          resource: "https://volatiai-mcp.fourieranalys.workers.dev/premium/mcp",

          description: "VolatiAI premium signals — USDC on Arc",

          mimeType: "application/json",

          payTo: "0x3EE508f75342315164301B2282f302DF3d3beD47",

          maxTimeoutSeconds: 60,

          asset: "0x3600000000000000000000000000000000000000",

          extra: { name: "USDC", version: "2" },
          extensions: {
          bazaar: BAZAAR_EXT,
          ...declareSIWxExtension({
            statement: "Sign in with your wallet to access previously purchased content",
            network: ["eip155:8453", "eip155:5042", "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp"],
            expirationSeconds: 3600,
          })
        }

        },

        "base": {

          scheme: "exact", network: "base",

          maxAmountRequired: "10000", amount: "10000",

          resource: "https://volatiai-mcp.fourieranalys.workers.dev/premium/mcp",

          description: "VolatiAI premium signals — USDC on Base",

          mimeType: "application/json",

          payTo: "0x3EE508f75342315164301B2282f302DF3d3beD47",

          maxTimeoutSeconds: 60,

          asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",

          extra: { name: "USD Coin", version: "2" },
          extensions: {
          bazaar: BAZAAR_EXT,
          ...declareSIWxExtension({
            statement: "Sign in with your wallet to access previously purchased content",
            network: ["eip155:8453", "eip155:5042", "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp"],
            expirationSeconds: 3600,
          })
        }

        }

      };


      const paymentReq = ACCEPTS_MAP[network];

      if (!paymentReq) {

        return new Response(JSON.stringify({

          x402Version: 2, error: "unsupported_network",

          detail: "Network " + network + " not supported",

          accepts: Object.values(ACCEPTS_MAP)

        }), { status: 402, headers: { "Content-Type": "application/json", ...cors } });

      }


      const FACILITATOR_URL = env.FACILITATOR_URL || "https://api.cdp.coinbase.com/platform/v2/x402/settle";

      const settleHeaders = {
        "Content-Type": "application/json",
        "User-Agent": "VolatiAI/1.0 (+https://volatiai-mcp.fourieranalys.workers.dev)",
        "Accept": "application/json",
        "Authorization": "Bearer " + (await cdpJwt(env, "POST", "/platform/v2/x402/settle")),
      };

      /* XPay requires no auth */


      let settleResult;

      try {

                // Network pinning: reject buyers who claim a network we don't serve.
        // The buyer's EIP-712 signature is bound to a specific chainId, so
        // coercing the network here would silently break settlement.
        const SUPPORTED_NETWORKS = new Set(["base", "base-sepolia"]);  // add "base-sepolia" to test on testnet
        const claimedNetwork = decoded.network || "base";
        if (!SUPPORTED_NETWORKS.has(claimedNetwork)) {
          return new Response(JSON.stringify({
            x402Version: 1,
            error: "unsupported_network",
            detail: `This facilitator supports: ${[...SUPPORTED_NETWORKS].join(", ")}`,
          }), { status: 402, headers: { "Content-Type": "application/json", ...cors } });
        }

        // Replay protection
        // Rate limit: 20 calls/min per payer. Blocks runaway agents before CDP is called.
        // Trade-off: 1 KV get + 1 put per request. On free tier (1,000 writes/day)
        // that caps throughput at ~250 calls/day. Raise limit or move to Durable
        // Objects when on Workers Paid.
        const payerAddr = decoded && decoded.payload && decoded.payload.authorization && decoded.payload.authorization.from;
        if (env.PAYMENT_REPLAY && payerAddr) {
          const minuteBucket = Math.floor(Date.now() / 60000);
          const rlKey = "rl:" + payerAddr.toLowerCase() + ":" + minuteBucket;
          const currentCount = parseInt((await env.PAYMENT_REPLAY.get(rlKey)) || "0", 10);
          if (currentCount >= 20) {
            const secsLeft = 60 - Math.floor(Date.now() / 1000) % 60;
            return new Response(JSON.stringify({
              x402Version: 1,
              error: "rate_limited",
              detail: "Max 20 calls/minute per payer. Retry in " + secsLeft + "s.",
            }), {
              status: 429,
              headers: {
                "Content-Type": "application/json",
                "Retry-After": String(secsLeft),
                ...cors,
              },
            });
          }
          ctx.waitUntil(
            env.PAYMENT_REPLAY.put(rlKey, String(currentCount + 1), { expirationTtl: 120 })
          );
        }


        var sig = decoded.payload && decoded.payload.signature;
        var nonce = decoded.payload && decoded.payload.authorization && decoded.payload.authorization.nonce;
        var validBefore = Number(
          (decoded.payload && decoded.payload.authorization && decoded.payload.authorization.validBefore) || 0
        );
        var replayTtl = Math.max(60, validBefore - Math.floor(Date.now() / 1000) + 60);

        if (env.PAYMENT_REPLAY && nonce) {
          const nonceKey = "nonce:" + nonce.toLowerCase();
          const seen = await env.PAYMENT_REPLAY.get(nonceKey);
          if (seen) {
            return new Response(JSON.stringify({
              x402Version: 1,
              error: "payment_already_used",
              detail: "This payment signature has already been submitted.",
            }), { status: 402, headers: { "Content-Type": "application/json", ...cors } });
          }
        }

const settleResp = await fetchWithRetry(FACILITATOR_URL, {

          method: "POST",

          headers: settleHeaders,

          body: JSON.stringify({x402Version: 1, paymentPayload: {x402Version: 1, scheme: decoded.scheme || "exact", network: claimedNetwork, payload: decoded.payload}, paymentRequirements: {...paymentReq, network: claimedNetwork}}),

          signal: AbortSignal.timeout(30000)

        });

        settleResult = await settleResp.json();
        console.log("SETTLE_RESULT:", JSON.stringify({
          httpStatus: settleResp.status,
          success: !!settleResult.success,
          transaction: settleResult.transaction || null,
          network: settleResult.network || null,
          errorReason: settleResult.errorReason || null,
          tool: (typeof rpc !== "undefined" && rpc && rpc.params && rpc.params.name) || null,
          payer: (decoded && decoded.payload && decoded.payload.authorization && decoded.payload.authorization.from) || null,
          ts: new Date().toISOString(),
        }));

      } catch (e) {

        return new Response(JSON.stringify({

          x402Version: 2, error: "facilitator_unreachable",

          detail: (err && err.message) ? ("Settlement failed: " + err.message) : "Settlement service unavailable. No payment settled. Try again.",

          resource: paymentReq

        }), { status: 402, headers: { "Content-Type": "application/json", ...cors } });

      }


      if (settleResult.success === true) {
        // SINGLE-LINE diagnostic — always shows in wrangler tail
        try {
          const __dbg = {
            dt: typeof decoded,
            dk: decoded ? Object.keys(decoded).join(",") : "null",
            pk: decoded && decoded.payload ? Object.keys(decoded.payload).join(",") : "null",
            ak: decoded && decoded.payload && decoded.payload.authorization ? Object.keys(decoded.payload.authorization).join(",") : "null",
            kv: !!env.PAYMENT_REPLAY,
            ctx: typeof ctx,
          };
          const siwxPayerAddr = decoded && decoded.payload && decoded.payload.authorization && decoded.payload.authorization.from;
          __dbg.payer = siwxPayerAddr || null;
          if (siwxPayerAddr && env.PAYMENT_REPLAY) {
            const siwxRecStore = new KVSIWxStorage(env.PAYMENT_REPLAY);
            await siwxRecStore.recordPayment("/premium/mcp", siwxPayerAddr);
            __dbg.wrote = true;
          }
          // Silent on success; log only errors below.
        } catch (e) {
          console.log("SIWX_DIAG_ERR|" + String(e && e.message || e));
        }

          // NOTE: nonce KV write removed — on-chain USDC contracts reject replay natively.
          // If a buyer replays a nonce, CDP's settle endpoint returns nonce_already_used.
          // Removing this saves ~1 KV write per paid call, avoiding quota exhaustion.


        premiumPaid = true;

      } else if (settleResult.errorReason === "settlement_pending") {

        return new Response(JSON.stringify({

          x402Version: 2, error: "settlement_pending",

          detail: "Settlement pending (not on-chain). Do not retry with same X-PAYMENT.",

          resource: paymentReq

        }), { status: 402, headers: { "Content-Type": "application/json", ...cors } });

      } else {
        const reason = settleResult.errorReason
                     || settleResult.errorMessage
                     || settleResult.error
                     || settleResult.message
                     || "settlement_failed";

        return new Response(JSON.stringify({

          x402Version: 2, error: reason,

          detail: "Payment settlement failed: " + reason,

          resource: paymentReq

        }), { status: 402, headers: { "Content-Type": "application/json", "Retry-After": "5", ...cors } });

      }

    }



    if (url.pathname === "/mcp" || premiumPaid) {
    // ─── PAYMENT GATE for /mcp ─────────────────────────────────────────
    // tools/list, initialize, notifications/*, and explain_pricing are free.
    // Everything else (tools/call with a real tool) requires X-PAYMENT via /premium/mcp.
    if (url.pathname === "/mcp" && req.method === "POST") {
      const gateBody = await req.clone().text();
      try {
        const gateRpc = JSON.parse(gateBody);
        const freeMethods = ["initialize", "notifications/initialized", "notifications/cancelled", "ping", "tools/list"];
        const isFreeMethod = freeMethods.includes(gateRpc.method);
        const isFreeTool = gateRpc.method === "tools/call"
          && gateRpc.params
          && gateRpc.params.name === "explain_pricing";
        if (!isFreeMethod && !isFreeTool) {
          return new Response(JSON.stringify({
            x402Version: 1,
            error: "Payment required",
            detail: "Free tier: initialize, notifications/*, tools/list, explain_pricing. Paid tier: all tools/call. Use POST /premium/mcp with X-PAYMENT header for paid tools.",
            payment_endpoint: "https://volatiai-mcp.fourieranalys.workers.dev/premium/mcp",
            discovery: "https://volatiai-mcp.fourieranalys.workers.dev/.well-known/x402",
          }, null, 2), {
            status: 402,
            headers: { "Content-Type": "application/json", ...cors },
          });
        }
      } catch {}
    }

      if (req.method !== "POST") return new Response("MCP expects POST", { status: 405, headers: cors });
      let body;
      try { body = await req.json(); }
      catch { return new Response(JSON.stringify(jsonRpcError(null, -32700, "Parse error")), { status: 400, headers: { "Content-Type": "application/json", ...cors } }); }
      const messages = Array.isArray(body) ? body : [body];
      const responses = [];
      for (const msg of messages) {
        const resp = await handleRPC(msg, env);
        if (resp !== null) responses.push(resp);
      }
      const out = responses.length === 1 ? responses[0] : responses;
      return new Response(JSON.stringify(out), { headers: { "Content-Type": "application/json", ...cors } });
    }

    return new Response("Not found", { status: 404, headers: cors });
  },
};

// deploy-marker: 20261109T160031Z
