const UA = { "user-agent": "VolatiAI/1.0", "accept": "application/json" };

async function fetchSafe(name, fn) {
  try {
    const data = await fn();
    return { name, ok: true, data, error: null };
  } catch (e) {
    return { name, ok: false, data: null, error: e.message || "unknown" };
  }
}

// LayerZero Scan — public, no auth, no published throttling
async function layerZeroLatest() {
  const r = await fetch("https://scan.layerzero-api.com/v1/messages/latest", {
    headers: UA,
    signal: AbortSignal.timeout(10000),
  });
  if (!r.ok) throw new Error("http_" + r.status);
  const j = await r.json();
  const messages = Array.isArray(j) ? j : (j.data ?? []);
  return {
    count: messages.length,
    sample: messages.slice(0, 5).map(m => ({
      guid: m.guid ?? null,
      srcEid: m.srcEid ?? null,
      dstEid: m.dstEid ?? null,
      status: m.status?.name ?? m.status ?? null,
    })),
  };
}

// Wormholescan — public VAA endpoint
async function wormholeRecentVaas() {
  const r = await fetch("https://api.wormholescan.io/api/v1/vaas?limit=10", {
    headers: UA,
    signal: AbortSignal.timeout(10000),
  });
  if (!r.ok) throw new Error("http_" + r.status);
  const j = await r.json();
  const vaas = Array.isArray(j) ? j : (j.data ?? []);
  return {
    count: vaas.length,
    sample: vaas.slice(0, 5).map(v => ({
      id: v.id ?? null,
      emitterChain: v.emitterChain ?? null,
      sequence: v.sequence ?? null,
      timestamp: v.timestamp ?? null,
    })),
  };
}

// Axelarscan GMP — public search for recent executed messages
async function axelarRecentGmp() {
  const r = await fetch(
    "https://api.axelarscan.io/gmp/searchGMP?size=10",
    { headers: UA, signal: AbortSignal.timeout(10000) }
  );
  if (!r.ok) throw new Error("http_" + r.status);
  const j = await r.json();
  const rows = Array.isArray(j) ? j : (j.data ?? []);
  return {
    count: rows.length,
    sample: rows.slice(0, 5).map(x => ({
      messageId: x.message_id ?? x.id ?? null,
      sourceChain: x.source_chain ?? null,
      destinationChain: x.destination_chain ?? null,
      status: x.status ?? null,
    })),
  };
}

export default {
  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname !== "/interop/raw") {
      return new Response("Not found", { status: 404 });
    }

    const [layerzero, wormhole, axelar] = await Promise.all([
      fetchSafe("layerzero", layerZeroLatest),
      fetchSafe("wormhole", wormholeRecentVaas),
      fetchSafe("axelar", axelarRecentGmp),
    ]);

    return Response.json({
      sector: "interop-messaging",
      ts: new Date().toISOString(),
      sources: { layerzero, wormhole, axelar },
    });
  },
};
