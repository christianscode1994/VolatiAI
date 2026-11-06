// scripts/run-agent-local.ts
import { loadStateLocal } from "../src/io/loadState.local";
import { saveOutputsLocal } from "../src/io/saveOutputs.local";
import { runAgentCore } from "../src/agent/engine";

async function main() {
  const state = await loadStateLocal();
  const result = runAgentCore(state);
  await saveOutputsLocal({
    risk: result.risk,
    opportunities: result.opportunities,
    actions: [], // you can add action logic later
    anomalies: result.anomalies,
  });
  console.log("Agent run complete. Check ./data/outputs/");
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
