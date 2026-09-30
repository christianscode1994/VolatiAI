import axios from "axios";
import pkg from "@atproto/api";
const { BskyAgent } = pkg;
import Mastodon from "mastodon-api";
import { finalizeEvent } from "nostr-tools";

// Fresh workflow message
const MESSAGE = "VolatiAI broadcast test — swarm online.";

// Runtime-only event ID (serverless, ephemeral)
const EVENT_ID = `VAI-${Date.now()}-${Math.floor(Math.random() * 999999)}`;

async function slack() {
  if (!process.env.SLACK_WEBHOOK_URL) return;
  await axios.post(process.env.SLACK_WEBHOOK_URL, { text: MESSAGE });
}

async function discord() {
  if (!process.env.DISCORD_WEBHOOK_URL) return;
  await axios.post(process.env.DISCORD_WEBHOOK_URL, { content: MESSAGE });
}

async function telegram() {
  if (!process.env.TELEGRAM_BOT_TOKEN || !process.env.TELEGRAM_CHAT_ID) return;
  const url = `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`;
  await axios.post(url, { chat_id: process.env.TELEGRAM_CHAT_ID, text: MESSAGE });
}

async function bluesky() {
  if (!process.env.BLUESKY_HANDLE) return;

  const agent = new BskyAgent({ service: "https://bsky.social" });

  await agent.login({
    identifier: process.env.BLUESKY_HANDLE,
    password: process.env.BLUESKY_PASSWORD,
  });

  await agent.post({ text: MESSAGE });
}

async function mastodon() {
  if (!process.env.MASTODON_INSTANCE) return;
  const M = new Mastodon({
    access_token: process.env.MASTODON_ACCESS_TOKEN,
    api_url: `${process.env.MASTODON_INSTANCE}/api/v1/`,
  });
  await M.post("statuses", { status: MESSAGE });
}

async function nostr() {
  if (!process.env.NOSTR_PRIVATE_KEY) return;

  // Multi-relay list (comma-separated)
  const relays = (process.env.NOSTR_RELAYS || "")
    .split(",")
    .map(r => r.trim())
    .filter(Boolean);

  if (relays.length === 0) {
    console.log("No Nostr relays configured.");
    return;
  }

  // Event template with cross-relay event ID tag
  const eventTemplate = {
    kind: 1,
    created_at: Math.floor(Date.now() / 1000),
    tags: [["e", EVENT_ID]], // ⭐ Cross-relay correlation tag
    content: MESSAGE,
  };

  // Manual hex → Uint8Array conversion
  const hex = process.env.NOSTR_PRIVATE_KEY;
  const privkey = new Uint8Array(hex.match(/.{1,2}/g).map(byte => parseInt(byte, 16)));

  const event = finalizeEvent(eventTemplate, privkey);

  // Fan-out to all relays
  for (const relay of relays) {
    const url = relay
      .replace("wss://", "https://")
      .replace("ws://", "https://")
      .replace(/\/$/, "") + "/api/event";

    try {
      await axios.post(url, event);
      console.log(`Nostr relay OK: ${relay}`);
    } catch (err) {
      console.log(`Nostr relay FAIL: ${relay}`);
    }
  }
}

async function main() {
  console.log(`Broadcasting… (EVENT_ID: ${EVENT_ID})`);

  await slack();
  await discord();
  await telegram();
  await bluesky();
  await mastodon();
  await nostr();

  console.log("Broadcast complete.");
}

main();
