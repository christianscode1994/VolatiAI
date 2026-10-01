// signalEngine.js
import crypto from "crypto";
import { broadcast } from "./broadcaster.js";

import {
  swarmConfig,
  scoringConfig,
  routingConfig
} from "./config.js";

import { applyPersona } from "./persona.js";
import { antiDetectionPause, shouldSkipPost } from "./antiDetection.js";
import { shouldPublishTopic } from "./topicEngine.js";
import { formatForPlatform } from "./contentFormatter.js";

// --------------------------------------
//  SWARM SIGNAL MEMORY (INPUT-SIDE)
// --------------------------------------

const signalMemory = [];

function signalHash(signal) {
  return crypto
    .createHash("sha256")
    .update(JSON.stringify(signal))
    .digest("hex");
}

function rememberSignal(hash) {
  signalMemory.push(hash);
  if (signalMemory.length > swarmConfig.memoryLimitSignal)
    signalMemory.shift();
}

function hasSeenSignal(hash) {
  return signalMemory.includes(hash);
}

// --------------------------------------
//  SWARM COORDINATION
// --------------------------------------

function shouldProcessSignal(hash) {
  const suffixes = swarmConfig.coordinationSuffixes;
  const lastChar = hash.slice(-1);
  return suffixes.includes(lastChar);
}

// --------------------------------------
//  SWARM BACKOFF
// --------------------------------------

function signalBackoff(hash) {
  const num = parseInt(hash.slice(0, 8), 16);
  const normalized = num / 0xffffffff;
  return normalized < swarmConfig.backoffSignal;
}

// --------------------------------------
//  ANOMALY DETECTION
// --------------------------------------

function isSignalAnomalous(signal) {
  const text = (signal.summary || "").toLowerCase();
  return scoringConfig.anomalyKeywords.some(k => text.includes(k));
}

// --------------------------------------
//  CHAIN WATCHER HOOK
// --------------------------------------

async function chainWatcher(signal) {
  if (!isSignalAnomalous(signal)) return;
  console.log(`Chain watcher triggered for signal: ${signal.summary}`);
}

// --------------------------------------
//  DePIN-AWARE ROUTING
// --------------------------------------

function platformsForSignal(signal, platforms) {
  const text = (signal.summary || "").toLowerCase();
  const depinKeywords = ["depin", "node", "relay", "infrastructure", "mesh"];

  if (!depinKeywords.some(k => text.includes(k))) return platforms;

  const priority = routingConfig.depinPriority;
  const rest = platforms.filter(p => !priority.includes(p));

  return [...priority.filter(p => platforms.includes(p)), ...rest];
}

// --------------------------------------
//  SIGNAL SCORING ENGINE
// --------------------------------------

function scoreSignal(signal) {
  let score = 0;

  const w = scoringConfig.weights;

  if (signal.volatility) score += w.volatility * signal.volatility;
  if (signal.sentiment) score += w.sentiment * Math.abs(signal.sentiment);
  if (signal.devActivity) score += w.devActivity * signal.devActivity;
  if (signal.depth) score += w.depth * signal.depth;

  if (isSignalAnomalous(signal)) score += w.anomaly_bonus;

  return score;
}

// --------------------------------------
//  MESSAGE RENDERER
// --------------------------------------

function renderSignalMessage(signal, score) {
  return `VolatiAI Signal
Severity: ${score}
Summary: ${signal.summary}
Data: ${JSON.stringify(signal.data || {}, null, 2)}`;
}

// --------------------------------------
//  MAIN SIGNAL PROCESSOR
// --------------------------------------

export async function processSignal(signal, platforms) {
  const hash = signalHash(signal);

  // --- Memory dedupe ---
  if (hasSeenSignal(hash)) {
    console.log(`Swarm memory: duplicate, skipping (${hash})`);
    return;
  }

  // --- Coordination ---
  if (!shouldProcessSignal(hash)) {
    console.log(`Swarm coordination: skipping (${hash})`);
    rememberSignal(hash);
    return;
  }

  // --- Backoff ---
  if (!signalBackoff(hash)) {
    console.log(`Swarm backoff: throttling (${hash})`);
    rememberSignal(hash);
    return;
  }

  rememberSignal(hash);

  // --- Topic filtering ---
  if (!shouldPublishTopic(signal)) {
    console.log(`TopicEngine: signal not strong enough, skipping.`);
    return;
  }

  // --- Anomaly detection ---
  if (isSignalAnomalous(signal)) {
    console.log("Swarm anomaly detected.");
    await chainWatcher(signal);
  }

  // --- Scoring ---
  const score = scoreSignal(signal);
  if (score < scoringConfig.minimumScore) {
    console.log(`Score too low (${score}), skipping.`);
    return;
  }

  // --- Anti-detection random skip ---
  if (shouldSkipPost()) {
    console.log("AntiDetection: random skip triggered.");
    return;
  }

  // --- Anti-detection pause ---
  await antiDetectionPause();

  // --- Render base message ---
  const baseMessage = renderSignalMessage(signal, score);

  // --- Persona layer ---
  const personaMessage = applyPersona("default", baseMessage);

  // --- Format per platform ---
  const routedPlatforms = platformsForSignal(signal, platforms);
  const formattedMessages = routedPlatforms.map(p => ({
    platform: p,
    content: formatForPlatform(p, signal, score)
  }));

  // --- Broadcast ---
  for (const msg of formattedMessages) {
    await broadcast(msg.content, [msg.platform]);
  }
}
