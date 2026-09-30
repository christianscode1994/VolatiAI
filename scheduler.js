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
import {
  swarmConfig,
  collectorConfig
} from "./config.js";

// --------------------------------------
//  SWARM SCHEDULER MEMORY
// --------------------------------------

const schedulerMemory = [];

function schedulerHash(taskName, payload) {
  return crypto
    .createHash("sha256")
    .update(taskName + JSON.stringify(payload))
    .digest("hex");
}

function rememberSchedulerHash(hash) {
  schedulerMemory.push(hash);
  if (schedulerMemory.length > swarmConfig.memoryLimitSignal) schedulerMemory.shift();
}

function hasSeenSchedulerHash(hash) {
  return schedulerMemory.includes(hash);
}

// --------------------------------------
//  SWARM COORDINATION
// --------------------------------------

function shouldRunTask(hash) {
  const suffixes = swarmConfig.coordinationSuffixes;
  const lastChar = hash.slice(-1);
  return suffixes.includes(lastChar);
}

// --------------------------------------
//  SWARM BACKOFF
// --------------------------------------

function schedulerBackoff(hash) {
  const num = parseInt(hash.slice(0, 8), 16);
  const normalized = num / 0xffffffff;
  return normalized < swarmConfig.backoffScheduler;
}

// --------------------------------------
//  SWARM-AWARE TASK RUNNER
// --------------------------------------

async function runTask(taskName, payload, fn) {
  const hash = schedulerHash(taskName, payload);

  if (hasSeenSchedulerHash(hash)) {
    console.log(`Scheduler memory: duplicate task skipped (${taskName})`);
    return;
  }

  if (!shouldRunTask(hash)) {
    console.log(`Scheduler coordination: skipping task (${taskName})`);
    rememberSchedulerHash(hash);
    return;
  }

  if (!schedulerBackoff(hash)) {
    console.log(`Scheduler backoff: throttling task (${taskName})`);
    rememberSchedulerHash(hash);
    return;
  }

  rememberSchedulerHash(hash);

  await fn(payload);
}

// --------------------------------------
//  COLLECTOR TASK WRAPPERS
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
//  DYNAMIC SCHEDULER
// --------------------------------------

export function startScheduler() {
  console.log("VolatiAI dynamic swarm scheduler started.");

  // VOLATILITY
  if (collectorConfig.volatility.enabled) {
    const interval = collectorConfig.volatility.interval_minutes * 60 * 1000;
    const platforms = collectorConfig.volatility.platforms;

    collectorConfig.volatility.assets.forEach(asset => {
      setInterval(() => {
        runTask(
          `volatility:${asset}`,
          { asset, platforms },
          runVolatilityTask
        );
      }, interval);
    });
  }

  // SENTIMENT
  if (collectorConfig.sentiment.enabled) {
    const interval = collectorConfig.sentiment.interval_minutes * 60 * 1000;
    const platforms = collectorConfig.sentiment.platforms;

    collectorConfig.sentiment.keywords.forEach(keyword => {
      setInterval(() => {
        runTask(
          `sentiment:${keyword}`,
          { keyword, platforms },
          runSentimentTask
        );
      }, interval);
    });
  }

  // DEV ACTIVITY
  if (collectorConfig.dev_activity.enabled) {
    const interval = collectorConfig.dev_activity.interval_minutes * 60 * 1000;
    const platforms = collectorConfig.dev_activity.platforms;

    collectorConfig.dev_activity.repos.forEach(repo => {
      setInterval(() => {
        runTask(
          `dev:${repo}`,
          { repo, platforms },
          runDevActivityTask
        );
      }, interval);
    });
  }

  // DEPTH
  if (collectorConfig.depth.enabled) {
    const interval = collectorConfig.depth.interval_minutes * 60 * 1000;
    const platforms = collectorConfig.depth.platforms;

    collectorConfig.depth.assets.forEach(asset => {
      setInterval(() => {
        runTask(
          `depth:${asset}`,
          { asset, platforms },
          runDepthTask
        );
      }, interval);
    });
  }

  // CHAIN EVENTS
  if (collectorConfig.chain.enabled) {
    const interval = collectorConfig.chain.interval_minutes * 60 * 1000;
    const platforms = collectorConfig.chain.platforms;

    collectorConfig.chain.addresses.forEach(address => {
      setInterval(() => {
        runTask(
          `chain:${address}`,
          { address, platforms },
          runChainTask
        );
      }, interval);
    });
  }
}
