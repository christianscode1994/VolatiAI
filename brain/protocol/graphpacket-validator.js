export function validatePacket(
  packet
) {

  const errors = [];

  if (!packet.version) {
    errors.push(
      "Missing version"
    );
  }

  if (
    !Array.isArray(
      packet.nodes
    )
  ) {

    errors.push(
      "nodes must be array"
    );
  }

  if (
    !Array.isArray(
      packet.edges
    )
  ) {

    errors.push(
      "edges must be array"
    );
  }

  for (
    const edge of packet.edges
  ) {

    if (!edge.from) {
      errors.push(
        "edge missing from"
      );
    }

    if (!edge.to) {
      errors.push(
        "edge missing to"
      );
    }

    if (!edge.relation) {
      errors.push(
        "edge missing relation"
      );
    }
  }

  return {

    valid:
      errors.length === 0,

    errors
  };
}
