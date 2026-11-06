export function contradict(
  graph,
  claimA,
  claimB
) {
  graph.edges.push({
    from: claimA,
    to: claimB,
    relation: "contradicts",
    weight: 1
  });

  return graph;
}
