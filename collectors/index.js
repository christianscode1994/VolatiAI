// collectors/index.js
// Unified collector registry with pluginLoader integration

import { registerCollector } from "../pluginLoader.js";
import { collectorConfig } from "../config.js";

// Import actual collector implementations
import { collectVolatility } from "./volatility.js";
import { collectSentiment } from "./sentiment.js";
import { collectDevActivity } from "./devActivity.js";
import { collectDepth } from "./depth.js";
import { collectChainEvents } from "./chain.js";

// --------------------------------------
//  REGISTER COLLECTORS (PLUGIN SYSTEM)
// --------------------------------------

registerCollector("volatility", collectVolatility);
registerCollector("sentiment", collectSentiment);
registerCollector("dev_activity", collectDevActivity);
registerCollector("depth", collectDepth);
registerCollector("chain", collectChainEvents);

// --------------------------------------
//  EXPORT ACTIVE COLLECTORS BASED ON CONFIG
// --------------------------------------

export function getActiveCollectors() {
  const active = [];

  if (collectorConfig.volatility?.enabled) {
    active.push({
      name: "volatility",
      fn: collectVolatility,
      interval: collectorConfig.volatility.interval_minutes,
      assets: collectorConfig.volatility.assets,
      platforms: collectorConfig.volatility.platforms
    });
  }

  if (collectorConfig.sentiment?.enabled) {
    active.push({
      name: "sentiment",
      fn: collectSentiment,
      interval: collectorConfig.sentiment.interval_minutes,
      keywords: collectorConfig.sentiment.keywords,
      platforms: collectorConfig.sentiment.platforms
    });
  }

  if (collectorConfig.dev_activity?.enabled) {
    active.push({
      name: "dev_activity",
      fn: collectDevActivity,
      interval: collectorConfig.dev_activity.interval_minutes,
      repos: collectorConfig.dev_activity.repos,
      platforms: collectorConfig.dev_activity.platforms
    });
  }

  if (collectorConfig.depth?.enabled) {
    active.push({
      name: "depth",
      fn: collectDepth,
      interval: collectorConfig.depth.interval_minutes,
      assets: collectorConfig.depth.assets,
      platforms: collectorConfig.depth.platforms
    });
  }

  if (collectorConfig.chain?.enabled) {
    active.push({
      name: "chain",
      fn: collectChainEvents,
      interval: collectorConfig.chain.interval_minutes,
      addresses: collectorConfig.chain.addresses,
      platforms: collectorConfig.chain.platforms
    });
  }

  return active;
}

// --------------------------------------
//  DEFAULT EXPORT (for scheduler)
// --------------------------------------

export {
  collectVolatility,
  collectSentiment,
  collectDevActivity,
  collectDepth,
  collectChainEvents
};
