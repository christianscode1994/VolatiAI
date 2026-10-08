export function addProvenance(
  graph,
  nodeId,
  source
) {
  const sourceNode = {
    id: `source:${source.id}`,
    type: "source",
    properties: source
  };

  graph.nodes.push(sourceNode);

  graph.edges.push({
    from: nodeId,
    to: sourceNode.id,
    relation: "derived_from",
    weight: 1
  });

  return graph;
}
