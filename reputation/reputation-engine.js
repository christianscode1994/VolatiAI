export function reputation(
  graph,
  actorId
) {

  const validated =
    graph.edges
      .filter(
        e =>
          e.from === actorId &&
          e.relation ===
            "validated"
      )
      .length;

  const rejected =
    graph.edges
      .filter(
        e =>
          e.from === actorId &&
          e.relation ===
            "rejected"
      )
      .length;

  const score =
    validated - rejected;

  return {
    actor: actorId,
    score,
    confidence:
      validated /
      Math.max(
        validated + rejected,
        1
      )
  };
}
