export function shortestPath(
  graph,
  startId,
  endId
) {

  const queue = [[startId]];
  const visited = new Set([startId]);

  while (queue.length) {

    const path = queue.shift();
    const node = path[path.length - 1];

    if (node === endId) {
      return path;
    }

    const neighbors =
      graph.edges
        .filter(
          e => e.from === node
        )
        .map(e => e.to);

    for (const neighbor of neighbors) {

      if (visited.has(neighbor))
        continue;

      visited.add(neighbor);

      queue.push([
    
