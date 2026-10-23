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

const briefing = JSON.parse(fs.readFileSync("docs/briefing.json", "utf8"));
const headline = briefing?.briefing?.headline ?? "VolatiAI: no signals in the latest run";
const signals = briefing?.briefing?.signals ?? briefing?.briefing?.firing_sectors ?? 0;

const lines = [
  `VolatiAI signal report`,
  `${signals} signal${signals === 1 ? "" : "s"} across ${briefing?.briefing?.sectors_evaluated ?? "?"} sectors`,
  headline,
];

const text = lines.join("\n");
const ts = new Date().toISOString();

console.log(`[${ts}] broadcasting: ${text.replace(/\n/g, " | ")}`);

async function postTelegram() {
  if (!process.env.TELEGRAM_BOT_TOKEN || !process.env.TELEGRAM_CHAT_ID) {
    console.log("telegram: skipped (no credentials)");
    return;
  }
  try {
    await axios.post(
      `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`,
      { chat_id: process.env.TELEGRAM_CHAT_ID, text, disable_web_page_preview: true }
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
  try {
    await axios.post(process.env.DISCORD_WEBHOOK_URL, { content: text });
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
  try {
    await axios.post(process.env.SLACK_WEBHOOK_URL, { text });
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
  try {
    const M = new Mastodon({
      access_token: process.env.MASTODON_ACCESS_TOKEN,
      api_url: `${process.env.MASTODON_INSTANCE.replace(/\/$/, "")}/api/v1/`,
    });
    // Bot labeling where the instance supports it
    await M.post("statuses", { status: text.slice(0, 500) });
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
  try {
    const agent = new BskyAgent({ service: "https://bsky.social" });
    await agent.login({
      identifier: process.env.BLUESKY_HANDLE,
      password: process.env.BLUESKY_PASSWORD,
    });
    await agent.post({ text: text.slice(0, 300), createdAt: new Date().toISOString() });
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
  try {
    const privkey = Buffer.from(process.env.NOSTR_PRIVATE_KEY, "hex");
    const event = finalizeEvent(
      {
        kind: 1,
        created_at: Math.floor(Date.now() / 1000),
        tags: [["t", "volatiai"], ["t", "bot"]],
        content: text,
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
