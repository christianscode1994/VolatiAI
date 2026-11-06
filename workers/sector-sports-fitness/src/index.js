const SECTOR = "sports-fitness";

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
    ttl_seconds: 1800,
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

    const eventSrc = result.sources["espn_news"];
    const event = eventSrc && eventSrc.ok ? eventSrc.data : null;

    if (!event || !event.id) {
      return envelope({
        has_signal: false,
        sources: { total, healthy, failed: Object.entries(result.sources).filter(([, v]) => !v.ok).map(([k]) => k) },
      });
    }

    const lastSeen = await env.SECTOR_KV.get("sports-fitness_last_event");
    const isNew = String(lastSeen) !== String(event.id);
    if (isNew) {
      await env.SECTOR_KV.put("sports-fitness_last_event", String(event.id), { expirationTtl: 2592000 });
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
      espn_news: await fetchSafe(async () => {
        const r = await fetch('https://www.espn.com/espn/rss/news');
        if (!r.ok) throw new Error('status ' + r.status);
        const text = await r.text();
        const itemMatches = text.match(/<item>[\s\S]*?<\/item>/g);
        if (!itemMatches || !itemMatches.length) throw new Error('no items');
        const first = itemMatches[0];
        const titleMatch = first.match(/<title>(?:<!\[CDATA\[)?([^<\]]+)/);
        const linkMatch = first.match(/<link>([^<]+)<\/link>/) || first.match(/<guid[^>]*>([^<]+)<\/guid>/);
        if (!titleMatch) throw new Error('no title');
        return {
          id: (linkMatch ? linkMatch[1] : titleMatch[1]).trim().slice(0, 80),
          title: titleMatch[1].trim().slice(0, 100)
        };
      })
    },
  };
}
