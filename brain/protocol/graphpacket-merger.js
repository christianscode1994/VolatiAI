function uniqueById(items) {

  const map = new Map();

  for (const item of items) {
    map.set(item.id, item);
  }

  return [...map.values()];
}

export function mergePackets(
  ...packets
) {

  return {

    version: "1.0.0",

    packetId:
      crypto.randomUUID(),

    timestamp:
      Date.now(),

    metadata: {},

    nodes:
      uniqueById(
        packets.flatMap(
          p => p.nodes || []
        )
      ),

    edges:
      uniqueById(
        packets.flatMap(
          p => p.edges || []
        )
      ),

    claims:
      uniqueById(
        packets.flatMap(
          p => p.claims || []
        )
      ),

    evidence:
      uniqueById(
        packets.flatMap(
          p => p.evidence || []
        )
      ),

    provenance:
      packets.flatMap(
        p => p.provenance || []
      ),

    metrics: {},

    annotations: {}
  };
}
