export function coherence(graph = {}) {
  const edges = graph.edges || [];

  const support = edges.filter(e => e.type === "supports").length;
  const contradiction = edges.filter(
    e => e.type === "contradicts"
  ).length;

  if (support + contradiction === 0) {
    return 0.5;
  }

  return support / (support + contradiction);
}
