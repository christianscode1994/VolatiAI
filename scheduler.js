// scheduler.js
import crypto from "crypto";
import {
  collectVolatility,
  collectSentiment,
  collectDevActivity,
  collectDepth,
  collectChainEvents
} from "./collectors/index.js";

import { processSignal } from "./signalEngine.js";

// --------------------------------------
//  SWARM SCHEDULER MEMORY
// --------------------------------------

const schedulerMemory = []; // last 200 scheduler hashes

function schedulerHash(taskName, payload) {
  return crypto
    .createHash("sha256")
    .update(taskName + JSON.stringify(payload))
    .digest("hex");
}

function rememberSchedulerHash(hash) {
  schedulerMemory.push(hash);
  if (schedulerMemory.length > 200) schedulerMemory.shift();
}

function hasSeenSchedulerHash(hash) {
  return schedulerMemory.includes(hash);
}

// --------------------------------------
//  SWARM COORDINATION FOR SCHEDULER
// --------------------------------------

function shouldRunTask(hash) {
  // Only run if hash ends with 0–3 (40% of nodes)
  return /[0-3]$/.test(hash);
}

// --------------------------------------
//  SWARM BACKOFF FOR TASK STORMS
// --------------------------------------

function schedulerBackoff(hash) {
  const num = parseInt(hash.slice(0, 8), 16);
  const normalized = num / 0xffffffff;
  const threshold = 0.50; // allow ~50% of tasks
  return normalized < threshold;
}

// --------------------------------------
//  TASK RUNNER WRAPPER (SWARM-AWARE)
// --------------------------------------

async function runTask(taskName, payload, fn) {
  const hash = schedulerHash(taskName, payload);

  // Memory dedupe
  if (hasSeenSchedulerHash(hash)) {
    console.log(`Scheduler memory: duplicate task skipped (${taskName})`);
    return;
  }

  // Coordination
  if (!shouldRunTask(hash)) {
    console.log(`Scheduler coordination: skipping task (${taskName})`);
    rememberSchedulerHash(hash);
    return;
  }

  // Backoff
  if (!schedulerBackoff(hash)) {
    console.log(`Scheduler backoff: throttling task (${taskName})`);
    rememberSchedulerHash(hash);
    return;
  }

  rememberSchedulerHash(hash);

  // Execute task
  await fn(payload);
}

// --------------------------------------
//  COLLECTOR TASKS
// --------------------------------------

async function runVolatilityTask({ asset, platforms }) {
  const sig = await collectVolatility(asset);
  if (sig) await processSignal(sig, platforms);
}

async function runSentimentTask({ keyword, platforms }) {
  const sig = await collectSentiment(keyword);
  if (sig) await processSignal(sig, platforms);
}

async function runDevActivityTask({ repo, platforms }) {
  const sig = await collectDevActivity(repo);
  if (sig) await processSignal(sig, platforms);
}

async function runDepthTask({ asset, platforms }) {
  const sig = await collectDepth(asset);
  if (sig) await processSignal(sig, platforms);
}

async function runChainTask({ address, platforms }) {
  const sig = await collectChainEvents(address);
  if (sig) await processSignal(sig, platforms);
}

// --------------------------------------
//  INTERVAL SCHEDULER
// --------------------------------------

export function startScheduler() {
  console.log("VolatiAI swarm scheduler started.");

  // Every 5 minutes — volatility
  setInterval(() => {
    runTask("volatility", { asset: "bitcoin", platforms: ["nostr", "mastodon"] }, runVolatilityTask);
  }, 5 * 60 * 1000);

  // Every 10 minutes — sentiment
  setInterval(() => {
    runTask("sentiment", { keyword: "solana", platforms: ["telegram", "discord"] }, runSentimentTask);
  }, 10 * 60 * 1000);

  // Every 15 minutes — dev activity
  setInterval(() => {
    runTask("devActivity", { repo: "solana-labs/solana", platforms: ["bluesky"] }, runDevActivityTask);
  }, 15 * 60 * 1000);

  // Every 20 minutes — depth
  setInterval(() => {
    runTask("depth", { asset: "eth", platforms: ["slack"] }, runDepthTask);
  }, 20 * 60 * 1000);

  // Every 30 minutes — chain events
  setInterval(() => {
    runTask("chain", { address: "0x123...", platforms: ["nostr"] }, runChainTask);
  }, 30 * 60 * 1000);
}
