// signalEngine.js
import crypto from "crypto";
import { broadcast } from "./broadcaster.js";

// --------------------------------------
//  SWARM SIGNAL MEMORY (INPUT-SIDE)
// --------------------------------------

const signalMemory = []; // last 200 signal hashes

function signalHash(signal) {
  return crypto
    .createHash("sha256")
    .update(JSON.stringify(signal))
    .digest("hex");
}

function rememberSignal(hash) {
  signalMemory.push(hash);
  if (signalMemory.length > 200) signalMemory.shift();
}

function hasSeenSignal(hash) {
  return signalMemory.includes(hash);
}

// --------------------------------------
//  SWARM COORDINATION FOR SIGNAL PROCESSING
// --------------------------------------
//
// Only some nodes process a given signal.
// Same idea as broadcaster, but input-side.
//

function shouldProcessSignal(hash) {
  // Example rule: only process if hash ends with "a" or "b"
  return /[ab]$/.test(hash);
}

// --------------------------------------
//  SWARM-WIDE BACKOFF FOR SIGNAL STORMS
// --------------------------------------

function signalBackoff(hash) {
  const num = parseInt(hash.slice(0, 8), 16);
  const normalized = num / 0xffffffff;
  const threshold = 0.40; // allow ~40% of signals
  return normalized < threshold;
}

// --------------------------------------
//  ANOMALY DETECTION (INPUT-SIDE)
// --------------------------------------

function isSignalAnomalous(signal) {
  const text = (signal.summary || "").toLowerCase();
  const keywords = ["spike", "crash", "exploit", "halt", "liquidation", "rug", "attack"];
  return keywords.some(k => text.includes(k));
}

// --------------------------------------
//  CHAIN WATCHER HOOK
// --------------------------------------

async function chainWatcher(signal) {
  if (!isSignalAnomalous(signal)) return;
  console.log(`Chain watcher triggered for signal: ${signal.summary}`);
  // Later: integrate on-chain APIs/indexers
}

// --------------------------------------
//  DePIN-AWARE ROUTING (INPUT-SIDE)
// --------------------------------------

function platformsForSignal(signal, platforms) {
  const text = (signal.summary || "").toLowerCase();
  const depinKeywords = ["depin", "node", "relay", "infrastructure", "mesh"];

  if (!depinKeywords.some(k => text.includes(k))) return platforms;

  const priority = ["nostr", "mastodon", "bluesky"];
  const rest = platforms.filter(p => !priority.includes(p));
  return [...priority.filter(p => platforms.includes(p)), ...rest];
}

// --------------------------------------
//  SIGNAL SCORING ENGINE
// --------------------------------------

function scoreSignal(signal) {
  let score = 0;

  // Example scoring inputs (customize as needed)
  if (signal.volatility) score += signal.volatility;
  if (signal.sentiment) score += Math.abs(signal.sentiment);
  if (signal.devActivity) score += signal.devActivity;
  if (signal.depth) score += signal.depth;

  // Hard bump for anomalies
  if (isSignalAnomalous(signal)) score += 10;

  return score;
}

// --------------------------------------
//  SIGNAL → MESSAGE RENDERER
// --------------------------------------

function renderSignalMessage(signal, score) {
  return `⚡ VolatiAI Signal
Severity Score: ${score}
Summary: ${signal.summary}
Data: ${JSON.stringify(signal.data || {}, null, 2)}`;
}

// --------------------------------------
//  MAIN SIGNAL PROCESSOR
// --------------------------------------

export async function processSignal(signal, platforms) {
  const hash = signalHash(signal);

  // --- Swarm Memory ---
  if (hasSeenSignal(hash)) {
    console.log(`Swarm signal memory: duplicate, skipping (hash=${hash})`);
    return;
  }

  // --- Swarm Coordination ---
  if (!shouldProcessSignal(hash)) {
    console.log(`Swarm signal coordination: skipping (hash=${hash})`);
    rememberSignal(hash);
    return;
  }

  // --- Swarm Backoff ---
  if (!signalBackoff(hash)) {
    console.log(`Swarm signal backoff: throttling (hash=${hash})`);
    rememberSignal(hash);
    return;
  }

  rememberSignal(hash);

  // --- Anomaly Detection + Chain Watcher ---
  if (isSignalAnomalous(signal)) {
    console.log("Swarm anomaly detected.");
    await chainWatcher(signal);
  }

  // --- Scoring ---
  const score = scoreSignal(signal);

  if (score < 5) {
    console.log(`Swarm signal: score too low (${score}), skipping.`);
    return;
  }

  // --- Render Message ---
  const message = renderSignalMessage(signal, score);

  // --- DePIN Routing ---
  const routedPlatforms = platformsForSignal(signal, platforms);

  // --- Broadcast ---
  await broadcast(message, routedPlatforms);
}
