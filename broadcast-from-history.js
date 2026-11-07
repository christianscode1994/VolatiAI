#!/usr/bin/env node
import fs from "fs";
import path from "path";
import axios from "axios";

// WebSocket fallback for older Node
if (typeof WebSocket === "undefined") {
  try {
    const { default: WS } = await import("ws");
    globalThis.WebSocket = WS;
  } catch {}
}

const HISTORY = "reports/signal_history.jsonl";
const STATE = "reports/.broadcast-sent.json";
const WINDOW_HOURS = 24;
const DRY_RUN = process.argv.includes("--dry-run");

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
      events.push(e);
    } catch {}
  }
  events.sort((a, b) => new Date(b.ts) - new Date(a.ts));
  return events;
}

function formatMessage(events) {
  const n = events.length;
  const lines = [`VolatiAI — ${n} new signal${n === 1 ? "" : "s"}`, ""];
  for (const e of events.slice(0, 10)) {
    lines.push(`• ${e.sector || e.worker}: ${e.summary}`);
    if (e.link) lines.push(`  ${e.link}`);
    lines.push("");
  }
  if (n > 10) lines.push(`... and ${n - 10} more`);
  return lines.join("\n").trim();
}

async function postSlack(text) {
  const u = process.env.SLACK_WEBHOOK_URL;
  if (!u) return "skipped";
  await axios.post(u, { text }, { timeout: 10000 });
  return "ok";
}

async function postDiscord(text) {
  const u = process.env.DISCORD_WEBHOOK_URL;
  if (!u) return "skipped";
  await axios.post(u, { content: text.slice(0, 1900) }, { timeout: 10000 });
  return "ok";
}

async function postTelegram(text) {
  const t = process.env.TELEGRAM_BOT_TOKEN;
  const c = process.env.TELEGRAM_CHAT_ID;
  if (!t || !c) return "skipped";
  await axios.post(`https://api.telegram.org/bot${t}/sendMessage`, {
    chat_id: c,
    text: text.length > 4000 ? text.slice(0, 4000) + "..." : text,
  }, { timeout: 10000 });
  return "ok";
}

async function postBluesky(text) {
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
        text: text.length > 290 ? text.slice(0, 287) + "..." : text,
        createdAt: new Date().toISOString(),
      },
    },
    { headers: { Authorization: `Bearer ${auth.data.accessJwt}` }, timeout: 10000 }
  );
  return "ok";
}

async function postMastodon(text) {
  let inst = process.env.MASTODON_INSTANCE;
  const t = process.env.MASTODON_ACCESS_TOKEN;
  if (!inst || !t) return "skipped";
  inst = inst.replace(/\/$/, "");
  if (!inst.startsWith("http")) inst = "https://" + inst;
  await axios.post(
    `${inst}/api/v1/statuses`,
    { status: text.length > 490 ? text.slice(0, 487) + "..." : text, visibility: "public" },
    { headers: { Authorization: `Bearer ${t}` }, timeout: 20000 }
  );
  return "ok";
}

async function postNostr(text) {
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
      content: text.slice(0, 1000),
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
  const message = formatMessage(unsent);
  if (DRY_RUN) {
    console.log(message);
    console.log("\n" + unsent.length + " event(s)");
    return;
  }
  console.log("Broadcasting " + unsent.length + " event(s)...");
  const platforms = [
    ["slack", postSlack],
    ["discord", postDiscord],
    ["telegram", postTelegram],
    ["bluesky", postBluesky],
    ["mastodon", postMastodon],
    ["nostr", postNostr],
  ];
  for (const [name, fn] of platforms) {
    try {
      const r = await fn(message);
      console.log(name + ": " + r);
    } catch (e) {
      console.log(name + ": failed (" + (e.response?.status || "error") + ")");
    }
  }
  const now = new Date().toISOString();
  for (const e of unsent) state.sent[e.signature || (e.worker + ":" + e.summary)] = now;
  saveState(state);
}

main().catch(e => { console.error("fatal:", e.message); process.exit(1); });
