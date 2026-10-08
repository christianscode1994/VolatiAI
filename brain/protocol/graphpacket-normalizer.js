export function normalize(packet) {

  return {

    version:
      packet.version || "1.0.0",

    packetId:
      packet.packetId ||
      crypto.randomUUID(),

    timestamp:
      packet.timestamp ||
      Date.now(),

    metadata:
      packet.metadata || {},

    nodes:
      packet.nodes || [],

    edges:
      packet.edges || [],

    claims:
      packet.claims || [],

    evidence:
      packet.evidence || [],

    provenance:
      packet.provenance || [],

    metrics:
      packet.metrics || {},

    annotations:
      packet.annotations || {}
  };
}
