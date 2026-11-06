// collectors/index.js

import { registerCollector } from "../pluginLoader.js";
import { collectorConfig } from "../config.js";

import { collectVolatility } from "./volatility.js";
import { collectSentiment } from "./sentiment.js";
import { collectDevActivity } from "./devActivity.js";
import { collectDepth } from "./depth.js";
import { collectChainEvents } from "./chain.js";


// --------------------------------------
// Register Collectors
// --------------------------------------

registerCollector(
  "volatility",
  collectVolatility
);

registerCollector(
  "sentiment",
  collectSentiment
);

registerCollector(
  "dev_activity",
  collectDevActivity
);

registerCollector(
  "depth",
  collectDepth
);

registerCollector(
  "chain",
  collectChainEvents
);


// --------------------------------------
// Active Collectors
// --------------------------------------

export function getActiveCollectors() {

  const active = [];

  if (
    collectorConfig.volatility?.enabled
  ) {
    active.push({
      name: "volatility",
      metric: "volatility",
      fn: collectVolatility,
      interval:
        collectorConfig.volatility
          ?.interval_minutes ?? 60,
      assets:
        collectorConfig.volatility
          ?.assets ?? [],
      platforms:
        collectorConfig.volatility
          ?.platforms ?? [],
    });
  }

  if (
    collectorConfig.sentiment?.enabled
  ) {
    active.push({
      name: "sentiment",
      metric: "sentiment",
      fn: collectSentiment,
      interval:
        collectorConfig.sentiment
          ?.interval_minutes ?? 60,
      keywords:
        collectorConfig.sentiment
          ?.keywords ?? [],
      platforms:
        collectorConfig.sentiment
          ?.platforms ?? [],
    });
  }

  if (
    collectorConfig.dev_activity?.enabled
  ) {
    active.push({
      name: "dev_activity",
      metric: "developer",
      fn: collectDevActivity,
      interval:
        collectorConfig.dev_activity
          ?.interval_minutes ?? 120,
      repos:
        collectorConfig.dev_activity
          ?.repos ?? [],
      platforms:
        collectorConfig.dev_activity
          ?.platforms ?? [],
    });
  }

  if (
    collectorConfig.depth?.enabled
  ) {
    active.push({
      name: "depth",
      metric: "liquidity",
      fn: collectDepth,
      interval:
        collectorConfig.depth
          ?.interval_minutes ?? 30,
      assets:
        collectorConfig.depth
          ?.assets ?? [],
      platforms:
        collectorConfig.depth
          ?.platforms ?? [],
    });
  }

  if (
    collectorConfig.chain?.enabled
  ) {
    active.push({
      name: "chain",
      metric: "onchain",
      fn: collectChainEvents,
      interval:
        collectorConfig.chain
          ?.interval_minutes ?? 60,
      addresses:
        collectorConfig.chain
          ?.addresses ?? [],
      platforms:
        collectorConfig.chain
          ?.platforms ?? [],
    });
  }

  return active.filter(
    collector =>
      typeof collector.fn ===
      "function"
  );
}


// --------------------------------------
// Exports
// --------------------------------------

export {
  collectVolatility,
  collectSentiment,
  collectDevActivity,
  collectDepth,
  collectChainEvents,
};
