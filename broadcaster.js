// broadcaster.js
import axios from "axios";
import pkg from "@atproto/api";
const { BskyAgent } = pkg;
import Mastodon from "mastodon-api";
import { finalizeEvent } from "nostr-tools";

// --------------------------------------
//  RELAY HEALTH SCORING
// --------------------------------------

const relayHealth = {}; // { relayUrl: score }

function scoreRelay(relay, delta) {
  relayHealth[relay] = Math.max(-5, Math.min(5, (relayHealth[relay] ?? 0) + delta));
}

function getRelayScore(relay) {
  return relayHealth[relay] ?? 0;
}

// --------------------------------------
//  PLATFORM ADAPTERS
// --------------------------------------

async function slack(message) {
  if (!process.env.SLACK_WEBHOOK_URL) return;
  await axios.post(process.env.SLACK_WEBHOOK_URL, { text: message });
}

async function discord(message) {
  if (!process.env.DISCORD_WEBHOOK_URL) return;
  await axios.post(process.env.DISCORD_WEBHOOK_URL, { content: message });
}

async function telegram(message) {
  if (!process.env.TELEGRAM_BOT_TOKEN || !process.env.TELEGRAM_CHAT_ID) return;
  const url = `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`;
  await axios.post(url, { chat_id: process.env.TELEGRAM_CHAT_ID, text: message });
}

async function bluesky(message) {
  if (!process.env.BLUESKY_HANDLE) return;

  const agent = new BskyAgent({ service: "https://bsky.social" });

  await agent.login({
    identifier: process.env.BLUESKY_HANDLE,
    password: process.env.BLUESKY_PASSWORD,
  });

  await agent.post({ text: message });
}

async function mastodon(message) {
  if (!process.env.MASTODON_INSTANCE) return;
  const M = new Mastodon({
    access_token: process.env.MASTODON_ACCESS_TOKEN,
    api_url: `${process.env.MASTODON_INSTANCE}/api/v1/`,
  });
  await M.post("statuses", { status: message });
}

// --------------------------------------
//  NOSTR BROADCASTER (HEALTH + REDUNDANCY)
// --------------------------------------

async function nostr(message, EVENT_ID) {
  if (!process.env.NOSTR_PRIVATE_KEY) return;

  const relays = (process.env.NOSTR_RELAYS || "")
    .split(",")
    .map(r => r.trim())
    .filter(Boolean);

  if (relays.length === 0) {
    console.log("No Nostr relays configured.");
    return;
  }

  // Sort relays by health score (descending)
  relays.sort((a, b) => getRelayScore(b) - getRelayScore(a));

  // Multi-relay redundancy settings
  const MIN_GOOD_RELAYS = 3;   // always send to at least 3 good relays
  const MAX_TOTAL_RELAYS = 6;  // never send to more than 6 relays

  // Start with top relays
  let selectedRelays = relays.slice(0, MAX_TOTAL_RELAYS);

  // Ensure minimum number of good relays
  const goodRelays = selectedRelays.filter(r => getRelayScore(r) >= 0);

  if (goodRelays.length < MIN_GOOD_RELAYS) {
    const extraRelays = relays
      .filter(r => !goodRelays.includes(r))
      .slice(0, MIN_GOOD_RELAYS - goodRelays.length);

    selectedRelays.push(...extraRelays);
  }

  // Remove duplicates
  const finalRelays = [...new Set(selectedRelays)];

  console.log("Selected Nostr relays:", finalRelays);

  // Event template
  const eventTemplate = {
    kind: 1,
    created_at: Math.floor(Date.now() / 1000),
    tags: [["e", EVENT_ID]],
    content: message,
  };

  // Manual hex → Uint8Array conversion
  const hex = process.env.NOSTR_PRIVATE_KEY;
  const privkey = new Uint8Array(hex.match(/.{1,2}/g).map(byte => parseInt(byte, 16)));

  const event = finalizeEvent(eventTemplate, privkey);

  // Fan-out with relay-health scoring + redundancy
  for (const relay of finalRelays) {
    const score = getRelayScore(relay);

    // Skip extremely unhealthy relays
    if (score <= -3) {
      console.log(`Skipping unhealthy relay (${score}): ${relay}`);
      continue;
    }

    const url = relay
      .replace("wss://", "https://")
      .replace("ws://", "https://")
      .replace(/\/$/, "") + "/api/event";

    try {
      await axios.post(url, event);
      console.log(`Nostr relay OK: ${relay}`);
      scoreRelay(relay, +1);
    } catch (err) {
      console.log(`Nostr relay FAIL: ${relay}`);
      scoreRelay(relay, -2);
    }
  }
}

// --------------------------------------
//  EXPORTABLE BROADCAST FUNCTION
// --------------------------------------

export async function broadcast(message, platforms) {
  const EVENT_ID = `VAI-${Date.now()}-${Math.floor(Math.random() * 999999)}`;

  console.log(`Broadcasting… (EVENT_ID: ${EVENT_ID})`);
  console.log(`Message: ${message}`);
  console.log(`Platforms: ${platforms.join(", ")}`);

  if (platforms.includes("slack")) await slack(message);
  if (platforms.includes("discord")) await discord(message);
  if (platforms.includes("telegram")) await telegram(message);
  if (platforms.includes("bluesky")) await bluesky(message);
  if (platforms.includes("mastodon")) await mastodon(message);
  if (platforms.includes("nostr")) await nostr(message, EVENT_ID);

  console.log("Broadcast complete.");
}
