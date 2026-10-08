export function clusterNarratives(
  graph
) {

  const claims =
    graph.nodes.filter(
      n =>
        n.type === "claim"
    );

  return claims.map(claim => {

    const evidenceCount =
      graph.edges.filter(
        edge =>
          edge.to === claim.id &&
          edge.relation === "supports"
      ).length;

    return {
      narrative: claim.id,
      strength: evidenceCount
    };
  })
  .sort(
    (a, b) =>
      b.strength -
      a.strength
  );
}
