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
    event_source: "pypi_latest",
    ttl: 3600,
    collectAll: async (env) => ({
      sources: {
        pypi_latest: await fetchSafe(async () => {
          // PyPI simple index — grab a recent package from RSS-like endpoint
          const r = await fetch("https://pypi.org/rss/updates.xml");
          if (!r.ok) throw new Error("status " + r.status);
          const text = await r.text();
          const itemMatch = text.match(/<item>[\s\S]*?<title>([^<]+)<\/title>/);
          const linkMatch = text.match(/<item>[\s\S]*?<link>([^<]+)<\/link>/);
          if (!itemMatch) throw new Error("no items");
          return {
            id: (linkMatch ? linkMatch[1] : itemMatch[1]).trim().slice(0, 80),
            title: itemMatch[1].trim().slice(0, 100),
          };
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
