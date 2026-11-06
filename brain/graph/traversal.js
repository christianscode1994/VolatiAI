export function neighbors(graph, nodeId) {
  return graph.edges.filter(
    edge =>
      edge.from === nodeId ||
      edge.to === nodeId
  );
}

export function incoming(graph, nodeId) {
  return graph.edges.filter(
    edge => edge.to === nodeId
  );
}

export function outgoing(graph, nodeId) {
  return graph.edges.filter(
    edge => edge.from === nodeId
  );
}

export function degree(graph, nodeId) {
  return neighbors(graph, nodeId).length;
}
