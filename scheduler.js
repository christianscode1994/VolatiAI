// scheduler.js
import crypto from "crypto";
import { getActiveCollectors } from "./collectors/index.js";
import { processSignal } from "./signalEngine.js";
import { swarmConfig } from "./config.js";
import { shouldThisNodePost } from "./swarmMesh.js";

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
  if (schedulerMemory.length > swarmConfig.memoryLimitSignal)
    schedulerMemory.shift();
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

  // SwarmMesh multi-node coordination
  const nodeId = process.env.NODE_ID || "node-1";
  if (!shouldThisNodePost(nodeId, hash)) {
    console.log(`SwarmMesh: another node will run ${taskName}`);
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

  // Execute collector
  await fn(payload);
}

// --------------------------------------
//  DYNAMIC COLLECTOR TASK WRAPPER
// --------------------------------------

async function runCollectorTask(collector, payload) {
  const sig = await collector.fn(payload.item);
  if (sig) await processSignal(sig, payload.platforms);
}

// --------------------------------------
//  DYNAMIC SCHEDULER
// --------------------------------------

export function startScheduler() {
  console.log("VolatiAI dynamic swarm scheduler started.");

  const collectors = getActiveCollectors();

  collectors.forEach(collector => {
    const interval = collector.interval * 60 * 1000;

    // Each collector may have multiple items (assets, repos, keywords, addresses)
    const items =
      collector.assets ||
      collector.repos ||
      collector.keywords ||
      collector.addresses ||
      [];

    items.forEach(item => {
      setInterval(() => {
        runTask(
          `${collector.name}:${item}`,
          { item, platforms: collector.platforms },
          payload => runCollectorTask(collector, payload)
        );
      }, interval);
    });
  });
}
