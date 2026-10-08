export function attachProvenance(
  graph,
  nodeId,
  source
) {

  const sourceNode = {
    id: source.id,
    type: "source",
    properties: source
  };

  const exists =
    graph.nodes.some(
      n => n.id === source.id
    );

  if (!exists) {
    graph.nodes.push(sourceNode);
  }

  graph.edges.push({
    from: nodeId,
    to: source.id,
    relation: "derived_from",
    weight: 1
  });

  return graph;
}
