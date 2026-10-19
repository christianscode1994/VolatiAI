// sector-sparse: consolidated worker for all sparse/event sectors
// Routes: /{sector}/signal, /{sector}/raw, /{sector}/health

async function fetchSafe(fn) {
  try { return { ok: true, data: await fn() }; }
  catch (e) { return { ok: false, error: String(e).slice(0, 120) }; }
}

function ghHeaders(env) {
  const h = { 'user-agent': 'VolatiAI/1.0', 'accept': 'application/vnd.github+json' };
  if (env.GITHUB_TOKEN) h['authorization'] = 'Bearer ' + env.GITHUB_TOKEN;
  return h;
}

function parseRSSFirstItem(text) {
  const items = text.match(/<item>[\s\S]*?<\/item>/g);
  if (!items || !items.length) throw new Error('no items');
  const first = items[0];
  const titleMatch = first.match(/<title>(?:<!\[CDATA\[)?([^<\]\>]+)/);
  const linkMatch = first.match(/<link>([^<]+)<\/link>/) || first.match(/<guid[^>]*>([^<]+)<\/guid>/);
  if (!titleMatch) throw new Error('no title');
  return {
    id: (linkMatch ? linkMatch[1] : titleMatch[1]).trim().slice(0, 80),
    title: titleMatch[1].trim().slice(0, 100),
  };
}

// ─── COLLECTORS ─────────────────────────────────────────────

const COLLECTORS = {
  develop: {
    event_source: "ethereum_release",
    ttl: 3600,
    collectAll: async (env) => ({
      sources: {
        ethereum_release: await fetchSafe(async () => {
          const r = await fetch('https://api.github.com/repos/ethereum/go-ethereum/releases?per_page=1', { headers: ghHeaders(env) });
          if (!r.ok) throw new Error('status ' + r.status);
          const j = await r.json();
          if (!Array.isArray(j) || !j[0]) throw new Error('no release');
          return { id: j[0].id, title: j[0].name || j[0].tag_name };
        }),
      },
    }),
  },

  news: {
    event_source: "hn_top",
    ttl: 1800,
    collectAll: async (env) => ({
      sources: {
        hn_top: await fetchSafe(async () => {
          const r = await fetch('https://hacker-news.firebaseio.com/v0/topstories.json');
          const ids = await r.json();
          if (!Array.isArray(ids) || !ids.length) throw new Error('no ids');
          const detail = await fetch('https://hacker-news.firebaseio.com/v0/item/' + ids[0] + '.json');
          const s = await detail.json();
          if (!s || !s.title) throw new Error('no story');
          return { id: s.id, title: s.title.slice(0, 100) };
        }),
      },
    }),
  },

  jobs: {
    event_source: "remoteok_latest",
    ttl: 3600,
    collectAll: async (env) => ({
      sources: {
        remoteok_latest: await fetchSafe(async () => {
          const r = await fetch('https://remoteok.com/api', { headers: { 'user-agent': 'VolatiAI/1.0' } });
          if (!r.ok) throw new Error('status ' + r.status);
          const jobs = await r.json();
          if (!Array.isArray(jobs) || jobs.length < 2) throw new Error('no jobs');
          const job = jobs[1];
          return { id: job.id, title: (job.position || 'job') + ' @ ' + (job.company || '?') };
        }),
      },
    }),
  },

  "open-source": {
    event_source: "vscode_release",
    ttl: 3600,
    collectAll: async (env) => ({
      sources: {
        vscode_release: await fetchSafe(async () => {
          const r = await fetch('https://api.github.com/repos/microsoft/vscode/releases?per_page=1', { headers: ghHeaders(env) });
          if (!r.ok) throw new Error('status ' + r.status);
          const j = await r.json();
          if (!Array.isArray(j) || !j[0]) throw new Error('no release');
          return { id: j[0].id, title: (j[0].name || j[0].tag_name) + ' (vscode)' };
        }),
      },
    }),
  },

  "science-math": {
    event_source: "arxiv_math",
    ttl: 3600,
    collectAll: async (env) => ({
      sources: {
        arxiv_math: await fetchSafe(async () => {
          const r = await fetch('http://export.arxiv.org/api/query?search_query=cat:math.*&sortBy=submittedDate&sortOrder=descending&max_results=1');
          if (!r.ok) throw new Error('status ' + r.status);
          const text = await r.text();
          const idM = text.match(/<entry>[\s\S]*?<id>([^<]+)<\/id>/);
          const titleM = text.match(/<entry>[\s\S]*?<title>([^<]+)<\/title>/);
          if (!idM || !titleM) throw new Error('no entry');
          return { id: idM[1].trim(), title: titleM[1].trim().replace(/\s+/g, ' ').slice(0, 100) };
        }),
      },
    }),
  },

  security: {
    event_source: "cisa_kev",
    ttl: 3600,
    collectAll: async (env) => ({
      sources: {
        cisa_kev: await fetchSafe(async () => {
          const r = await fetch('https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json');
          if (!r.ok) throw new Error('status ' + r.status);
          const j = await r.json();
          if (!j.vulnerabilities?.length) throw new Error('no vulns');
          const v = j.vulnerabilities[0];
          return { id: v.cveID, title: v.cveID + ' — ' + (v.vulnerabilityName || 'CISA KEV') };
        }),
      },
    }),
  },

  education: {
    event_source: "arxiv_edu",
    ttl: 3600,
    collectAll: async (env) => ({
      sources: {
        arxiv_edu: await fetchSafe(async () => {
          const r = await fetch('http://export.arxiv.org/api/query?search_query=cat:cs.CY&sortBy=submittedDate&sortOrder=descending&max_results=1');
          if (!r.ok) throw new Error('status ' + r.status);
          const text = await r.text();
          const idM = text.match(/<entry>[\s\S]*?<id>([^<]+)<\/id>/);
          const titleM = text.match(/<entry>[\s\S]*?<title>([^<]+)<\/title>/);
          if (!idM || !titleM) throw new Error('no entry');
          return { id: idM[1].trim(), title: titleM[1].trim().replace(/\s+/g, ' ').slice(0, 100) };
        }),
      },
    }),
  },

  events: {
    event_source: "hn_new",
    ttl: 1800,
    collectAll: async (env) => ({
      sources: {
        hn_new: await fetchSafe(async () => {
          const r = await fetch('https://hacker-news.firebaseio.com/v0/newstories.json');
          const ids = await r.json();
          if (!Array.isArray(ids) || !ids.length) throw new Error('no ids');
          const detail = await fetch('https://hacker-news.firebaseio.com/v0/item/' + ids[0] + '.json');
          const s = await detail.json();
          if (!s || !s.title) throw new Error('no story');
          return { id: s.id, title: s.title.slice(0, 100) };
        }),
      },
    }),
  },

  "sports-fitness": {
    event_source: "espn_news",
    ttl: 1800,
    collectAll: async (env) => ({
      sources: {
        espn_news: await fetchSafe(async () => {
          const r = await fetch('https://www.espn.com/espn/rss/news');
          if (!r.ok) throw new Error('status ' + r.status);
          return parseRSSFirstItem(await r.text());
        }),
      },
    }),
  },

  vehicles: {
    event_source: "nhtsa_recall",
    ttl: 3600,
    collectAll: async (env) => ({
      sources: {
        nhtsa_recall: await fetchSafe(async () => {
          const r = await fetch('https://api.nhtsa.gov/recalls/recallsByVehicle?make=honda&model=civic&modelYear=2024');
          if (!r.ok) throw new Error('status ' + r.status);
          const j = await r.json();
          if (!j.results?.length) throw new Error('no recalls');
          const r0 = j.results[0];
          return {
            id: r0.NHTSACampaignNumber || 'unknown',
            title: (r0.Component || 'Recall') + ' — ' + (r0.Summary || '').slice(0, 80),
          };
        }),
      },
    }),
  },

  books: {
    event_source: "openlibrary_recent",
    ttl: 3600,
    collectAll: async (env) => ({
      sources: {
        openlibrary_recent: await fetchSafe(async () => {
          const y = new Date().getFullYear();
          const q = 'first_publish_year:' + y;
          const r = await fetch('https://openlibrary.org/search.json?q=' + encodeURIComponent(q) + '&sort=new&limit=1');
          if (!r.ok) throw new Error('status ' + r.status);
          const j = await r.json();
          if (!j.docs?.length) throw new Error('no docs');
          const b = j.docs[0];
          return {
            id: b.key || b.title,
            title: (b.title || 'unknown') + ' — ' + (b.author_name ? b.author_name[0] : 'unknown'),
          };
        }),
      },
    }),
  },

  music: {
    event_source: "deezer_chart",
    ttl: 3600,
    collectAll: async (env) => ({
      sources: {
        deezer_chart: await fetchSafe(async () => {
          const r = await fetch('https://api.deezer.com/chart/0/tracks?limit=1');
          if (!r.ok) throw new Error('status ' + r.status);
          const j = await r.json();
          if (!j.data?.length) throw new Error('no tracks');
          const t = j.data[0];
          return {
            id: String(t.id),
            title: (t.title || 'unknown') + ' — ' + (t.artist ? t.artist.name : 'unknown'),
          };
        }),
      },
    }),
  },
};

// ─── ENVELOPE + ROUTER ──────────────────────────────────────

function buildEventEnvelope(sector, config, result, lastSeen) {
  const sources = result.sources;
  const healthy = Object.values(sources).filter(s => s.ok).length;
  const total = Object.keys(sources).length;
  const failed = Object.entries(sources).filter(([, v]) => !v.ok).map(([k]) => k);

  const eventSrc = sources[config.event_source];
  const event = eventSrc?.ok ? eventSrc.data : null;

  let hasSignal = false, summary = "quiet", context = {};
  if (event && event.id) {
    hasSignal = String(lastSeen) !== String(event.id);
    summary = hasSignal ? "New: " + (event.title || event.id) : "quiet";
    context = { current_event_id: event.id };
  }

  return {
    sector, density: "sparse",
    has_signal: hasSignal,
    severity: hasSignal ? "notice" : "info",
    confidence: healthy / Math.max(total, 1),
    timestamp: new Date().toISOString(),
    summary, delta: null, context,
    sources: { total, healthy, failed },
    ttl_seconds: config.ttl || 3600,
  };
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "content-type": "application/json" },
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const parts = url.pathname.split("/").filter(Boolean);

    if (parts.length === 0) {
      return json({ ok: true, density: "sparse", sectors: Object.keys(COLLECTORS) });
    }

    const sectorName = parts[0];
    const action = parts[1] || "signal";
    const collector = COLLECTORS[sectorName];

    if (!collector) return json({ error: "unknown sector", sector: sectorName }, 404);

    if (action === "health") {
      return json({ ok: true, sector: sectorName, density: "sparse" });
    }

    if (action === "raw") {
      return json(await collector.collectAll(env));
    }

    if (action === "signal") {
      const result = await collector.collectAll(env);
      const kvKey = `${sectorName}_last_event`;
      const lastSeen = await env.SECTOR_KV.get(kvKey);

      const envelope = buildEventEnvelope(sectorName, collector, result, lastSeen);

      // Update KV only if new event
      if (envelope.context.current_event_id) {
        await env.SECTOR_KV.put(kvKey, String(envelope.context.current_event_id), { expirationTtl: 86400 * 30 });
      }

      return json(envelope);
    }

    return json({ error: "not found" }, 404);
  },
};
