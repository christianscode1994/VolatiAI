export function generateWorlds(
  graph,
  assumptions
) {
  return assumptions.map(a => ({
    assumption: a,
    world: structuredClone(graph)
  }));
}
