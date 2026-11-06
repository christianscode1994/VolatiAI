const SECTOR = "vehicles";

function envelope({ has_signal, summary, context, sources }) {
  return new Response(JSON.stringify({
    sector: SECTOR,
    has_signal,
    density: "sparse",
    severity: has_signal ? "notice" : "info",
    confidence: sources.healthy / Math.max(sources.total, 1),
    timestamp: new Date().toISOString(),
    summary: has_signal ? summary : "quiet",
    delta: null,
    context: context || {},
    sources,
    ttl_seconds: 3600,
  }), { headers: { "content-type": "application/json" } });
}

async function fetchSafe(fn) {
  try { return { ok: true, data: await fn() }; }
  catch (e) { return { ok: false, error: String(e).slice(0, 120) }; }
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

    const eventSrc = result.sources["nhtsa_recall"];
    const event = eventSrc && eventSrc.ok ? eventSrc.data : null;

    if (!event || !event.id) {
      return envelope({
        has_signal: false,
        sources: { total, healthy, failed: Object.entries(result.sources).filter(([, v]) => !v.ok).map(([k]) => k) },
      });
    }

    const lastSeen = await env.SECTOR_KV.get("vehicles_last_event");
    const isNew = String(lastSeen) !== String(event.id);
    if (isNew) {
      await env.SECTOR_KV.put("vehicles_last_event", String(event.id), { expirationTtl: 2592000 });
    }

    return envelope({
      has_signal: isNew,
      summary: isNew ? "New: " + (event.title || event.id) : "quiet",
      context: { last_event_id: lastSeen || null, current_id: event.id },
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
      nhtsa_recall: await fetchSafe(async () => {
        const r = await fetch('https://api.nhtsa.gov/recalls/recallsByVehicle?make=honda&model=civic&modelYear=2024');
        if (!r.ok) throw new Error('status ' + r.status);
        const j = await r.json();
        if (!j.results || !j.results.length) throw new Error('no recalls');
        const r0 = j.results[0];
        return {
          id: r0.NHTSACampaignNumber || r0.nhtsaCampaignNumber || 'unknown',
          title: (r0.Component || 'Recall') + ' — ' + (r0.Summary || '').slice(0, 80)
        };
      })
    },
  };
}
