export function supportClaim(
  graph,
  evidenceId,
  claimId,
  weight = 1
) {

  graph.edges.push({
    from: evidenceId,
    to: claimId,
    relation: "supports",
    weight
  });

  return graph;
}
