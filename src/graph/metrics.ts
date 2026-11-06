import { SectorGraph } from "./model";

export function degreeCentrality(graph: SectorGraph): Record<string, number> {
  const scores: Record<string, number> = {};
  for (const node of graph.nodes) scores[node.id] = 0;
  for (const edge of graph.edges) {
    scores[edge.from] += edge.weight;
    scores[edge.to] += edge.weight;
  }
  return scores;
}
