#!/usr/bin/env node
import fs from "fs";
import path from "path";
import axios from "axios";

if (typeof WebSocket === "undefined") {
  try {
    const { default: WS } = await import("ws");
    globalThis.WebSocket = WS;
  } catch {}
}

const HISTORY = "reports/signal_history.jsonl";
const STATE = "reports/.broadcast-sent.json";
const WINDOW_HOURS = 24;
const BRIEF_URL = "christianscode1994.github.io/VolatiAI/brief.html";
const DRY_RUN = process.argv.includes("--dry-run");

// Skip these sectors from every broadcast (edit to add more noise)
const SKIP_SECTORS = new Set(["sports-fitness"]);

// Sectors that need keyword filtering — only pass newsworthy items
const FILTER_SECTORS = new Set(["news", "events"]);

// Real news keywords — acquisitions, deals, money, regulation, security
const NEWSWORTHY = /\b(acqui(?:re|red|sition)|merger|IPO|SEC|FTC|DOJ|lawsuit|bankrupt|shutdown|raise[sd]?\s+\$|valuation|deal|billion|million|hack|breach|leak|recall)\b/i;

function isNewsworthy(summary) {
  if (!summary) return false;
  return NEWSWORTHY.test(summary);
}

function loadState() {
  try { return JSON.parse(fs.readFileSync(STATE, "utf8")); }
  catch { return { sent: {} }; }
}

function saveState(s) {
  fs.mkdirSync("reports", { recursive: true });
  fs.writeFileSync(STATE, JSON.stringify(s, null, 2));
}

function loadEvents() {
  if (!fs.existsSync(HISTORY)) return [];
  const cutoff = Date.now() - WINDOW_HOURS * 3600 * 1000;
  const events = [];
  for (const line of fs.readFileSync(HISTORY, "utf8").split("\n")) {
    if (!line.trim()) continue;
    try {
      const e = JSON.parse(line);
      const ts = new Date(e.ts).getTime();
      if (isNaN(ts) || ts < cutoff) continue;
      if (!e.has_signal) continue;
      if (!e.summary || e.summary.toLowerCase() === "quiet") continue;
      const sector = (e.sector || e.worker || "").toLowerCase();
      if (SKIP_SECTORS.has(sector)) continue;
      if (FILTER_SECTORS.has(sector) && !isNewsworthy(e.summary || "")) continue;
      events.push(e);
    } catch {}
  }
  events.sort((a, b) => new Date(b.ts) - new Date(a.ts));
  return events;
}

function shortLabel(e) {
  const s = e.summary || "";
  const m = s.match(/New 13F:\s*13F-HR\s*-\s*(.+?)\s*\(\d+\)/i);
  if (m) return m[1].trim();
  return s.replace(/^New:\s*/i, "").slice(0, 45);
}

function cleanFull(e) {
  const s = e.summary || "";
  const m = s.match(/New 13F:\s*13F-HR\s*-\s*(.+?)\s*\(\d+\)\s*\(Filer\)/i);
  if (m) return m[1].trim() + " filed 13F";
  return s.replace(/^New:\s*/i, "");
}

function groupBySector(events) {
  const g = {};
  for (const e of events) {
    const s = e.sector || e.worker || "other";
    if (!g[s]) g[s] = [];
    g[s].push(e);
  }
  return g;
}

// Full format for Telegram / Discord / Slack / Nostr
function formatFull(events) {
  const lines = [];
  lines.push(`VolatiAI — ${events.length} new signal${events.length === 1 ? "" : "s"}`);
  lines.push("");
  const groups = groupBySector(events);
  for (const [sector, items] of Object.entries(groups)) {
    lines.push(`*${sector}* (${items.length}):`);
    for (const e of items) {
      lines.push(`  • ${cleanFull(e)}`);
      if (e.link) lines.push(`    ${e.link}`);
    }
    lines.push("");
  }
  lines.push(`Full: ${BRIEF_URL}`);
  return lines.join("\n").trim();
}

// Short format for Bluesky / Mastodon — grouped by sector, no URLs
function formatShort(events, maxSectors) {
  const lines = [];
  lines.push(`VolatiAI — ${events.length} new signal${events.length === 1 ? "" : "s"}`);
  lines.push("");
  const groups = groupBySector(events);
  let shown = 0;
  let totalShown = 0;
  for (const [sector, items] of Object.entries(groups)) {
    if (shown >= maxSectors) break;
    const labels = items.slice(0, 3).map(shortLabel).join(", ");
    const extra = items.length > 3 ? ` +${items.length - 3}` : "";
    lines.push(`• ${sector} (${items.length}): ${labels}${extra}`);
    totalShown += items.length;
    shown++;
  }
  const hidden = events.length - totalShown;
  if (hidden > 0) lines.push(`…and ${hidden} more`);
  lines.push("");
  lines.push(`Full: ${BRIEF_URL}`);
  return lines.join("\n");
}

function truncate(text, max) {
  if (text.length <= max) return text;
  return text.slice(0, max - 3) + "...";
}

async function postSlack(events) {
  const u = process.env.SLACK_WEBHOOK_URL;
  if (!u) return "skipped";
  await axios.post(u, { text: truncate(formatFull(events), 2900) }, { timeout: 10000 });
  return "ok";
}

async function postDiscord(events) {
  const u = process.env.DISCORD_WEBHOOK_URL;
  if (!u) return "skipped";
  await axios.post(u, { content: truncate(formatFull(events), 1900) }, { timeout: 10000 });
  return "ok";
}

async function postTelegram(events) {
  const t = process.env.TELEGRAM_BOT_TOKEN;
  const c = process.env.TELEGRAM_CHAT_ID;
  if (!t || !c) return "skipped";
  await axios.post(`https://api.telegram.org/bot${t}/sendMessage`, {
    chat_id: c,
    text: truncate(formatFull(events), 4000),
    parse_mode: "Markdown",
  }, { timeout: 10000 });
  return "ok";
}

async function postBluesky(events) {
  const h = process.env.BLUESKY_HANDLE;
  const p = process.env.BLUESKY_PASSWORD;
  if (!h || !p) return "skipped";
  const auth = await axios.post(
    "https://bsky.social/xrpc/com.atproto.server.createSession",
    { identifier: h, password: p },
    { timeout: 10000 }
  );
  await axios.post(
    "https://bsky.social/xrpc/com.atproto.repo.createRecord",
    {
      repo: auth.data.did,
      collection: "app.bsky.feed.post",
      record: {
        text: truncate(formatShort(events, 3), 295),
        createdAt: new Date().toISOString(),
      },
    },
    { headers: { Authorization: `Bearer ${auth.data.accessJwt}` }, timeout: 10000 }
  );
  return "ok";
}

async function postMastodon(events) {
  let inst = process.env.MASTODON_INSTANCE;
  const t = process.env.MASTODON_ACCESS_TOKEN;
  if (!inst || !t) return "skipped";
  inst = inst.replace(/\/$/, "");
  if (!inst.startsWith("http")) inst = "https://" + inst;
  await axios.post(
    `${inst}/api/v1/statuses`,
    { status: truncate(formatShort(events, 5), 490), visibility: "public" },
    { headers: { Authorization: `Bearer ${t}` }, timeout: 20000 }
  );
  return "ok";
}

async function postNostr(events) {
  const privkey = process.env.NOSTR_PRIVATE_KEY;
  const relaysRaw = process.env.NOSTR_RELAYS || "wss://relay.damus.io,wss://nos.lol,wss://relay.nostr.band";
  if (!privkey) return "skipped";
  if (!/^[0-9a-fA-F]{64}$/.test(privkey)) {
    return "skipped (key is " + privkey.length + " chars, need 64-char hex)";
  }
  try {
    const { finalizeEvent } = await import("nostr-tools/pure");
    const { SimplePool } = await import("nostr-tools/pool");
    const hexToBytes = (hex) => {
      const b = new Uint8Array(hex.length / 2);
      for (let i = 0; i < hex.length; i += 2) b[i / 2] = parseInt(hex.substr(i, 2), 16);
      return b;
    };
    const sk = hexToBytes(privkey);
    const event = finalizeEvent({
      kind: 1,
      created_at: Math.floor(Date.now() / 1000),
      tags: [],
      content: truncate(formatFull(events), 4000),
    }, sk);
    const relays = relaysRaw.split(",").map(r => r.trim()).filter(Boolean);
    const pool = new SimplePool();
    const results = await Promise.allSettled(pool.publish(relays, event));
    pool.close(relays);
    const ok = results.filter(r => r.status === "fulfilled").length;
    return ok > 0 ? ("ok (" + ok + "/" + relays.length + " relays)") : ("failed (0/" + relays.length + " relays)");
  } catch (e) {
    return "failed: " + String(e.message || e).slice(0, 100);
  }
}

async function main() {
  const state = loadState();
  const all = loadEvents();
  const unsent = all.filter(e => !state.sent[e.signature || (e.worker + ":" + e.summary)]);
  if (unsent.length === 0) {
    console.log("No new events.");
    return;
  }

  if (DRY_RUN) {
    console.log("=== FULL (telegram/discord/slack/nostr) ===");
    console.log(formatFull(unsent));
    console.log("\n=== SHORT (bluesky) ===");
    console.log(formatShort(unsent, 3));
    console.log("\n=== MEDIUM (mastodon) ===");
    console.log(formatShort(unsent, 5));
    console.log(`\n${unsent.length} event(s) would post`);
    return;
  }

  console.log(`Broadcasting ${unsent.length} event(s)...`);
  const platforms = [
    ["slack", postSlack],
    ["discord", postDiscord],
    ["telegram", postTelegram],
    ["bluesky", postBluesky],
    ["mastodon", postMastodon],
    ["nostr", postNostr],
  ];
  let successCount = 0;
  for (const [name, fn] of platforms) {
    try {
      const r = await fn(unsent);
      console.log(`${name}: ${r}`);
      if (r === "ok" || r.startsWith("ok ")) successCount++;
    } catch (e) {
      const status = e.response?.status ?? "error";
      const msg = String(e.response?.data?.error ?? e.message).slice(0, 100);
      console.log(`${name}: failed (${status}) — ${msg}`);
    }
  }
  if (successCount > 0) {
    const now = new Date().toISOString();
    for (const e of unsent) state.sent[e.signature || (e.worker + ":" + e.summary)] = now;
    saveState(state);
    console.log(`\n${unsent.length} event(s) marked sent (${successCount} platforms OK)`);
  } else {
    console.log("\nNo platform succeeded — will retry next run.");
  }
}

main().catch(e => { console.error("fatal:", e.message); process.exit(1); });
