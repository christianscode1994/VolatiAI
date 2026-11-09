import { safeDigest } from './scripts/safe_digest.mjs';
// broadcast-v2.js — honest broadcaster.
// Reads docs/briefing.json, posts headline to each configured platform.
// No anti-detection. No personas. No swarm. No evasion.
// If a platform rate-limits or blocks, we skip it and move on.

import fs from "node:fs";
import axios from "axios";
import pkg from "@atproto/api";
const { BskyAgent } = pkg;
import Mastodon from "mastodon-api";
import { finalizeEvent } from "nostr-tools";
import WebSocket from "ws";
import { pause } from "./pacing.js";

const WORKER = "https://sector-slow.fourieranalys.workers.dev";

function fitForPlatform(text, maxLen) {
  if (text.length <= maxLen) return text;

  const lines = text.split('\n');
  const footerIdx = lines.findIndex(l => l.startsWith('━') || l.startsWith('⚠️ Info only'));

  if (footerIdx < 0) {
    // No footer (unusual), truncate whole
    let cut = text.slice(0, maxLen - 3);
    const lastNl = cut.lastIndexOf('\n');
    if (lastNl > maxLen * 0.6) cut = cut.slice(0, lastNl);
    return cut + '...';
  }

  const footer = lines.slice(footerIdx).join('\n');
  const content = lines.slice(0, footerIdx);
  const header = content[0] || '';
  const signals = content.slice(1);

  const room = maxLen - footer.length - header.length - 5;

  if (room < 100) {
    // Footer alone nearly fills the platform — use compact footer
    const compact = '\n⚠️ Not financial advice · AI-generated · Non-commercial\n📚 https://christianscode1994.github.io/VolatiAI/attribution.json';
    const avail = maxLen - compact.length - header.length - 2;
    let sig = signals.join('\n').slice(0, Math.max(0, avail));
    const lastNl = sig.lastIndexOf('\n');
    if (lastNl > avail * 0.6) sig = sig.slice(0, lastNl);
    return header + '\n' + sig + compact;
  }

  const kept = [];
  let used = 0;
  for (const s of signals) {
    if (used + s.length + 1 > room) break;
    kept.push(s);
    used += s.length + 1;
  }
  if (kept.length < signals.length) {
    kept.push('[...' + (signals.length - kept.length) + ' lines truncated for platform length]');
  }
  return header + '\n' + kept.join('\n') + '\n' + footer;
}


const briefing = JSON.parse(fs.readFileSync("docs/briefing.json", "utf8"));
const headline = briefing?.briefing?.headline ?? "VolatiAI: no signals";

// Prefer the canonical categorized format from active.txt if available.
// Falls back to briefing.signals if not.
let activeTextPrefer = null;
try {
  const _raw = fs.readFileSync("docs/active.txt", "utf8").trim();
  if (_raw && _raw.length > 20) {
    // Strip the footer (safeDigest will re-add its own)
    activeTextPrefer = _raw.replace(/\n*— automated[^\n]*$/i, "").trim();
  }
} catch (e) {
  // active.txt missing — use briefing path
}

// Enrichment: fetch epistemic state from the worker.
// Non-fatal — if the worker is down or slow, broadcast still proceeds.
let coherence = null;
let correlation = null;
let cronStatus = null;
// Hard timeout that MUST settle, regardless of whether fetch honors abort
const withTimeout = (promise, ms, label) => Promise.race([
  promise,
  new Promise((_, reject) =>
    setTimeout(() => reject(new Error(`${label} timeout after ${ms}ms`)), ms)
  ),
]);
try {
  const [cohRes, corrRes, cronRes] = await Promise.allSettled([
    withTimeout(fetch(WORKER + "/_coherence"),  10000, "coherence"),
    withTimeout(fetch(WORKER + "/_correlation"), 10000, "correlation"),
    withTimeout(fetch(WORKER + "/_cron_status"), 10000, "cron_status"),
  ]);
  if (cohRes.status === "fulfilled" && cohRes.value.ok) coherence = await cohRes.value.json();
  if (corrRes.status === "fulfilled" && corrRes.value.ok) correlation = await corrRes.value.json();
  if (cronRes.status === "fulfilled" && cronRes.value.ok) cronStatus = await cronRes.value.json();
} catch (e) {
  console.log("enrichment fetch failed (non-fatal):", String(e).slice(0, 100));
}

// ---- Cron staleness check ----
// Cron is scheduled at 17 3 * * * (daily, 03:17 UTC). Anything older
// than 26 hours means a fire was missed. Surface as a warning line at
// the top of the message so readers know the pipeline may be stale.
const CRON_MAX_AGE_H = 26;
let cronWarning = null;
if (cronStatus === null) {
  cronWarning = "CRON STATUS UNKNOWN — /_cron_status unreachable";
} else if (cronStatus.last_run === undefined) {
  cronWarning = "CRON NEVER FIRED — no _last_cron_run key";
} else {
  const last = cronStatus.last_run;
  const ageMs = Date.now() - new Date(last.timestamp).getTime();
  const ageH = ageMs / 3600000;
  if (!Number.isFinite(ageH) || ageH > CRON_MAX_AGE_H) {
    const ageTxt = Number.isFinite(ageH) ? ageH.toFixed(1) + "h" : "unknown";
    cronWarning = `CRON STALE — last run ${ageTxt} ago (source=${last.source ?? "?"}, written=${last.written ?? "?"}, failed=${last.failed ?? "?"})`;
  }
}
const signals = Array.isArray(briefing?.signals) ? briefing.signals : [];
const byDomain = briefing?.briefing?.by_domain ?? {};
const watchlist = Array.isArray(briefing?.watchlist) ? briefing.watchlist : [];

function fmtNum(n) {
  if (typeof n !== "number" || !Number.isFinite(n)) return null;
  if (Math.abs(n) >= 1e9) return (n / 1e9).toFixed(2) + "B";
  if (Math.abs(n) >= 1e6) return (n / 1e6).toFixed(2) + "M";
  if (Math.abs(n) >= 1e3) return (n / 1e3).toFixed(1) + "K";
  if (Math.abs(n) < 10)   return n.toFixed(2);
  return String(Math.round(n));
}

function fmtSignal(s) {
  const sector = s.sector ?? s.name ?? "?";
  const sev = s.severity === "alert" ? "🚨 " : "";
  const summary = (s.summary ?? "").replace(/\s+/g, " ").trim();
  // If numeric data is present (slow-bucket sectors), show value + pct
  if (typeof s.current === "number" || typeof s.value === "number") {
    const v = fmtNum(s.current ?? s.value);
    const pct = (s.pct_change !== null && s.pct_change !== undefined)
      ? ` (${s.pct_change >= 0 ? "+" : ""}${s.pct_change.toFixed(1)}%)`
      : "";
    return `• ${sev}${sector}: ${v}${pct}`;
  }
  // Otherwise it's an event — show the summary
  const trimmed = summary.length > 60 ? summary.slice(0, 57) + "…" : summary;
  return `• ${sev}${sector}: ${trimmed}`;
}

// Domain summary: deliberately dropped. by_domain counts all fired sectors
// (e.g. 50), but the message now caps to 5 signals after tier ranking.
// Showing "45 other, 1 energy, ..." alongside 5 signals is misleading.
// If the bot is ever un-capped, restore the block from git history.
const domainLine = "";

// Full message — for platforms with large or no limits
const fullLines = ["VolatiAI — " + headline];
if (domainLine) fullLines.push(domainLine);
if (signals.length > 0) {
  fullLines.push("");
  for (const s of signals) fullLines.push(fmtSignal(s));
}
if (false && watchlist.length > 0) {
  const watchLines = watchlist.slice(0, 3).map(w =>
    `${w.sector} vol=${Math.round(w.avg_volatility ?? 0)}`
  );
  fullLines.push("");
  fullLines.push("Watchlist: " + watchLines.join(", "));
}
// Enrichment lines: portfolio + correlation + provenance
// (only in fullText, not compactText — those platforms have space)
if (false && coherence?.sectors) {
  const counts = { confirmed: 0, likely: 0, outlier: 0, insufficient: 0, no_data: 0 };
  for (const v of Object.values(coherence.sectors)) {
    const k = v.verdict || "no_data";
    counts[k] = (counts[k] || 0) + 1;
  }
  const portfolioLine = `Portfolio: ${counts.confirmed} confirmed · ${counts.likely} likely · ${counts.outlier} outlier · ${counts.insufficient} new`;
  fullLines.push("");
  fullLines.push(portfolioLine);
}

if (false && correlation?.pairs) {
  // Highest |r| pair with no warning and same_metric=false (meaningful cross-sector)
  const topMeaningful = correlation.pairs.find(p => !p.warning && !p.same_metric && Math.abs(p.r) >= 0.5);
  if (topMeaningful) {
    fullLines.push(`Top correlation: ${topMeaningful.a} ↔ ${topMeaningful.b} r=${topMeaningful.r.toFixed(2)}`);
  }
  // Provenance pair (same_metric=true, highest r)
  const provenance = correlation.pairs
    .filter(p => p.same_metric)
    .sort((x, y) => Math.abs(y.r) - Math.abs(x.r))[0];
  if (provenance) {
    fullLines.push(`Provenance: ${provenance.a} ↔ ${provenance.b} r=${provenance.r.toFixed(2)} (verified)`);
  }
}

if (cronWarning) {
  fullLines.unshift("");
  fullLines.unshift("⚠️ " + cronWarning);
}

const fullText = activeTextPrefer || fullLines.join("\n");

// Compact message — for Bluesky's 300-char limit
const compactLines = ["VolatiAI — " + headline];
if (domainLine) compactLines.push(domainLine);
if (signals.length > 0) {
  compactLines.push("");
  for (const s of signals.slice(0, 3)) compactLines.push(fmtSignal(s));
  if (signals.length > 3) compactLines.push(`+${signals.length - 3} more`);
}
const compactText = activeTextPrefer
  ? activeTextPrefer.replace(/^VolatiAI[^\n]*\n+/, "")
  : compactLines.join("\n");

function truncateGraphemes(text, maxG, maxB = Infinity) {
  if (!text) return "";
  const seg = new Intl.Segmenter('en', { granularity: 'grapheme' });
  const enc = new TextEncoder();
  const gs = [...seg.segment(text)];
  let gCount = 0, bCount = 0, cut = gs.length;
  for (let i = 0; i < gs.length; i++) {
    const b = enc.encode(gs[i].segment).length;
    if (gCount + 1 > maxG || bCount + b > maxB) { cut = i; break; }
    gCount++; bCount += b;
  }
  if (cut >= gs.length) return text;
  const truncatedAll = gs.slice(0, cut).map(g => g.segment).join('');
  const lookback = gs.slice(Math.max(0, cut - 80), cut).map(g => g.segment).join('');
  const sentMatches = [...lookback.matchAll(/[.!?](?=\s|$)/g)];
  if (sentMatches.length > 0) {
    const lastPos = sentMatches[sentMatches.length - 1].index;
    const keepLen = truncatedAll.length - (lookback.length - lastPos - 1);
    if (keepLen > 20) return truncatedAll.slice(0, keepLen).trimEnd() + '\u2026';
  }
  let backoff = cut;
  for (let i = cut - 1; i >= Math.max(0, cut - 40); i--) {
    if (/\s/.test(gs[i].segment)) { backoff = i; break; }
  }
  const finalCut = backoff > 0 ? backoff : cut;
  return gs.slice(0, finalCut).map(g => g.segment).join('').trimEnd() + '\u2026';
}

// Per-platform truncation
const forBluesky  = truncateGraphemes(compactText, 290, 2900);
const forMastodon = truncateGraphemes(fullText, 490);
const forDiscord  = truncateGraphemes(fullText, 1990);
const forSlack    = truncateGraphemes(fullText, 2990);
const forTelegram = truncateGraphemes(fullText, 4080);
const forNostr    = fullText;

const ts = new Date().toISOString();

console.log(`[${ts}] broadcasting:\n${fullText}\n---`);

async function postTelegram() {
  if (!process.env.TELEGRAM_BOT_TOKEN || !process.env.TELEGRAM_CHAT_ID) {
    console.log("telegram: skipped (no credentials)");
    return;
  }
  await pause("telegram");
  try {
    await axios.post(
      `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`,
      { chat_id: process.env.TELEGRAM_CHAT_ID, text: safeDigest(forTelegram, "telegram"), disable_web_page_preview: true }
    );
    console.log("telegram: ok");
  } catch (e) {
    console.log(`telegram: failed (${e.response?.status ?? "network"}) — ${String(e.message).slice(0, 100)}`);
  }
}

async function postDiscord() {
  if (!process.env.DISCORD_WEBHOOK_URL) {
    console.log("discord: skipped (no webhook)");
    return;
  }
  await pause("discord");
  try {
    await axios.post(process.env.DISCORD_WEBHOOK_URL, { content: safeDigest(forDiscord, "discord") });
    console.log("discord: ok");
  } catch (e) {
    console.log(`discord: failed (${e.response?.status ?? "network"}) — ${String(e.message).slice(0, 100)}`);
  }
}

async function postSlack() {
  if (!process.env.SLACK_WEBHOOK_URL) {
    console.log("slack: skipped (no webhook)");
    return;
  }
  await pause("slack");
  try {
    await axios.post(process.env.SLACK_WEBHOOK_URL, { text: safeDigest(forSlack, "slack") });
    console.log("slack: ok");
  } catch (e) {
    console.log(`slack: failed (${e.response?.status ?? "network"}) — ${String(e.message).slice(0, 100)}`);
  }
}

async function postMastodon() {
  if (!process.env.MASTODON_INSTANCE || !process.env.MASTODON_ACCESS_TOKEN) {
    console.log("mastodon: skipped (no credentials)");
    return;
  }
  await pause("mastodon");
  try {
    let instance = process.env.MASTODON_INSTANCE.replace(/\/$/, "");
    if (!instance.startsWith("http")) instance = "https://" + instance;
    const text = fitForPlatform(safeDigest(forMastodon, "mastodon"), 490);
    const r = await axios.post(
      `${instance}/api/v1/statuses`,
      { status: text, visibility: "public" },
      {
        headers: {
          "Authorization": `Bearer ${process.env.MASTODON_ACCESS_TOKEN}`,
          "Content-Type": "application/json",
        },
        timeout: 20000,
      }
    );
    console.log("mastodon: ok");
  } catch (e) {
    const status = e.response?.status ?? "network";
    const msg = String(e.response?.data?.error ?? e.message).slice(0, 100);
    console.log(`mastodon: failed (${status}) — ${msg}`);
  }
}

async function postBluesky() {
  if (!process.env.BLUESKY_HANDLE || !process.env.BLUESKY_PASSWORD) {
    console.log("bluesky: skipped (no credentials)");
    return;
  }
  await pause("bluesky");
  try {
    const agent = new BskyAgent({ service: "https://bsky.social" });
    await agent.login({
      identifier: process.env.BLUESKY_HANDLE,
      password: process.env.BLUESKY_PASSWORD,
    });
    const bskyText = fitForPlatform(safeDigest(forBluesky, "bluesky"), 290);
    await agent.post({ text: bskyText, createdAt: new Date().toISOString() });
    console.log("bluesky: ok");
  } catch (e) {
    console.log(`bluesky: failed (${e.response?.status ?? "network"}) — ${String(e.message).slice(0, 100)}`);
  }
}

async function postNostr() {
  if (!process.env.NOSTR_PRIVATE_KEY || !process.env.NOSTR_RELAY) {
    console.log("nostr: skipped (no credentials)");
    return;
  }
  await pause("nostr");
  try {
    const privkey = Buffer.from(process.env.NOSTR_PRIVATE_KEY, "hex");
    const event = finalizeEvent(
      {
        kind: 1,
        created_at: Math.floor(Date.now() / 1000),
        tags: [["t", "volatiai"], ["t", "bot"]],
        content: safeDigest(forNostr, "nostr"),
      },
      privkey
    );
    const ws = new WebSocket(process.env.NOSTR_RELAY);
    await new Promise((resolve) => {
      const timeout = setTimeout(() => { ws.close(); resolve(); }, 5000);
      ws.addEventListener("open", () => ws.send(JSON.stringify(["EVENT", event])));
      ws.addEventListener("message", () => { clearTimeout(timeout); ws.close(); resolve(); });
      ws.addEventListener("error", () => { clearTimeout(timeout); resolve(); });
    });
    console.log("nostr: ok");
  } catch (e) {
    console.log(`nostr: failed — ${String(e.message).slice(0, 100)}`);
  }
}

// Run all in parallel, each isolated. One failure never blocks another.
// Each platform has 30s to complete. Prevents indefinite hangs on
// axios/fetch calls that never resolve (e.g. server accepted connection
// but stopped responding). After this, top-level await always settles.
await Promise.allSettled([
  withTimeout(postTelegram(),  30000, "telegram"),
  withTimeout(postDiscord(),   30000, "discord"),
  withTimeout(postSlack(),     30000, "slack"),
  withTimeout(postMastodon(),  30000, "mastodon"),
  withTimeout(postBluesky(),   30000, "bluesky"),
  withTimeout(postNostr(),     30000, "nostr"),
]);

console.log(`[${new Date().toISOString()}] broadcast complete`);
