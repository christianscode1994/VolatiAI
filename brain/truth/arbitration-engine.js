export function arbitrate(graph) {

  const claims =
    graph.nodes.filter(
      n => n.type === "claim"
    );

  return claims.map(claim => {

    const support =
      graph.edges.filter(
        e =>
          e.to === claim.id &&
          e.relation === "supports"
      ).length;

    const disputes =
      graph.edges.filter(
        e =>
          e.to === claim.id &&
          e.relation === "contradicts"
      ).length;

    const confidence =
      support /
      Math.max(
        support + disputes,
        1
      );

    return {
      claim: claim.id,
      confidence
    };
  });
}
