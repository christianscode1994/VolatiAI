export function reputation(
  graph,
  actorId
) {

  const validated =
    graph.edges.filter(
      e =>
        e.from === actorId &&
        e.relation === "validated"
    ).length;

  const rejected =
    graph.edges.filter(
      e =>
        e.from === actorId &&
        e.relation === "rejected"
    ).length;

  return {
    actor: actorId,
    score:
      validated -
      rejected
  };
}
