export function addEvidence(
  graph,
  claimId,
  evidenceId
) {
  graph.edges.push({
    from: evidenceId,
    to: claimId,
    relation: "supports",
    weight: 1
  });

  return graph;
}
