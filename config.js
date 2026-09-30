// config.js
import fs from "fs";
import path from "path";
import yaml from "js-yaml";

// --------------------------------------
//  LOAD CONFIG.YAML
// --------------------------------------

const CONFIG_PATH = path.resolve("config.yaml");

let config = {};

try {
  const file = fs.readFileSync(CONFIG_PATH, "utf8");
  config = yaml.load(file);
  console.log("VolatiAI config loaded.");
} catch (err) {
  console.error("Failed to load config.yaml:", err.message);
  process.exit(1);
}

// --------------------------------------
//  VALIDATION HELPERS
// --------------------------------------

function ensure(path, value) {
  if (value === undefined || value === null) {
    throw new Error(`Missing required config value: ${path}`);
  }
}

function validateConfig(cfg) {
  ensure("swarm", cfg.swarm);
  ensure("routing", cfg.routing);
  ensure("platforms", cfg.platforms);
  ensure("collectors", cfg.collectors);
  ensure("scoring", cfg.scoring);
  ensure("nostr", cfg.nostr);
}

try {
  validateConfig(config);
} catch (err) {
  console.error("Invalid config.yaml:", err.message);
  process.exit(1);
}

// --------------------------------------
//  EXPORT CONFIG
// --------------------------------------

export const swarmConfig = {
  coordinationSuffixes: config.swarm.coordination_suffixes,
  backoffSignal: config.swarm.backoff_threshold_signal,
  backoffScheduler: config.swarm.backoff_threshold_scheduler,
  memoryLimitSignal: config.swarm.memory_limit_signal,
  memoryLimitBroadcast: config.swarm.memory_limit_broadcast
};

export const routingConfig = {
  depinPriority: config.routing.depin_priority,
  defaultPlatforms: config.platforms.default
};

export const collectorConfig = config.collectors;

export const scoringConfig = {
  minimumScore: config.scoring.thresholds.minimum_score,
  weights: config.scoring.weights,
  anomalyKeywords: config.anomaly_detection.keywords
};

export const chainWatcherConfig = {
  enabled: config.chain_watcher.enabled,
  logOnly: config.chain_watcher.log_only
};

export const nostrConfig = {
  relays: config.nostr.relays,
  minGoodRelays: config.nostr.min_good_relays,
  maxTotalRelays: config.nostr.max_total_relays
};

export default {
  swarmConfig,
  routingConfig,
  collectorConfig,
  scoringConfig,
  chainWatcherConfig,
  nostrConfig
};
