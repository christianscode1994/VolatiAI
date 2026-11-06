import { extractEntities } from "./entity-engine.js";
import { buildGraph } from "../graph/graph-builder.js";
import { detectConvergences } from "./convergence-engine.js";
import { reason } from "./reasoning-engine.js";

export async function generateIntelligence(data) {

  const entities =
    extractEntities(data);

  const graph =
    buildGraph(entities);

  const convergences =
    detectConvergences(graph);

  const insights =
    reason(convergences);

  return insights;

}
