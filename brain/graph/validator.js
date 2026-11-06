export function validateGraph(
  packet
) {

  const errors = [];

  const nodeIds =
    new Set();

  for (
    const node of packet.nodes
  ) {

    if (!node.id) {

      errors.push(
        "node missing id"
      );

      continue;
    }

    if (
      nodeIds.has(node.id)
    ) {

      errors.push(
        `duplicate node ${node.id}`
      );
    }

    nodeIds.add(node.id);
  }

  for (
    const edge of packet.edges
  ) {

    if (
      !nodeIds.has(edge.from)
    ) {

      errors.push(
        `missing node ${edge.from}`
      );
    }

    if (
      !nodeIds.has(edge.to)
    ) {

      errors.push(
        `missing node ${edge.to}`
      );
    }
  }

  return {

    valid:
      errors.length === 0,

    errors
  };
}
``
