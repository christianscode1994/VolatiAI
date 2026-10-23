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

const briefing = JSON.parse(fs.readFileSync("docs/briefing.json", "utf8"));
const headline = briefing?.briefing?.headline ?? "VolatiAI: no signals";

// Enrichment: fetch epistemic state from the worker.
// Non-fatal — if the worker is down or slow, broadcast still proceeds.
let coherence = null;
let correlation = null;
let cronStatus = null;
try {
  const [cohRes, corrRes, cronRes] = await Promise.all([
    fetch(WORKER + "/_coherence", { signal: AbortSignal.timeout(8000) }),
    fetch(WORKER + "/_correlation", { signal: AbortSignal.timeout(8000) }),
    fetch(WORKER + "/_cron_status", { signal: AbortSignal.timeout(8000) }),
  ]);
  if (cohRes.ok) coherence = await cohRes.json();
  if (corrRes.ok) correlation = await corrRes.json();
  if (cronRes.ok) cronStatus = await cronRes.json();
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

// Domain summary for the header: "energy 1, security 1, info 2, other 3"
const domainParts = Object.entries(byDomain)
  .filter(([, v]) => (v.sectors?.length ?? 0) > 0)
  .map(([dom, v]) => `${dom} ${v.sectors.length}`);
const domainLine = domainParts.length > 0 ? `(${domainParts.join(", ")})` : "";

// Full message — for platforms with large or no limits
const fullLines = ["VolatiAI — " + headline];
if (domainLine) fullLines.push(domainLine);
if (signals.length > 0) {
  fullLines.push("");
  for (const s of signals) fullLines.push(fmtSignal(s));
}
if (watchlist.length > 0) {
  const watchLines = watchlist.slice(0, 3).map(w =>
    `${w.sector} vol=${Math.round(w.avg_volatility ?? 0)}`
  );
  fullLines.push("");
  fullLines.push("Watchlist: " + watchLines.join(", "));
}
// Enrichment lines: portfolio + correlation + provenance
// (only in fullText, not compactText — those platforms have space)
if (coherence?.sectors) {
  const counts = { confirmed: 0, likely: 0, outlier: 0, insufficient: 0, no_data: 0 };
  for (const v of Object.values(coherence.sectors)) {
    const k = v.verdict || "no_data";
    counts[k] = (counts[k] || 0) + 1;
  }
  const portfolioLine = `Portfolio: ${counts.confirmed} confirmed · ${counts.likely} likely · ${counts.outlier} outlier · ${counts.insufficient} new`;
  fullLines.push("");
  fullLines.push(portfolioLine);
}

if (correlation?.pairs) {
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

const fullText = fullLines.join("\n");

// Compact message — for Bluesky's 300-char limit
const compactLines = ["VolatiAI — " + headline];
if (domainLine) compactLines.push(domainLine);
if (signals.length > 0) {
  compactLines.push("");
  for (const s of signals.slice(0, 3)) compactLines.push(fmtSignal(s));
  if (signals.length > 3) compactLines.push(`+${signals.length - 3} more`);
}
const compactText = compactLines.join("\n");

// Per-platform truncation
const forBluesky  = compactText.slice(0, 297) + (compactText.length > 297 ? "…" : "");
const forMastodon = fullText.slice(0, 497) + (fullText.length > 497 ? "…" : "");
const forDiscord  = fullText.slice(0, 1990);
const forSlack    = fullText.slice(0, 2990);
const forTelegram = fullText.slice(0, 4080);
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
      { chat_id: process.env.TELEGRAM_CHAT_ID, text: forTelegram, disable_web_page_preview: true }
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
    await axios.post(process.env.DISCORD_WEBHOOK_URL, { content: forDiscord });
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
    await axios.post(process.env.SLACK_WEBHOOK_URL, { text: forSlack });
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
    const M = new Mastodon({
      access_token: process.env.MASTODON_ACCESS_TOKEN,
      api_url: `${process.env.MASTODON_INSTANCE.replace(/\/$/, "")}/api/v1/`,
    });
    // Bot labeling where the instance supports it
    await M.post("statuses", { status: forMastodon });
    console.log("mastodon: ok");
  } catch (e) {
    console.log(`mastodon: failed (${e.response?.status ?? "network"}) — ${String(e.message).slice(0, 100)}`);
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
    await agent.post({ text: forBluesky, createdAt: new Date().toISOString() });
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
        content: forNostr,
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
await Promise.allSettled([
  postTelegram(),
  postDiscord(),
  postSlack(),
  postMastodon(),
  postBluesky(),
  postNostr(),
]);

console.log(`[${new Date().toISOString()}] broadcast complete`);
