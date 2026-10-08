export function detectNarratives(
  graph
) {

  return graph.nodes
    .filter(
      node =>
        node.type ===
        "claim"
    )
    .map(claim => ({
      claim: claim.id,
      strength:
        graph.edges.filter(
          e =>
            e.to === claim.id
        ).length
    }));
}
