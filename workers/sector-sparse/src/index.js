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
    event_source: "hn_significant",
    ttl: 1800,
    collectAll: async (env) => ({
      sources: {
        hn_significant: await fetchSafe(async () => {
          const r = await fetch("https://hacker-news.firebaseio.com/v0/topstories.json");
          const ids = await r.json();
          if (!Array.isArray(ids) || !ids.length) throw new Error("no ids");
          // Check top 5 stories, find first with score >= 200
          for (let i = 0; i < Math.min(5, ids.length); i++) {
            const detail = await fetch("https://hacker-news.firebaseio.com/v0/item/" + ids[i] + ".json");
            const s = await detail.json();
            if (s && s.score >= 200 && s.title) {
              return { id: "hn_" + s.id, title: "[" + s.score + "] " + s.title.slice(0, 90) };
            }
          }
          throw new Error("no significant stories (>200 points) in top 5");
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
  science: {
    event_source: "arxiv_physics",
    ttl: 3600,
    collectAll: async (env) => ({
      sources: {
        arxiv_physics: await fetchSafe(async () => {
          const r = await fetch("http://export.arxiv.org/api/query?search_query=cat:physics.*&sortBy=submittedDate&sortOrder=descending&max_results=1");
          if (!r.ok) throw new Error("status " + r.status);
          const text = await r.text();
          const idM = text.match(/<entry>[\s\S]*?<id>([^<]+)<\/id>/);
          const titleM = text.match(/<entry>[\s\S]*?<title>([^<]+)<\/title>/);
          if (!idM || !titleM) throw new Error("no entry");
          return { id: idM[1].trim(), title: titleM[1].trim().replace(/\s+/g, ' ').slice(0, 100) };
        }),
      },
    }),
  },

  "art-design": {
    event_source: "met_daily",
    ttl: 86400,
    collectAll: async (env) => ({
      sources: {
        met_daily: await fetchSafe(async () => {
          // Deterministic object per day — triggers once per day max
          const dayOfYear = Math.floor((Date.now() - new Date(new Date().getFullYear(), 0, 0)) / 86400000);
          const highlights = [45734, 436532, 436121, 436155, 11417, 436947, 437261, 438814, 436839, 437398];
          const objId = highlights[dayOfYear % highlights.length];
          const r = await fetch(`https://collectionapi.metmuseum.org/public/collection/v1/objects/${objId}`);
          if (!r.ok) throw new Error("status " + r.status);
          const obj = await r.json();
          if (!obj.objectID || !obj.title) throw new Error("no object");
          // ID includes date so it changes once per day
          return {
            id: `met_${objId}_${new Date().toISOString().slice(0, 10)}`,
            title: (obj.title || 'untitled').slice(0, 100) + (obj.artistDisplayName ? ' — ' + obj.artistDisplayName.split('\n')[0].slice(0, 40) : ''),
          };
        }),
      },
    }),
  },

  anime: {
    event_source: "kitsu_latest",
    ttl: 3600,
    collectAll: async (env) => ({
      sources: {
        kitsu_latest: await fetchSafe(async () => {
          const r = await fetch("https://kitsu.io/api/edge/anime?page%5Blimit%5D=1&sort=-created_at", {
            headers: { "accept": "application/vnd.api+json" }
          });
          if (!r.ok) throw new Error("status " + r.status);
          const j = await r.json();
          const item = j.data?.[0];
          if (!item) throw new Error("no anime");
          const title = item.attributes?.canonicalTitle || item.attributes?.titles?.en || 'unknown';
          return { id: String(item.id), title: title.slice(0, 80) };
        }),
      },
    }),
  },

  biology: {
    event_source: "pubmed_latest",
    ttl: 3600,
    collectAll: async (env) => ({
      sources: {
        pubmed_latest: await fetchSafe(async () => {
          const search = await fetch("https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=pubmed&term=biology&retmax=1&sort=pub_date&retmode=json");
          if (!search.ok) throw new Error("status " + search.status);
          const sj = await search.json();
          const id = sj.esearchresult?.idlist?.[0];
          if (!id) throw new Error("no id");
          return { id, title: "PubMed " + id };
        }),
      },
    }),
  },


  earthquakes: {
    event_source: "usgs_significant",
    ttl: 3600,
    collectAll: async (env) => ({
      sources: {
        usgs_significant: await fetchSafe(async () => {
          const r = await fetch("https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/significant_week.geojson");
          if (!r.ok) throw new Error("status " + r.status);
          const j = await r.json();
          if (!j.features?.length) throw new Error("no quakes");
          const q = j.features[0];
          const mag = q.properties.mag;
          const place = q.properties.place || "unknown";
          return { id: q.id, title: `M${mag} — ${place}` };
        }),
      },
    }),
  },

  "food-drink": {
    event_source: "fda_food_recall",
    ttl: 3600,
    collectAll: async (env) => ({
      sources: {
        fda_food_recall: await fetchSafe(async () => {
          const r = await fetch("https://api.fda.gov/food/enforcement.json?limit=1&sort=report_date:desc");
          if (!r.ok) throw new Error("status " + r.status);
          const j = await r.json();
          if (!j.results?.length) throw new Error("no recalls");
          const rec = j.results[0];
          return {
            id: rec.recall_number || rec.event_id || 'unknown',
            title: (rec.product_description || 'Recall').slice(0, 100) + ' — ' + (rec.reason_for_recall || '').slice(0, 60),
          };
        }),
      },
    }),
  },

  health: {
    event_source: "disease_sh",
    ttl: 3600,
    collectAll: async (env) => ({
      sources: {
        disease_sh: await fetchSafe(async () => {
          const r = await fetch("https://disease.sh/v3/covid-19/countries/sweden");
          if (!r.ok) throw new Error("status " + r.status);
          const j = await r.json();
          if (!j.country) throw new Error("no data");
          return { id: `se_${j.cases}_${j.deaths}`, title: `Sweden: ${j.cases} cases, ${j.deaths} deaths` };
        }),
      },
    }),
  },

  space: {
    event_source: "astros_in_space",
    ttl: 86400,
    collectAll: async (env) => ({
      sources: {
        astros_in_space: await fetchSafe(async () => {
          const r = await fetch("http://api.open-notify.org/astros.json");
          if (!r.ok) throw new Error("status " + r.status);
          const j = await r.json();
          if (!Array.isArray(j.people) || !j.people.length) throw new Error("no astronauts");
          // Stable ID: sorted list of names (changes only when crew changes)
          const names = j.people.map(p => p.name).sort();
          const crewId = names.join('|');
          return {
            id: `crew_${crewId.length}_${j.number}`,
            title: `${j.number} humans in space: ${names.slice(0, 3).join(', ')}${names.length > 3 ? ', +' + (names.length - 3) + ' more' : ''}`,
          };
        }),
      },
    }),
  },

  podcasts: {
    event_source: "npr_podcast",
    ttl: 3600,
    collectAll: async (env) => ({
      sources: {
        npr_podcast: await fetchSafe(async () => {
          const r = await fetch("https://feeds.npr.org/510289/podcast.xml");
          if (!r.ok) throw new Error("status " + r.status);
          const text = await r.text();
          const items = text.match(/<item>[\s\S]*?<\/item>/g);
          if (!items || !items.length) throw new Error("no items");
          const first = items[0];
          const titleMatch = first.match(/<title>(?:<!\[CDATA\[)?([^<\]]+)/);
          const guidMatch = first.match(/<guid[^>]*>([^<]+)<\/guid>/);
          if (!titleMatch) throw new Error("no title");
          return {
            id: (guidMatch ? guidMatch[1] : titleMatch[1]).trim().slice(0, 80),
            title: titleMatch[1].trim().slice(0, 100),
          };
        }),
      },
    }),
  },

  travel: {
    event_source: "countriesnow",
    ttl: 3600,
    collectAll: async (env) => ({
      sources: {
        countriesnow: await fetchSafe(async () => {
          const r = await fetch("https://countriesnow.space/api/v0.1/countries");
          if (!r.ok) throw new Error("status " + r.status);
          const j = await r.json();
          if (!j.data?.length) throw new Error("no countries");
          const dayOfYear = Math.floor((Date.now() - new Date(new Date().getFullYear(), 0, 0)) / 86400000);
          const c = j.data[dayOfYear % j.data.length];
          return { id: c.country || 'unknown', title: c.country || 'unknown' };
        }),
      },
    }),
  },

  wikipedia: {
    event_source: "wikimedia_top",
    ttl: 3600,
    collectAll: async (env) => ({
      sources: {
        wikimedia_top: await fetchSafe(async () => {
          const d = new Date(Date.now() - 86400000);
          const y = d.getUTCFullYear();
          const m = String(d.getUTCMonth() + 1).padStart(2, '0');
          const day = String(d.getUTCDate()).padStart(2, '0');
          const url = "https://wikimedia.org/api/rest_v1/metrics/pageviews/top/en.wikipedia/all-access/" + y + "/" + m + "/" + day;
          const r = await fetch(url, {
            headers: {
              "User-Agent": "VolatiAI/1.0 (https://github.com/christianscode1994/VolatiAI; contact@volatiai.local)",
              "Accept": "application/json",
            },
          });
          if (!r.ok) throw new Error("status " + r.status);
          const j = await r.json();
          const articles = j.items?.[0]?.articles;
          if (!articles?.length) throw new Error("no articles");
          const top = articles.find(a => a.article !== 'Main_Page') || articles[0];
          const title = decodeURIComponent(top.article).replace(/_/g, ' ');
          return { id: top.article + "_" + y + m + day, title: title + " (" + top.views.toLocaleString() + " views)" };
        }),
      },
    }),
  },

  "arxiv-ai": {
    event_source: "arxiv_cs_ai",
    ttl: 3600,
    collectAll: async (env) => ({
      sources: {
        arxiv_cs_ai: await fetchSafe(async () => {
          const r = await fetch("http://export.arxiv.org/api/query?search_query=cat:cs.AI&sortBy=submittedDate&sortOrder=descending&max_results=1");
          if (!r.ok) throw new Error("status " + r.status);
          const text = await r.text();
          const idM = text.match(/<entry>[\s\S]*?<id>([^<]+)<\/id>/);
          const titleM = text.match(/<entry>[\s\S]*?<title>([^<]+)<\/title>/);
          if (!idM || !titleM) throw new Error("no entry");
          return { id: idM[1].trim(), title: titleM[1].trim().replace(/\s+/g, ' ').slice(0, 100) };
        }),
      },
    }),
  },

  spaceweather: {
    event_source: "noaa_swpc",
    ttl: 3600,
    collectAll: async (env) => ({
      sources: {
        noaa_swpc: await fetchSafe(async () => {
          const r = await fetch("https://services.swpc.noaa.gov/products/alerts.json");
          if (!r.ok) throw new Error("status " + r.status);
          const j = await r.json();
          if (!Array.isArray(j) || !j.length) throw new Error("no alerts");
          const latest = j[j.length - 1];
          const msg = (latest.message || '').split('\n')[0].slice(0, 80);
          return { id: String(latest.issue_datetime || j.length), title: msg || "NOAA space weather alert" };
        }),
      },
    }),
  },

  spaceflight: {
    event_source: "launch_library",
    ttl: 3600,
    collectAll: async (env) => ({
      sources: {
        launch_library: await fetchSafe(async () => {
          // Try 2.2.0 first (public), fallback to 2.3.0
          const urls = [
            "https://ll.thespacedevs.com/2.2.0/launch/upcoming/?format=json&limit=1",
            "https://ll.thespacedevs.com/2.3.0/launch/upcoming/?format=json&limit=1",
          ];
          let lastErr = "no attempt";
          for (const url of urls) {
            try {
              const r = await fetch(url, {
                headers: { "User-Agent": "VolatiAI/1.0" }
              });
              if (!r.ok) { lastErr = "status " + r.status + " from " + url; continue; }
              const j = await r.json();
              if (!j.results?.length) { lastErr = "no results from " + url; continue; }
              const l = j.results[0];
              const name = (l.name || 'Launch').slice(0, 80);
              const net = l.net ? l.net.slice(0, 16) : 'TBD';
              return { id: String(l.id || l.slug), title: name + " (" + net + ")" };
            } catch (e) { lastErr = String(e).slice(0, 80); }
          }
          throw new Error(lastErr);
        }),
      },
    }),
  },


  crossref: {
    event_source: "crossref_latest",
    ttl: 3600,
    collectAll: async (env) => ({
      sources: {
        crossref_latest: await fetchSafe(async () => {
          const r = await fetch("https://api.crossref.org/works?sort=published&order=desc&rows=1");
          if (!r.ok) throw new Error("status " + r.status);
          const j = await r.json();
          const item = j.message?.items?.[0];
          if (!item) throw new Error("no items");
          const title = (item.title?.[0] || 'untitled').slice(0, 100);
          const doi = item.DOI || 'unknown';
          return { id: doi, title: title + " (" + doi + ")" };
        }),
      },
    }),
  },

  openalex: {
    event_source: "openalex_latest",
    ttl: 3600,
    collectAll: async (env) => ({
      sources: {
        openalex_latest: await fetchSafe(async () => {
          const r = await fetch("https://api.openalex.org/works?sort=publication_date:desc&per_page=1&mailto=contact@volatiai.local");
          if (!r.ok) throw new Error("status " + r.status);
          const j = await r.json();
          const work = j.results?.[0];
          if (!work) throw new Error("no works");
          return { id: work.id, title: (work.title || 'untitled').slice(0, 100) };
        }),
      },
    }),
  },

  semanticscholar: {
    event_source: "s2_latest",
    ttl: 3600,
    collectAll: async (env) => ({
      sources: {
        s2_latest: await fetchSafe(async () => {
          const r = await fetch("https://api.semanticscholar.org/graph/v1/paper/search?query=machine%20learning&limit=1&fields=title,paperId");
          if (!r.ok) throw new Error("status " + r.status);
          const j = await r.json();
          const paper = j.data?.[0];
          if (!paper) throw new Error("no papers");
          return { id: paper.paperId, title: (paper.title || 'untitled').slice(0, 100) };
        }),
      },
    }),
  },

  aviation: {
    event_source: "opensky_states",
    ttl: 1800,
    collectAll: async (env) => ({
      sources: {
        opensky_states: await fetchSafe(async () => {
          const r = await fetch("https://opensky-network.org/api/states/all?lamin=55&lomin=10&lamax=70&lomax=25");
          if (!r.ok) throw new Error("status " + r.status);
          const j = await r.json();
          const count = j.states?.length || 0;
          const bucket = Math.floor(count / 10) * 10;
          return { id: "flights_" + bucket + "_" + new Date().toISOString().slice(0, 13), title: count + " aircraft over Scandinavia" };
        }),
      },
    }),
  },

  geocoding: {
    event_source: "nominatim_search",
    ttl: 3600,
    collectAll: async (env) => ({
      sources: {
        nominatim_search: await fetchSafe(async () => {
          const r = await fetch("https://nominatim.openstreetmap.org/search?q=VolatiAI&format=json&limit=1", {
            headers: { "User-Agent": "VolatiAI/1.0 (contact@volatiai.local)" }
          });
          if (!r.ok) throw new Error("status " + r.status);
          const j = await r.json();
          const place = j?.[0];
          if (!place) throw new Error("no place");
          return { id: place.place_id, title: (place.display_name || 'unknown').slice(0, 100) };
        }),
      },
    }),
  },

  tv: {
    event_source: "tvmaze_schedule",
    ttl: 3600,
    collectAll: async (env) => ({
      sources: {
        tvmaze_schedule: await fetchSafe(async () => {
          const today = new Date().toISOString().slice(0, 10);
          const r = await fetch("https://api.tvmaze.com/schedule?country=US&date=" + today);
          if (!r.ok) throw new Error("status " + r.status);
          const j = await r.json();
          if (!Array.isArray(j) || !j.length) throw new Error("no episodes");
          const ep = j[0];
          const showName = ep._embedded?.show?.name || 'unknown';
          const epName = ep.name || 'episode';
          return { id: String(ep.id), title: showName + " — " + epName };
        }),
      },
    }),
  },

  musicbrainz: {
    event_source: "musicbrainz_release",
    ttl: 3600,
    collectAll: async (env) => ({
      sources: {
        musicbrainz_release: await fetchSafe(async () => {
          const r = await fetch("https://musicbrainz.org/ws/2/release?query=*&limit=1&fmt=json", {
            headers: { "User-Agent": "VolatiAI/1.0 (contact@volatiai.local)" }
          });
          if (!r.ok) throw new Error("status " + r.status);
          const j = await r.json();
          const rel = j.releases?.[0];
          if (!rel) throw new Error("no releases");
          const title = (rel.title || 'unknown') + " — " + (rel.artist_credit?.[0]?.name || 'unknown');
          return { id: rel.id, title: title.slice(0, 100) };
        }),
      },
    }),
  },

  "drug-recall": {
    event_source: "openfda_drug",
    ttl: 3600,
    collectAll: async (env) => ({
      sources: {
        openfda_drug: await fetchSafe(async () => {
          const r = await fetch("https://api.fda.gov/drug/enforcement.json?limit=1&sort=report_date:desc");
          if (!r.ok) throw new Error("status " + r.status);
          const j = await r.json();
          const rec = j.results?.[0];
          if (!rec) throw new Error("no recalls");
          return {
            id: rec.recall_number || 'unknown',
            title: (rec.product_description || 'Drug recall').slice(0, 100) + " — " + (rec.reason_for_recall || '').slice(0, 60),
          };
        }),
      },
    }),
  },

  pubmed: {
    event_source: "pubmed_medicine",
    ttl: 3600,
    collectAll: async (env) => ({
      sources: {
        pubmed_medicine: await fetchSafe(async () => {
          const s = await fetch("https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=pubmed&term=medicine&retmax=1&sort=pub_date&retmode=json");
          if (!s.ok) throw new Error("status " + s.status);
          const sj = await s.json();
          const id = sj.esearchresult?.idlist?.[0];
          if (!id) throw new Error("no id");
          return { id, title: "PubMed " + id };
        }),
      },
    }),
  },

  sports: {
    event_source: "sportsdb_events",
    ttl: 3600,
    collectAll: async (env) => ({
      sources: {
        sportsdb_events: await fetchSafe(async () => {
          const today = new Date().toISOString().slice(0, 10);
          const r = await fetch("https://www.thesportsdb.com/api/v1/json/3/eventsday.php?d=" + today + "&s=Soccer");
          if (!r.ok) throw new Error("status " + r.status);
          const j = await r.json();
          const ev = j.events?.[0];
          if (!ev) throw new Error("no events");
          return { id: ev.idEvent, title: (ev.strEvent || 'Match').slice(0, 100) };
        }),
      },
    }),
  },

  "sec-filings": {
    event_source: "sec_8k",
    ttl: 3600,
    collectAll: async (env) => ({
      sources: {
        sec_8k: await fetchSafe(async () => {
          const r = await fetch("https://www.sec.gov/cgi-bin/browse-edgar?action=getcurrent&type=8-K&company=&dateb=&owner=include&count=1&output=atom", {
            headers: { "User-Agent": "VolatiAI/1.0 (contact@volatiai.local)" }
          });
          if (!r.ok) throw new Error("status " + r.status);
          const text = await r.text();
          const titleMatch = text.match(/<title>([^<]+)<\/title>/g);
          const entryMatch = text.match(/<entry>[\s\S]*?<title>([^<]+)<\/title>/);
          if (!entryMatch) throw new Error("no entry");
          const idMatch = text.match(/<id>([^<]+)<\/id>/);
          return { id: (idMatch ? idMatch[1] : entryMatch[1]).slice(0, 80), title: entryMatch[1].slice(0, 100) };
        }),
      },
    }),
  },


  "free-games": {
    event_source: "gamerpower",
    ttl: 1800,
    collectAll: async (env) => ({
      sources: {
        gamerpower: await fetchSafe(async () => {
          const r = await fetch("https://www.gamerpower.com/api/giveaways?platform=pc&sort-by=date");
          if (!r.ok) throw new Error("status " + r.status);
          const j = await r.json();
          if (!Array.isArray(j) || !j.length) throw new Error("no giveaways");
          const g = j[0];
          return { id: String(g.id), title: (g.title || 'Free game').slice(0, 100) };
        }),
      },
    }),
  },

  "free-to-play": {
    event_source: "freetogame",
    ttl: 3600,
    collectAll: async (env) => ({
      sources: {
        freetogame: await fetchSafe(async () => {
          const r = await fetch("https://www.freetogame.com/api/games?sort-by=release-date");
          if (!r.ok) throw new Error("status " + r.status);
          const j = await r.json();
          if (!Array.isArray(j) || !j.length) throw new Error("no games");
          const game = j[0];
          return { id: String(game.id), title: (game.title || 'Unknown').slice(0, 100) };
        }),
      },
    }),
  },

  mtg: {
    event_source: "scryfall",
    ttl: 3600,
    collectAll: async (env) => ({
      sources: {
        scryfall: await fetchSafe(async () => {
          const r = await fetch("https://api.scryfall.com/cards/random");
          if (!r.ok) throw new Error("status " + r.status);
          const j = await r.json();
          if (!j.id || !j.name) throw new Error("no card");
          // Use card ID + date so it only triggers once per day
          const day = new Date().toISOString().slice(0, 10);
          return { id: j.id + "_" + day, title: (j.name || 'Unknown card').slice(0, 100) };
        }),
      },
    }),
  },

  artic: {
    event_source: "artic_chicago",
    ttl: 86400,
    collectAll: async (env) => ({
      sources: {
        artic_chicago: await fetchSafe(async () => {
          const dayOfYear = Math.floor((Date.now() - new Date(new Date().getFullYear(), 0, 0)) / 86400000);
          const ids = [4, 27992, 65632, 117266, 20684, 14598, 87088, 109819];
          const objId = ids[dayOfYear % ids.length];
          const r = await fetch(`https://api.artic.edu/api/v1/artworks/${objId}?fields=id,title,artist_display`);
          if (!r.ok) throw new Error("status " + r.status);
          const j = await r.json();
          const art = j.data;
          if (!art) throw new Error("no artwork");
          const artist = (art.artist_display || '').split('\n')[0].slice(0, 40);
          return { id: `${objId}_${dayOfYear}`, title: (art.title || 'Untitled').slice(0, 100) + (artist ? ' — ' + artist : '') };
        }),
      },
    }),
  },

  audius: {
    event_source: "audius_trending",
    ttl: 3600,
    collectAll: async (env) => ({
      sources: {
        audius_trending: await fetchSafe(async () => {
          const r = await fetch("https://discoveryprovider.audius.co/v1/tracks/trending?limit=1&app_name=VolatiAI");
          if (!r.ok) throw new Error("status " + r.status);
          const j = await r.json();
          const track = j.data?.[0];
          if (!track) throw new Error("no tracks");
          return { id: track.id, title: (track.title || 'Unknown').slice(0, 100) + ' — ' + (track.user?.name || 'Unknown') };
        }),
      },
    }),
  },

  gutendex: {
    event_source: "gutendex_latest",
    ttl: 3600,
    collectAll: async (env) => ({
      sources: {
        gutendex_latest: await fetchSafe(async () => {
          const r = await fetch("https://gutendex.com/books?sort=descending");
          if (!r.ok) throw new Error("status " + r.status);
          const j = await r.json();
          const book = j.results?.[0];
          if (!book) throw new Error("no books");
          return { id: String(book.id), title: (book.title || 'Unknown').slice(0, 100) + ' — ' + (book.authors?.[0]?.name || 'Unknown') };
        }),
      },
    }),
  },

  "depin-network": {
    event_source: "flux_node_count",
    ttl: 3600,
    collectAll: async (env) => ({
      sources: {
        flux_node_count: await fetchSafe(async () => {
          const r = await fetch("https://api.runonflux.io/daemon/getfluxnodecount");
          if (!r.ok) throw new Error("status " + r.status);
          const j = await r.json();
          // Flux returns {status, data: {total, ...}} or {status, data: number}
          const count = typeof j.data === "number"
            ? j.data
            : (j.data?.total ?? j.data?.count ?? null);
          if (count === null || count === undefined) throw new Error("no count in " + JSON.stringify(j.data).slice(0, 100));
          const day = new Date().toISOString().slice(0, 10);
          return { id: "flux_" + count + "_" + day, title: "Flux nodes: " + Number(count).toLocaleString() };
        }),
      },
    }),
  },

  "github-trending": {
    event_source: "github_trending",
    ttl: 3600,
    collectAll: async (env) => ({
      sources: {
        github_trending: await fetchSafe(async () => {
          const headers = { "user-agent": "VolatiAI/1.0", "accept": "application/vnd.github+json" };
          if (env.GITHUB_TOKEN) headers["authorization"] = "Bearer " + env.GITHUB_TOKEN;
          const r = await fetch("https://api.github.com/search/repositories?q=stars:>1000&sort=stars&order=desc&per_page=1", { headers });
          if (!r.ok) throw new Error("status " + r.status);
          const j = await r.json();
          const repo = j.items?.[0];
          if (!repo) throw new Error("no repos");
          return { id: repo.id, title: repo.full_name + " (" + repo.stargazers_count.toLocaleString() + " stars)" };
        }),
      },
    }),
  },

  "npm-packages": {
    event_source: "npm_latest",
    ttl: 3600,
    collectAll: async (env) => ({
      sources: {
        npm_latest: await fetchSafe(async () => {
          const r = await fetch("https://registry.npmjs.org/-/v1/search?text=keywords:ai&size=1");
          if (!r.ok) throw new Error("status " + r.status);
          const j = await r.json();
          const pkg = j.objects?.[0]?.package;
          if (!pkg) throw new Error("no packages");
          return { id: pkg.name + "@" + pkg.version, title: pkg.name + " v" + pkg.version };
        }),
      },
    }),
  },

  "pypi-packages": {
    event_source: "pypi_trending",
    ttl: 3600,
    collectAll: async (env) => ({
      sources: {
        pypi_trending: await fetchSafe(async () => {
          // Use top-downloaded packages (stable) instead of latest (firehose)
          // Library.io tracks PyPI downloads and provides a JSON API
          const r = await fetch("https://hugovk.github.io/top-pypi-packages/top-pypi-packages-30-days.min.json");
          if (!r.ok) throw new Error("status " + r.status);
          const j = await r.json();
          if (!j.rows || !j.rows.length) throw new Error("no rows");
          // Top package (stable, changes rarely) — only triggers when ranking changes
          const top = j.rows[0];
          const day = new Date().toISOString().slice(0, 10);
          return { id: "pypi_top_" + top.project + "_" + day, title: "Top PyPI: " + top.project + " (" + top.download_count.toLocaleString() + " downloads)" };
        }),
      },
    }),
  },

  "osv-vulnerabilities": {
    event_source: "osv_recent",
    ttl: 3600,
    collectAll: async (env) => ({
      sources: {
        osv_recent: await fetchSafe(async () => {
          // OSV has a query endpoint; use a broad query for recent
          const r = await fetch("https://api.osv.dev/v1/query", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ package: { name: "lodash", ecosystem: "npm" } }),
          });
          if (!r.ok) throw new Error("status " + r.status);
          const j = await r.json();
          const vuln = j.vulns?.[0];
          if (!vuln) throw new Error("no vulns");
          return { id: vuln.id, title: vuln.id + " — " + (vuln.summary || 'vulnerability').slice(0, 80) };
        }),
      },
    }),
  },

  "huggingface-models": {
    event_source: "hf_trending",
    ttl: 3600,
    collectAll: async (env) => ({
      sources: {
        hf_trending: await fetchSafe(async () => {
          const r = await fetch("https://huggingface.co/api/models?sort=downloads&direction=-1&limit=1");
          if (!r.ok) throw new Error("status " + r.status);
          const j = await r.json();
          const model = j[0];
          if (!model) throw new Error("no models");
          return { id: model.modelId, title: model.modelId + " (" + (model.downloads || 0).toLocaleString() + " downloads)" };
        }),
      },
    }),
  },

  "arxiv-cs": {
    event_source: "arxiv_cs_general",
    ttl: 3600,
    collectAll: async (env) => ({
      sources: {
        arxiv_cs_general: await fetchSafe(async () => {
          const r = await fetch("http://export.arxiv.org/api/query?search_query=cat:cs.*&sortBy=submittedDate&sortOrder=descending&max_results=1");
          if (!r.ok) throw new Error("status " + r.status);
          const text = await r.text();
          const idM = text.match(/<entry>[\s\S]*?<id>([^<]+)<\/id>/);
          const titleM = text.match(/<entry>[\s\S]*?<title>([^<]+)<\/title>/);
          if (!idM || !titleM) throw new Error("no entry");
          return { id: idM[1].trim(), title: titleM[1].trim().replace(/\s+/g, ' ').slice(0, 100) };
        }),
      },
    }),
  },

  "test-data": {
    event_source: "fakerapi",
    ttl: 3600,
    collectAll: async (env) => ({
      sources: {
        fakerapi: await fetchSafe(async () => {
          const seed = new Date().toISOString().slice(0, 10);
          const r = await fetch("https://fakerapi.it/api/v2/persons?_quantity=1&_seed=" + seed);
          if (!r.ok) throw new Error("status " + r.status);
          const j = await r.json();
          const person = j.data?.[0];
          if (!person) throw new Error("no person");
          return { id: person.email, title: person.firstname + " " + person.lastname + " (" + person.email + ")" };
        }),
      },
    }),
  },

  "cloud-status": {
    event_source: "downstatus",
    ttl: 1800,
    collectAll: async (env) => ({
      sources: {
        downstatus: await fetchSafe(async () => {
          const services = ["aws", "azure", "gcp", "cloudflare", "vercel"];
          const results = await Promise.all(services.map(async (svc) => {
            const r = await fetch("https://isitdownstatus.com/api/status/" + svc);
            if (!r.ok) throw new Error(svc + " status " + r.status);
            return await r.json();
          }));
          const issues = results.filter(s => s.status !== "operational");
          if (issues.length === 0) {
            return { id: "all_ok_" + new Date().toISOString().slice(0, 13), title: "All cloud services operational" };
          }
          const summary = issues.map(s => (s.service || s.name || "service") + ": " + s.status).join(", ");
          return { id: "issues_" + issues.length + "_" + new Date().toISOString().slice(0, 13), title: summary };
        }),
      },
    }),
  },

  "open-source-packages": {
    event_source: "deps_dev",
    ttl: 3600,
    collectAll: async (env) => ({
      sources: {
        deps_dev: await fetchSafe(async () => {
          const r = await fetch("https://api.deps.dev/v3/systems/npm/packages/lodash");
          if (!r.ok) throw new Error("status " + r.status);
          const j = await r.json();
          const versions = j.versions || [];
          const latest = versions.find(v => v.isDefault) || versions[versions.length - 1];
          if (!latest) throw new Error("no versions");
          const version = latest.versionKey?.version || latest.version || "unknown";
          const day = new Date().toISOString().slice(0, 10);
          return { id: "lodash_" + version + "_" + day, title: "lodash " + version + " (latest)" };
        }),
      },
    }),
  },

  "cve-feed": {
    event_source: "nvd_recent",
    ttl: 3600,
    collectAll: async (env) => ({
      sources: {
        nvd_recent: await fetchSafe(async () => {
          const now = new Date();
          const weekAgo = new Date(now.getTime() - 7 * 86400000);
          const fmt = (d) => d.toISOString().slice(0, 19) + ".000";
          const url = "https://services.nvd.nist.gov/rest/json/cves/2.0?pubStartDate=" + fmt(weekAgo) + "&pubEndDate=" + fmt(now) + "&resultsPerPage=1";
          const r = await fetch(url);
          if (!r.ok) throw new Error("status " + r.status);
          const j = await r.json();
          const vulns = j.vulnerabilities || [];
          if (!vulns.length) throw new Error("no CVEs last 7d");
          const vuln = vulns[vulns.length - 1].cve;
          const desc = vuln.descriptions?.[0]?.value || "No description";
          return { id: vuln.id, title: vuln.id + ": " + desc.slice(0, 100) };
        }),
      },
    }),
  },
  "defence-aircraft": {
    event_source: "adsb_mil",
    ttl: 1800,
    collectAll: async (env) => ({
      sources: {
        adsb_mil: await fetchSafe(async () => {
          const r = await fetch("https://api.adsb.lol/v2/mil");
          if (!r.ok) throw new Error("status " + r.status);
          const j = await r.json();
          const aircraft = j.ac || j.aircraft || [];
          const count = aircraft.length;
          const bucket = Math.floor(count / 50) * 50;
          const day = new Date().toISOString().slice(0, 10);
          return { id: "mil_" + bucket + "_" + day, title: count + " military aircraft tracked globally" };
        }),
      },
    }),
  },
  water: {
    event_source: "usgs_water",
    ttl: 3600,
    collectAll: async (env) => ({
      sources: {
        usgs_water: await fetchSafe(async () => {
          const r = await fetch("https://waterservices.usgs.gov/nwis/iv/?format=json&sites=07010000&parameterCd=00060&period=P1D");
          if (!r.ok) throw new Error("status " + r.status);
          const j = await r.json();
          const ts = j.value?.timeSeries?.[0]?.values?.[0]?.value?.slice(-1)[0];
          if (!ts) throw new Error("no data");
          const flow = parseFloat(ts.value);
          const day = new Date().toISOString().slice(0, 10);
          return { id: "usgs_" + Math.round(flow) + "_" + day, title: "Mississippi flow: " + flow.toLocaleString() + " cfs" };
        }),
      },
    }),
  },
  "global-events": {
    event_source: "gdelt",
    ttl: 1800,
    collectAll: async (env) => ({
      sources: {
        gdelt: await fetchSafe(async () => {
          const r = await fetch("https://api.gdeltproject.org/api/v2/doc/doc?query=climate&mode=artlist&maxrecords=1&format=json&sort=datedesc");
          if (!r.ok) throw new Error("status " + r.status);
          const j = await r.json();
          const art = j.articles?.[0];
          if (!art) throw new Error("no articles");
          return { id: art.url, title: (art.title || "Global event").slice(0, 100) };
        }),
      },
    }),
  },
  "food-products": {
    event_source: "openfoodfacts",
    ttl: 86400,
    collectAll: async (env) => ({
      sources: {
        openfoodfacts: await fetchSafe(async () => {
          const dayOfYear = Math.floor((Date.now() - new Date(new Date().getFullYear(), 0, 0)) / 86400000);
          const barcodes = ["3017620422003", "5449000000996", "7622210449283", "3179730010104"];
          const code = barcodes[dayOfYear % barcodes.length];
          const r = await fetch("https://world.openfoodfacts.org/api/v2/product/" + code + ".json");
          if (!r.ok) throw new Error("status " + r.status);
          const j = await r.json();
          const prod = j.product;
          if (!prod) throw new Error("no product");
          return { id: code + "_" + dayOfYear, title: (prod.product_name || "Product") + " (" + (prod.brands || "?") + ")" };
        }),
      },
    }),
  },
  demographics: {
    event_source: "worldbank_pop",
    ttl: 86400,
    collectAll: async (env) => ({
      sources: {
        worldbank_pop: await fetchSafe(async () => {
          const r = await fetch("https://api.worldbank.org/v2/country/SWE/indicator/SP.POP.TOTL?format=json&per_page=1&date=2024");
          if (!r.ok) throw new Error("status " + r.status);
          const j = await r.json();
          const val = j[1]?.[0]?.value;
          if (val === null || val === undefined) throw new Error("no data");
          return { id: "se_pop_" + Math.round(val) + "_2024", title: "Sweden population: " + val.toLocaleString() };
        }),
      },
    }),
  },
  "energy-grid": {
    event_source: "smard_grid_load",
    ttl: 3600,
    collectAll: async (env) => ({
      sources: {
        smard_grid_load: await fetchSafe(async () => {
          const indexResp = await fetch("https://www.smard.de/app/chart_data/410/DE/index_hour.json");
          if (!indexResp.ok) throw new Error("index status " + indexResp.status);
          const index = await indexResp.json();
          const timestamps = index.timestamps;
          if (!timestamps || !timestamps.length) throw new Error("no timestamps");
          const latest = timestamps[timestamps.length - 1];
          const dataResp = await fetch("https://www.smard.de/app/chart_data/410/DE/410_DE_hour_" + latest + ".json");
          if (!dataResp.ok) throw new Error("data status " + dataResp.status);
          const data = await dataResp.json();
          const series = data.series;
          if (!series || !series.length) throw new Error("no series");

          // Find last non-null value (SMARD often has trailing nulls for incomplete hours)
          let load = null;
          for (let i = series.length - 1; i >= 0; i--) {
            if (series[i][1] !== null && series[i][1] !== undefined) {
              load = series[i][1];
              break;
            }
          }
          if (load === null) throw new Error("no non-null load value in series");

          const bucket = Math.floor(load / 500) * 500;
          const day = new Date().toISOString().slice(0, 10);
          return { id: "smard_" + bucket + "_" + day, title: "DE grid load: " + Math.round(load).toLocaleString() + " MW" };
        }),
      },
    }),
  },
  "carbon-intensity": {
    event_source: "uk_carbon",
    ttl: 1800,
    collectAll: async (env) => ({
      sources: {
        uk_carbon: await fetchSafe(async () => {
          const r = await fetch("https://api.carbonintensity.org.uk/intensity");
          if (!r.ok) throw new Error("status " + r.status);
          const j = await r.json();
          const entry = j.data && j.data[0];
          if (!entry) throw new Error("no data");
          const actual = entry.intensity.actual;
          const forecast = entry.intensity.forecast;
          const index = entry.intensity.index;
          const value = actual !== null ? actual : forecast;
          const bucket = Math.floor(value / 20) * 20;
          const day = new Date().toISOString().slice(0, 10);
          return { id: "uk_carbon_" + bucket + "_" + day, title: "UK grid: " + value + " gCO2/kWh (" + index + ")" };
        }),
      },
    }),
  },
  "nasa-apod": {
    event_source: "nasa_apod",
    ttl: 86400,
    collectAll: async (env) => ({
      sources: {
        nasa_apod: await fetchSafe(async () => {
          const r = await fetch("https://api.nasa.gov/planetary/apod?api_key=DEMO_KEY");
          if (!r.ok) throw new Error("status " + r.status);
          const j = await r.json();
          if (!j.date || !j.title) throw new Error("no data");
          return { id: "apod_" + j.date, title: "APOD: " + (j.title || "?").slice(0, 80) };
        }),
      },
    }),
  },

  nft: {
    event_source: "opensea_top_collection",
    ttl: 3600,
    collectAll: async (env) => ({
      sources: {
        opensea_top_collection: await fetchSafe(async () => {
          // Rotate known blue-chip NFT collections by day-of-year
          const slugs = [
            "boredapeyachtclub", "cryptopunks", "azuki",
            "pudgypenguins", "mutant-ape-yacht-club", "clonex",
            "doodles-official", "moonbirds", "meebits", "otherdeed"
          ];
          const dayOfYear = Math.floor((Date.now() - new Date(new Date().getFullYear(), 0, 0)) / 86400000);
          const slug = slugs[dayOfYear % slugs.length];

          const r = await fetch("https://api.opensea.io/api/v2/collections/" + slug + "/stats", {
            headers: { "user-agent": "VolatiAI/1.0", "accept": "application/json" }
          });
          if (!r.ok) throw new Error("status " + r.status);
          const j = await r.json();
          const total = j.total || {};
          const floor = total.floor_price != null ? total.floor_price : "n/a";
          const symbol = total.floor_price_symbol || "ETH";
          // Bucket floor price to 1-unit granularity to avoid noise
          const bucket = typeof floor === "number" ? Math.round(floor) : 0;
          return { id: slug + "_" + bucket, title: slug + ": floor " + floor + " " + symbol };
        }),
      },
    }),
  },

  "dev-vr-ar": {
    event_source: "github_vr_ar",
    ttl: 3600,
    collectAll: async (env) => ({
      sources: {
        github_vr_ar: await fetchSafe(async () => {
          const repos = [
            { owner: "rokups", repo: "virtual-reality", name: "Virtual Reality" },
            { owner: "jalmasi", repo: "vrspace", name: "VRSpace" },
            { owner: "ir-engine", repo: "ir-engine", name: "iR Engine" },
            { owner: "etherealengine", repo: "etherealengine", name: "Ethereal Engine" },
          ];
          const headers = { "user-agent": "VolatiAI/1.0" };
          if (env.GITHUB_TOKEN) headers["authorization"] = "Bearer " + env.GITHUB_TOKEN;

          const results = await Promise.all(repos.map(async (r) => {
            try {
              const resp = await fetch(`https://api.github.com/repos/${r.owner}/${r.repo}/commits?per_page=1`, { headers });
              if (!resp.ok) return null;
              const commits = await resp.json();
              if (!Array.isArray(commits) || !commits[0]) return null;
              return { name: r.name, sha: commits[0].sha, date: commits[0].commit.author.date };
            } catch { return null; }
          }));

          const active = results.filter(Boolean);
          if (!active.length) throw new Error("no commits");
          active.sort((a, b) => new Date(b.date) - new Date(a.date));
          const top = active[0];
          return {
            id: "vrar_" + top.name.replace(/\s/g, "_") + "_" + top.sha.slice(0, 8),
            title: top.name + ": latest commit " + new Date(top.date).toISOString().slice(0, 10),
          };
        }),
      },
    }),
  },

  "dev-metaverse": {
    event_source: "github_metaverse",
    ttl: 3600,
    collectAll: async (env) => ({
      sources: {
        github_metaverse: await fetchSafe(async () => {
          const repos = [
            { owner: "ir-engine", repo: "ir-engine", name: "iR Engine" },
            { owner: "PatchedReality", repo: "Manifolder", name: "Manifolder" },
            { owner: "WebOfWorlds", repo: "simpleWorlds", name: "simpleWorlds" },
            { owner: "vircadia", repo: "vircadia-native-core", name: "Vircadia" },
          ];
          const headers = { "user-agent": "VolatiAI/1.0" };
          if (env.GITHUB_TOKEN) headers["authorization"] = "Bearer " + env.GITHUB_TOKEN;

          const results = await Promise.all(repos.map(async (r) => {
            try {
              const resp = await fetch(`https://api.github.com/repos/${r.owner}/${r.repo}/commits?per_page=1`, { headers });
              if (!resp.ok) return null;
              const commits = await resp.json();
              if (!Array.isArray(commits) || !commits[0]) return null;
              return { name: r.name, sha: commits[0].sha, date: commits[0].commit.author.date };
            } catch { return null; }
          }));

          const active = results.filter(Boolean);
          if (!active.length) throw new Error("no commits");
          active.sort((a, b) => new Date(b.date) - new Date(a.date));
          const top = active[0];
          return {
            id: "meta_" + top.name.replace(/\s/g, "_") + "_" + top.sha.slice(0, 8),
            title: top.name + ": latest commit " + new Date(top.date).toISOString().slice(0, 10),
          };
        }),
      },
    }),
  },

  "pqc-migration": {
    event_source: "nsa_pqc_guidance",
    ttl: 86400,
    collectAll: async (env) => ({
      sources: {
        nsa_pqc_guidance: await fetchSafe(async () => {
          const r = await fetch("https://api.theartofservice.com/api/agent/frameworks/NSA%20Guidance%20for%20Transition%20to%20Quantum-Resistant%20Cryptography/controls");
          if (!r.ok) throw new Error("status " + r.status);
          const j = await r.json();
          const count = (j.controls && j.controls.length) || 0;
          if (count === 0) throw new Error("no controls");
          return { id: "pqc_controls_" + count, title: "NSA PQC controls: " + count };
        }),
      },
    }),
  },

  "dev-security-trends": {
    event_source: "stackexchange_security",
    ttl: 3600,
    collectAll: async (env) => ({
      sources: {
        stackexchange_security: await fetchSafe(async () => {
          const url = "https://api.stackexchange.com/2.3/questions?order=desc&sort=week&tagged=security&site=stackoverflow&pagesize=1";
          const r = await fetch(url, {
            headers: {
              "user-agent": "VolatiAI/1.0",
              "accept": "application/json",
            },
          });
          if (!r.ok) throw new Error("status " + r.status);
          const j = await r.json();
          const items = j.items || [];
          if (!items.length) throw new Error("no items");
          // Use latest question ID as signal (weekly sorted)
          const top = items[0];
          return { id: "sec_q_" + top.question_id, title: "Latest security question: " + (top.title || "").slice(0, 80) };
        }),
      },
    }),
  },

  "iacr-crypto": {
    event_source: "iacr_eprint_rss",
    ttl: 3600,
    collectAll: async (env) => ({
      sources: {
        iacr_eprint_rss: await fetchSafe(async () => {
          const r = await fetch("https://eprint.iacr.org/rss/rss.xml", {
            headers: { "user-agent": "VolatiAI/1.0" },
          });
          if (!r.ok) throw new Error("status " + r.status);
          const text = await r.text();
          // Debug: check what we got
          if (text.length < 100) throw new Error("empty response, len=" + text.length);
          // Try both RSS <item> and Atom <entry>
          let items = text.match(/<item[\s>][\s\S]*?<\/item>/g);
          if (!items || !items.length) {
            items = text.match(/<entry[\s>][\s\S]*?<\/entry>/g);
          }
          if (!items || !items.length) throw new Error("no items, len=" + text.length + " preview=" + text.slice(0, 100));
          const first = items[0];
          const titleM = first.match(/<title[^>]*>(?:<!\[CDATA\[)?([^<\]]+)/);
          const linkM = first.match(/<link[^>]*href="([^"]+)"/) || first.match(/<link>([^<]+)<\/link>/);
          if (!titleM) throw new Error("no title");
          return {
            id: (linkM ? linkM[1] : titleM[1]).trim().slice(0, 80),
            title: titleM[1].trim().slice(0, 100),
          };
        }),
      },
    }),
  },

  "abuse-ch-feodo": {
    config: { metric: "new_c2_7d", threshold_pct: 0, threshold_abs: 1, window: "7d", ttl: 3600, context_keys: [] },
    collectAll: async () => ({
      sources: {
        new_c2_7d: await fetchSafe(async () => {
          const r = await fetch("https://feodotracker.abuse.ch/downloads/ipblocklist.json",
            { headers: { "user-agent": "VolatiAI/1.0", "accept": "application/json" }, signal: AbortSignal.timeout(20000) });
          if (!r.ok) throw new Error("http_" + r.status);
          const j = await r.json();
          if (!Array.isArray(j)) throw new Error("not_array: keys=" + Object.keys(j || {}).join(","));
          const cutoff = new Date(Date.now() - 7 * 864e5).toISOString().slice(0, 10);
          return j.filter(e => (e.first_seen || "").slice(0, 10) >= cutoff).length;
        }),
      },
    }),
  },
  "mining": {
    event_source: "dcentral_hashprice",
    ttl: 3600,
    collectAll: async (env) => ({
      sources: {
        dcentral_hashprice: await fetchSafe(async () => {
          const r = await fetch("https://d-central.tech/wp-json/dc/v1/hashprice", {
            headers: { "user-agent": "VolatiAI/1.0" },
          });
          if (!r.ok) throw new Error("status " + r.status);
          const j = await r.json();

          // Defensive: find first numeric price field anywhere in the object
          function findNumber(obj, depth) {
            if (depth > 3 || obj === null || obj === undefined) return null;
            if (typeof obj === "number" && !isNaN(obj) && obj > 0 && obj < 100) return obj;
            if (typeof obj === "string") {
              const n = parseFloat(obj);
              if (!isNaN(n) && n > 0 && n < 100) return n;
            }
            if (typeof obj === "object") {
              const priorityKeys = ["usd", "hashprice", "usd_per_th_day", "hashprice_usd_per_th_day", "value"];
              for (const key of priorityKeys) {
                if (obj[key] !== undefined) {
                  const found = findNumber(obj[key], depth + 1);
                  if (found !== null) return found;
                }
              }
              for (const key of Object.keys(obj)) {
                const found = findNumber(obj[key], depth + 1);
                if (found !== null) return found;
              }
            }
            return null;
          }

          const price = findNumber(j, 0);
          if (price === null) throw new Error("no numeric price found: " + JSON.stringify(j).slice(0, 200));

          const bucket = Math.round(price * 100);
          const day = new Date().toISOString().slice(0, 10);
          return { id: "hashprice_" + bucket + "_" + day, title: "BTC hashprice: $" + price.toFixed(4) + "/TH/day" };
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
        try {
          await env.SECTOR_KV.put(kvKey, String(envelope.context.current_event_id), { expirationTtl: 86400 * 30 });
        } catch (kvErr) {
          console.log("KV put failed:", String(kvErr));
        }
      }

      return json(envelope);
    }

    return json({ error: "not found" }, 404);
  },
};
