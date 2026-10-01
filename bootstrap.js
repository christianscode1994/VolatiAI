// bootstrap.js
import { startScheduler } from "./scheduler.js";
import {
  swarmConfig,
  routingConfig,
  collectorConfig,
  scoringConfig,
  nostrConfig,
  personaConfig,
  antiDetectionConfig,
  topicEngineConfig
} from "./config.js";

function printBanner() {
  console.log(`
██╗   ██╗ ██████╗ ██╗      █████╗ ████████╗██╗██╗
██║   ██║██╔═══██╗██║     ██╔══██╗╚══██╔══╝██║██║
██║   ██║██║   ██║██║     ███████║   ██║   ██║██║
╚██╗ ██╔╝██║   ██║██║     ██╔══██║   ██║   ██║██║
 ╚████╔╝ ╚██████╔╝███████╗██║  ██║   ██║   ██║███████╗
  ╚═══╝   ╚═════╝ ╚══════╝╚═╝  ╚═╝   ╚═╝   ╚═╝╚══════╝

        VolatiAI — Serverless Swarm Intelligence Node
  `);
}

function printConfigSummary() {
  console.log("Swarm configuration loaded:");
  console.log("--------------------------------------");

  console.log("Swarm Coordination Suffixes:", swarmConfig.coordinationSuffixes);
  console.log("Signal Backoff Threshold:", swarmConfig.backoffSignal);
  console.log("Scheduler Backoff Threshold:", swarmConfig.backoffScheduler);
  console.log("Signal Memory Limit:", swarmConfig.memoryLimitSignal);
  console.log("Broadcast Memory Limit:", swarmConfig.memoryLimitBroadcast);

  console.log("\nRouting Priority (DePIN):", routingConfig.depinPriority);
  console.log("Default Platforms:", routingConfig.defaultPlatforms);

  console.log("\nCollectors Enabled:");
  Object.entries(collectorConfig).forEach(([name, cfg]) => {
    console.log(`- ${name}: ${cfg.enabled ? "enabled" : "disabled"}`);
  });

  console.log("\nScoring:");
  console.log("Minimum Score:", scoringConfig.minimumScore);
  console.log("Weights:", scoringConfig.weights);
  console.log("Anomaly Keywords:", scoringConfig.anomalyKeywords);

  console.log("\nPersona:");
  console.log("Default Persona:", personaConfig.default);

  console.log("\nAnti-Detection:");
  console.log("Jitter Min (ms):", antiDetectionConfig.jitterMinMs);
  console.log("Jitter Max (ms):", antiDetectionConfig.jitterMaxMs);
  console.log("Skip Probability:", antiDetectionConfig.skipProbability);

  console.log("\nTopic Engine:");
  console.log("Minimum Topic Score:", topicEngineConfig.minimumTopicScore);

  console.log("\nNostr Relays:", nostrConfig.relays);
  console.log("--------------------------------------\n");
}

function setupGracefulShutdown() {
  process.on("SIGINT", () => {
    console.log("\nVolatiAI swarm node shutting down gracefully...");
    process.exit(0);
  });

  process.on("SIGTERM", () => {
    console.log("\nVolatiAI swarm node terminated.");
    process.exit(0);
  });
}

export function bootstrap() {
  printBanner();
  printConfigSummary();
  setupGracefulShutdown();

  console.log("Starting scheduler...");
  startScheduler();

  console.log("VolatiAI swarm node is now running.");
}

// Auto-start if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  bootstrap();
}
