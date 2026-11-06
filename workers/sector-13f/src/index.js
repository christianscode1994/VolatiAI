const SECTOR = "13f-holdings";

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

async function latest13F() {
  const r = await fetch(
    "https://www.sec.gov/cgi-bin/browse-edgar?action=getcurrent&type=13F-HR&company=&dateb=&owner=include&count=10&output=atom",
    { headers: { "User-Agent": "VolatiAI/1.0 (ops@volatiai.example)" } }
  );
  if (!r.ok) throw new Error("status " + r.status);
  const xml = await r.text();
  const entryMatch = xml.match(/<entry>([\s\S]*?)<\/entry>/);
  if (!entryMatch) throw new Error("no entries");
  const entry = entryMatch[1];
  const idMatch = entry.match(/<id>([^<]+)<\/id>/);
  const titleMatch = entry.match(/<title>([^<]+)<\/title>/);
  const linkMatch = entry.match(/<link[^>]*href="([^"]+)"/);
  const updatedMatch = entry.match(/<updated>([^<]+)<\/updated>/);
  return {
    id: idMatch ? idMatch[1] : null,
    title: titleMatch ? titleMatch[1].trim().replace(/\s+/g, " ") : "unknown",
    updated: updatedMatch ? updatedMatch[1] : null,
    link: linkMatch ? linkMatch[1] : null,
  };
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

    const eventSrc = result.sources["sec_13f_recent"];
    const event = eventSrc && eventSrc.ok ? eventSrc.data : null;

    if (!event || !event.id) {
      return envelope({
        has_signal: false,
        sources: { total, healthy, failed: Object.entries(result.sources).filter(([, v]) => !v.ok).map(([k]) => k) },
      });
    }

    const lastSeen = await env.SECTOR_KV.get("13f_last_event");
    const isNew = String(lastSeen) !== String(event.id);
    if (isNew) {
      await env.SECTOR_KV.put("13f_last_event", String(event.id), { expirationTtl: 2592000 });
    }

    return envelope({
      has_signal: isNew,
      summary: isNew ? "New 13F: " + event.title : "quiet",
      context: { last_event_id: lastSeen || null, current_id: event.id, link: event.link, updated: event.updated },
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
      sec_13f_recent: await fetchSafe(latest13F),
    },
  };
}
