export function propagateTrust(graph) {

  const trust = {};

  for (const node of graph.nodes || []) {
    trust[node.id] = node.trust || 0.5;
  }

  for (const edge of graph.edges || []) {

    const sourceTrust =
      trust[edge.source] || 0.5;

    const existing =
      trust[edge.target] || 0.5;

    trust[edge.target] =
      (existing + sourceTrust) / 2;
  }

  return trust;
}
