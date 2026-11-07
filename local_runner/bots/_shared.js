const ACTIVE_TXT_URL = 'https://christianscode1994.github.io/VolatiAI/active.txt';

const LIMITS = {
  bluesky: 280,
  mastodon: 480,
  discord: 1900,
  telegram: 4000,
  slack: 3900,
  nostr: 30000,
};

export async function fetchActiveText(platform) {
  try {
    const r = await fetch(ACTIVE_TXT_URL, { cache: 'no-store' });
    if (!r.ok) return null;
    const text = await r.text();
    const limit = LIMITS[platform] || 4000;
    if (text.length <= limit) return text;
    return text.slice(0, limit - 20).trimEnd() + '\n\n[…truncated]';
  } catch (e) {
    return null;
  }
}
