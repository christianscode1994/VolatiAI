export function updateEdgeWeights(graph) {
  if (!graph?.edges) return graph;

  graph.edges = graph.edges.map(edge => {
    const evidence = edge.evidenceScore || 0;
    const reputation = edge.reputationScore || 0;
    const contradiction = edge.contradictionScore || 0;

    let weight =
      (edge.weight || 0.5) +
      evidence * 0.2 +
      reputation * 0.3 -
      contradiction * 0.4;

    weight = Math.max(0, Math.min(1, weight));

    return {
      ...edge,
      weight,
      updatedAt: Date.now()
    };
  });

  return graph;
}
