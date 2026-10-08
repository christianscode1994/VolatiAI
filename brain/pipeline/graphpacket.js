/**
 * VolatiAI GraphPacket v1
 * Stateless transport object.
 */

export function createGraphPacket({
  source = null,
  metadata = {}
} = {}) {

  return {

    version: "1.0",

    packetId:
      crypto.randomUUID(),

    timestamp:
      Date.now(),

    source,

    metadata,

    nodes: [],

    edges: [],

    claims: [],

    evidence: [],

    provenance: [],

    missions: [],

    annotations: {},

    metrics: {}
  };
}

export function clonePacket(packet) {
  return structuredClone(packet);
}

export function freezePacket(packet) {
  return Object.freeze(packet);
}
