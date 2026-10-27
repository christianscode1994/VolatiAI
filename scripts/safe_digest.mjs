const SITE = process.env.VOLATIAI_SITE
  || 'https://christianscode1994.github.io/VolatiAI';

const FOOTER = `━━━━━━━━━━━━━━━━━━━━━━━━━━━━
⚠️  Informational only. Not financial, medical, or legal advice.
🤖  Automated bot · Non-commercial · Stateless
📚  Attribution: ${SITE}/attribution.json
📄  Terms: ${SITE}/terms.html
━━━━━━━━━━━━━━━━━━━━━━━━━━━━`;

const HIGH_RISK = /coinbase-|kraken-|\bdex-|defi-|stablecoin-|exchange-spread|^treasuries|^fed-rate|^btc-|^eth-|nbp-gold/i;

function sanitize(text) {
  return text
    .replace(/↗ (\S+): signaling (\d+) runs in a row/g, '$1: above threshold $2/$2 checks')
    .replace(/↓ (\S+): down (\d+) runs/g, '$1: down $2 checks')
    .replace(/↑ (\S+): up (\d+) runs/g, '$1: up $2 checks')
    .replace(/^↗ /gm, '').replace(/^↘ /gm, '')
    .replace(/^↑ /gm, '').replace(/^↓ /gm, '')
    .replace(/🔬 VolatiAI Epistemic Digest/g, '🔬 VolatiAI — Public Data Digest')
    .replace(/📈 Trends$/gm, '📊 Trends (raw deltas · 5-check window)')
    .replace(/🟡 Events$/gm, '🟡 New items detected')
    .replace(/🔴 Dense signals$/gm, '🔴 Frequent-change sectors')
    .replace(/⚪ Slow trends$/gm, '⚪ Slow-change sectors')
    .replace(/✓ (\S+) \(100%\)/g, '• $1: 1 new item')
    .replace(/🔔 (\S+): silent (\d+) runs, now signaling/g,
             '🔔 $1: was quiet $2 checks, now above threshold');
}

function filterHighRisk(text) {
  const lines = text.split('\n');
  const kept = [];
  let removed = 0;
  for (const line of lines) {
    if (HIGH_RISK.test(line)) removed++;
    else kept.push(line);
  }
  if (removed > 0) {
    kept.push('');
    kept.push(`[${removed} financial signals omitted on this platform — see ${SITE}/intel.json]`);
  }
  return kept.join('\n');
}

export function safeDigest(text, platform = 'all') {
  let out = sanitize(text);
  if (platform === 'telegram' || platform === 'mastodon') out = filterHighRisk(out);
  out = out.trimEnd() + '\n\n' + FOOTER;
  if (platform === 'mastodon' || platform === 'bluesky') {
    out += '\n\n#NotFinancialAdvice #DataJournalism';
  }
  return out;
}

// Content-only (no footer) — for the formatForPlatform output,
// if the bot is expected to add its own footer separately
export function safeContent(text, platform = 'all') {
  let out = sanitize(text);
  if (platform === 'telegram' || platform === 'mastodon') out = filterHighRisk(out);
  return out;
}
