export function sourceIndependence(
  graph,
  claimId
) {

  const sources =
    new Set();

  const edges =
    graph.edges.filter(
      edge =>
        edge.to === claimId &&
        edge.relation ===
          "supports"
    );

  for (
    const edge of edges
  ) {

    const source =
      graph.nodes.find(
        n =>
          n.id === edge.from
      );

    if (!source)
      continue;

    sources.add(
      source.properties
        ?.origin ||
      source.id
    );
  }

  return sources.size;
}
