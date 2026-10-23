// broadcaster.js
import axios from "axios";
import pkg from "@atproto/api";
const { BskyAgent } = pkg;
import Mastodon from "mastodon-api";
import { finalizeEvent } from "nostr-tools";
import crypto from "crypto";

import {
  swarmConfig,
  routingConfig,
  nostrConfig
} from "./config.js";

import { applyPersona } from "./persona.js";
import { antiDetectionPause, shouldSkipPost, throttlePlatform } from "./antiDetection.js";
import { formatForPlatform } from "./contentFormatter.js";
import { shouldThisNodePost } from "./swarmMesh.js";

// --------------------------------------
//  RELAY HEALTH SCORING
// --------------------------------------

const relayHealth = {};

function scoreRelay(relay, delta) {
  relayHealth[relay] = Math.max(-5, Math.min(5, (relayHealth[relay] ?? 0) + delta));
}

function getRelayScore(relay) {
  return relayHealth[relay] ?? 0;
}

// --------------------------------------
//  SWARM MEMORY (SERVERLESS)
// --------------------------------------

const swarmMemory = [];

function rememberHash(hash) {
  swarmMemory.push(hash);
  if (swarmMemory.length > swarmConfig.memoryLimitBroadcast)
    swarmMemory.shift();
}

function hasSeenHash(hash) {
  return swarmMemory.includes(hash);
}

// --------------------------------------
//  SWARM COORDINATION + BACKOFF
// --------------------------------------

function swarmHash(message, EVENT_ID) {
  return crypto
    .createHash("sha256")
    .update(message + EVENT_ID)
    .digest("hex");
}

function swarmBackoff(hash) {
  const num = parseInt(hash.slice(0, 8), 16);
  const normalized = num / 0xffffffff;
  return normalized < swarmConfig.backoffScheduler;
}

function shouldBroadcast(hash) {
  const suffixes = swarmConfig.coordinationSuffixes;
  const lastChar = hash.slice(-1);
  return suffixes.includes(lastChar);
}

// --------------------------------------
//  ANOMALY DETECTION
// --------------------------------------

function isAnomalous(message) {
  const lower = message.toLowerCase();
  return routingConfig.depinPriority.some(k => lower.includes(k));
}

// --------------------------------------
//  CHAIN WATCHER HOOK
// --------------------------------------

async function chainWatcher(message, EVENT_ID) {
  if (!isAnomalous(message)) return;
  console.log(`Chain watcher triggered for EVENT_ID=${EVENT_ID}: ${message}`);
}

// --------------------------------------
//  DePIN ROUTING INTELLIGENCE
// --------------------------------------

function preferredPlatformsFor(message, platforms) {
  const lower = message.toLowerCase();
  const depinKeywords = ["depin", "node", "relay", "infrastructure", "mesh"];

  if (!depinKeywords.some(k => lower.includes(k))) return platforms;

  const priority = routingConfig.depinPriority;
  const rest = platforms.filter(p => !priority.includes(p));

  return [...priority.filter(p => platforms.includes(p)), ...rest];
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

  const relays = nostrConfig.relays;

  if (relays.length === 0) {
    console.log("No Nostr relays configured.");
    return;
  }

  relays.sort((a, b) => getRelayScore(b) - getRelayScore(a));

  const MIN_GOOD_RELAYS = nostrConfig.minGoodRelays;
  const MAX_TOTAL_RELAYS = nostrConfig.maxTotalRelays;

  let selectedRelays = relays.slice(0, MAX_TOTAL_RELAYS);
  const goodRelays = selectedRelays.filter(r => getRelayScore(r) >= 0);

  if (goodRelays.length < MIN_GOOD_RELAYS) {
    const extraRelays = relays
      .filter(r => !goodRelays.includes(r))
      .slice(0, MIN_GOOD_RELAYS - goodRelays.length);

    selectedRelays.push(...extraRelays);
  }

  const finalRelays = [...new Set(selectedRelays)];

  console.log("Selected Nostr relays:", finalRelays);

  const eventTemplate = {
    kind: 1,
    created_at: Math.floor(Date.now() / 1000),
    tags: [["e", EVENT_ID]],
    content: message,
  };

  const hex = process.env.NOSTR_PRIVATE_KEY;
  const privkey = new Uint8Array(hex.match(/.{1,2}/g).map(byte => parseInt(byte, 16)));

  const event = finalizeEvent(eventTemplate, privkey);

  for (const relay of finalRelays) {
    const score = getRelayScore(relay);

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

  const hash = swarmHash(message, EVENT_ID);

  // --- Swarm memory dedupe ---
  if (hasSeenHash(hash)) {
    console.log(`Swarm memory: duplicate detected, skipping (hash=${hash})`);
    return;
  }

  // --- Swarm coordination ---
  if (!shouldBroadcast(hash)) {
    console.log(`Swarm coordination: skipping broadcast (hash=${hash})`);
    rememberHash(hash);
    return;
  }

  // --- Swarm mesh coordination ---
  const nodeId = process.env.NODE_ID || "node-1";
  if (!shouldThisNodePost(nodeId, hash)) {
    console.log(`SwarmMesh: another node will post this.`);
    rememberHash(hash);
    return;
  }

  // --- Backoff ---
  if (!swarmBackoff(hash)) {
    console.log(`Swarm backoff: throttling broadcast (hash=${hash})`);
    rememberHash(hash);
    return;
  }

  rememberHash(hash);

  // --- Anti-detection random skip ---
  if (shouldSkipPost()) {
    console.log("AntiDetection: random skip triggered.");
    return;
  }

  // --- Anti-detection pause ---
  await antiDetectionPause();

  // --- Persona layer ---
  const personaMessage = applyPersona("default", message);

  // --- DePIN routing ---
  const routedPlatforms = preferredPlatformsFor(personaMessage, platforms);

  console.log(`Broadcasting… (EVENT_ID: ${EVENT_ID})`);
  console.log(`Message: ${personaMessage}`);
  console.log(`Platforms: ${routedPlatforms.join(", ")}`);

  // --- Platform formatting + throttling ---
  for (const platform of routedPlatforms) {
    const formatted = formatForPlatform(platform, { summary: personaMessage }, 0);
    const throttle = throttlePlatform(platform);

    await new Promise(r => setTimeout(r, throttle * 500));

    if (platform === "slack") await slack(formatted);
    if (platform === "discord") await discord(formatted);
    if (platform === "telegram") await telegram(formatted);
    if (platform === "bluesky") await bluesky(formatted);
    if (platform === "mastodon") await mastodon(formatted);
    if (platform === "nostr") await nostr(formatted, EVENT_ID);
  }

  console.log("Broadcast complete.");
}
