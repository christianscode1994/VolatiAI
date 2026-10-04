import { buildGraphFromFlows } from "../graph/build";
import { detectAnomalies } from "./anomalies";
import { evaluateRisk } from "./risk";
import { findOpportunities } from "./opportunities";
import { summarizeNarrative } from "./narrative";

export function runAgentCore(state: any) {
  const graph = buildGraphFromFlows(state.flows);
  const anomalies = detectAnomalies(state);
  const risk = evaluateRisk(state, graph, anomalies);
  const opportunities = findOpportunities(state, { graph });
  const narrative = summarizeNarrative(state, risk, opportunities);

  return { graph, anomalies, risk, opportunities, narrative };
}
