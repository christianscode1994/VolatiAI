import fs from "fs/promises";

export async function saveOutputsLocal(outputs: any) {
  await fs.writeFile("./data/outputs/agent_risk.json", JSON.stringify(outputs.risk, null, 2));
  await fs.writeFile("./data/outputs/agent_opportunities.json", JSON.stringify(outputs.opportunities, null, 2));
  await fs.writeFile("./data/outputs/agent_actions.json", JSON.stringify(outputs.actions, null, 2));
  await fs.writeFile("./data/outputs/agent_anomalies.json", JSON.stringify(outputs.anomalies, null, 2));
}
