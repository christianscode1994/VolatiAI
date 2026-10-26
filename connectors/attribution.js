// connectors/attribution.js — whitelist-based attribution for all bots
const SOURCES_URL = 'https://raw.githubusercontent.com/christianscode1994/VolatiAI/main/docs/source_licenses.json';

let _cache = null;
let _cacheTime = 0;
const CACHE_TTL_MS = 60 * 60 * 1000;  // 1 hour

export async function loadSources() {
  if (_cache && Date.now() - _cacheTime < CACHE_TTL_MS) return _cache;
  try {
    const r = await fetch(SOURCES_URL);
    if (!r.ok) throw new Error(`http_${r.status}`);
    _cache = await r.json();
    _cacheTime = Date.now();
    return _cache;
  } catch {
    return {};
  }
}

export function isWhitelisted(info) {
  if (!info) return false;
  if (info.status === 'REVIEW' || info.status === 'REMOVED') return false;

  const lic = (info.license || '').toLowerCase();

  // 1. Explicit risky patterns → block (fail closed)
  const RISKY = [
    'unverified', 'unknown',
    'non-commercial', 'noncommercial', 'nc-', 'cc by-nc',
    'share-alike', 'cc by-sa',
    'kraken', 'coinbase', 'binance', 'bitstamp', 'gemini',
    'okx', 'bybit', 'kucoin', 'huobi',
    'exchange tos', 'exchange terms', 'public market data',
    'commercial api', 'commercial use only',
    'redistribution prohibited', 'no redistribution',
    'all rights reserved',
  ];
  for (const pat of RISKY) {
    if (lic.includes(pat)) return false;
  }

  // 2. Explicit safe patterns → allow
  const SAFE = [
    'public domain',
    'cc0',
    'cc by 4.0', 'cc by 3.0', 'cc by 2.5',   // NOT cc by-sa, NOT cc by-nc
    'mit ', 'mit,', 'mit license', 'mit data',
    'apache', 'bsd',
    'free reuse, commercial ok',
    'free, keyless public api',
    'open public api',
    'open data',
    'open repository',
    'open (eu',
    'open preprint',
    'open access',
    'public api (open)',        // explicit "open" in parens
  ];
  for (const pat of SAFE) {
    if (lic.includes(pat)) return true;
  }

  // 3. Default: block (fail closed)
  return false;
}

/**
 * Returns { safe: boolean, footer: string }
 * - safe=true → all sectors used are whitelisted → bot may post
 * - safe=false → at least one sector has unknown/unverified license → bot should suppress
 */
export async function checkAttribution(sectorsUsed) {
  if (!sectorsUsed || sectorsUsed.length === 0) {
    return { safe: true, footer: '' };
  }
  const data = await loadSources();
  const attributions = new Set();
  let allSafe = true;

  for (const sector of sectorsUsed) {
    const info = data[sector];
    if (!isWhitelisted(info)) {
      allSafe = false;
      continue;
    }
    const attr = info.attribution;
    if (attr) attributions.add(attr);
  }

  if (!allSafe) {
    return { safe: false, footer: '' };
  }

  const names = [...attributions];
  const footer = names.length > 0
    ? `Data: ${names.join(', ')} · /sources for full attribution`
    : '';

  return { safe: true, footer };
}

/**
 * Legacy signature — returns footer or empty string, no safety signal.
 * Only use if you're sure sectors are whitelisted. Prefer checkAttribution().
 */
export async function attributionForPost(sectorsUsed) {
  const r = await checkAttribution(sectorsUsed);
  return r.footer;
}

export async function sourcesCommandText() {
  const data = await loadSources();
  const counts = { pd: 0, ccBy: 0, cc0: 0, other: 0, unknown: 0 };

  for (const [_, info] of Object.entries(data)) {
    if (info.status === 'REMOVED') continue;
    const lic = (info.license || '').toLowerCase();
    if (lic.includes('public domain') || lic.includes('free reuse')) counts.pd++;
    else if (lic.includes('cc by')) counts.ccBy++;
    else if (lic.includes('cc0')) counts.cc0++;
    else if (lic.includes('unverified') || info.status === 'REVIEW') counts.unknown++;
    else counts.other++;
  }

  return [
    '📊 VolatiAI data sources',
    '',
    `• U.S. Government public domain: ${counts.pd} sectors`,
    `• CC BY 4.0 (attribution): ${counts.ccBy} sectors`,
    `• CC0 (public domain dedication): ${counts.cc0} sectors`,
    `• Other public APIs: ${counts.other} sectors`,
    '',
    `Total: ${counts.pd + counts.ccBy + counts.cc0 + counts.other}`,
    '',
    'Full attribution:',
    'github.com/christianscode1994/VolatiAI/blob/main/docs/attribution.md',
  ].join('\n');
}

export function sourcesCommandShort() {
  return 'Data: US Gov PD, CC BY 4.0, CC0. Full attribution: /sources or github.com/christianscode1994/VolatiAI/blob/main/docs/attribution.md';
}

