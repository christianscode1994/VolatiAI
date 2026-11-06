export function detectCommunities(
  graph
) {

  const visited = new Set();
  const communities = [];

  function dfs(id, community) {

    visited.add(id);

    community.push(id);

    const neighbors =
      graph.edges.flatMap(edge => {

        if (edge.from === id)
          return [edge.to];

        if (edge.to === id)
          return [edge.from];

        return [];
      });

    for (const neighbor of neighbors) {

      if (visited.has(neighbor))
        continue;

      dfs(
        neighbor,
        community
      );
    }
  }

  for (const node of graph.nodes) {

    if (visited.has(node.id))
      continue;

    const community = [];

    dfs(
      node.id,
      community
    );

    communities.push(
      community
    );
  }

  return communities;
}
