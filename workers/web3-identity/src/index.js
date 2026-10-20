const COMMON_HEADERS = {
  "accept": "application/json",
  "user-agent": "VolatiAI/1.0 (+https://volatiai.com)",
};

async function fetchSource(name, fn) {
  try {
    const data = await fn();
    return { name, ok: true, data, error: null };
  } catch (e) {
    return { name, ok: false, data: null, error: e.message || e.name || "unknown" };
  }
}

async function resolveIdentity(identity) {
  const r = await fetch(
    `https://api.web3.bio/profile/${encodeURIComponent(identity)}`,
    { headers: COMMON_HEADERS, signal: AbortSignal.timeout(8000) }
  );
  if (!r.ok) {
    const body = await r.text().catch(() => "");
    throw new Error(`http_${r.status}: ${body.slice(0, 120)}`);
  }
  const profiles = await r.json();
  if (!Array.isArray(profiles) || !profiles.length) return null;
  const p = profiles[0];
  return {
    identity:    p.identity,
    address:     p.address,
    platform:    p.platform,
    displayName: p.displayName,
    avatar:      p.avatar,
    description: p.description,
    links:       p.links ? Object.keys(p.links) : [],
  };
}

async function readArweaveTx(txId) {
  const r = await fetch(
    `https://arweave.net/tx/${encodeURIComponent(txId)}`,
    { headers: COMMON_HEADERS, signal: AbortSignal.timeout(8000) }
  );
  if (!r.ok) {
    const body = await r.text().catch(() => "");
    throw new Error(`http_${r.status}: ${body.slice(0, 120)}`);
  }
  const j = await r.json();
  let decoded = null;
  if (j.data) { try { decoded = atob(j.data); } catch {} }
  return {
    id:      j.id,
    owner:   j.owner,
    tags:    (j.tags || []).map(t => ({ name: t.name, value: t.value })),
    dataLen: decoded ? decoded.length : null,
    preview: decoded ? decoded.slice(0, 120) : null,
  };
}

async function queryArweaveTags(tags) {
  const query = `
    query($tags: [TagFilter!]!) {
      transactions(tags: $tags, first: 10, sort: HEIGHT_DESC) {
        edges { node { id tags { name value } block { height timestamp } } }
      }
    }
  `;
  const r = await fetch("https://arweave.net/graphql", {
    method: "POST",
    headers: { ...COMMON_HEADERS, "content-type": "application/json" },
    body: JSON.stringify({ query, variables: { tags } }),
    signal: AbortSignal.timeout(10000),
  });
  if (!r.ok) {
    const body = await r.text().catch(() => "");
    throw new Error(`http_${r.status}: ${body.slice(0, 120)}`);
  }
  const j = await r.json();
  if (j.errors) throw new Error(`graphql_error: ${JSON.stringify(j.errors).slice(0, 120)}`);
  return (j.data?.transactions?.edges || []).map(e => e.node);
}

async function readIPFS(cid) {
  const r = await fetch(
    `https://ipfs.io/ipfs/${encodeURIComponent(cid)}`,
    { headers: COMMON_HEADERS, signal: AbortSignal.timeout(10000) }
  );
  if (!r.ok) {
    const body = await r.text().catch(() => "");
    throw new Error(`http_${r.status}: ${body.slice(0, 120)}`);
  }
  const text = await r.text();
  return { cid, bytes: text.length, preview: text.slice(0, 200) };
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/web3-identity/raw") {
      const identity = url.searchParams.get("identity") || "vitalik.eth";
      const txId     = url.searchParams.get("tx");
      const cid      = url.searchParams.get("cid");
      const tagName  = url.searchParams.get("tagName") || "App-Name";
      const tagValue = url.searchParams.get("tagValue") || "VolatiAI";

      const sources = {};
      sources.profile = await fetchSource("web3.bio", () => resolveIdentity(identity));
      sources.arweave = await fetchSource("arweave.tx", () =>
        txId ? readArweaveTx(txId) : Promise.resolve(null));
      sources.arweave_tags = await fetchSource("arweave.graphql", () =>
        queryArweaveTags([{ name: tagName, values: [tagValue] }]));
      sources.ipfs = await fetchSource("ipfs.gateway", () =>
        cid ? readIPFS(cid) : Promise.resolve(null));

      return Response.json({
        sector: "web3-identity",
        ts: new Date().toISOString(),
        inputs: { identity, txId, cid, tagName, tagValue },
        sources,
      });
    }
    return new Response("Not found", { status: 404 });
  },
};
