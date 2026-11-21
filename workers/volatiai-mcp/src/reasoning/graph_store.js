import graph from "../evidence_graph.json" with { type: "json" };

export function loadGraph() { return graph; }

export function neighbors(node) {
  return graph.edges.filter(e => e.source === node || e.target === node);
}
