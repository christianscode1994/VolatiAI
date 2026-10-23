// swarmMesh.js

const peers = new Set();

export function registerPeer(id) {
  peers.add(id);
}

export function unregisterPeer(id) {
  peers.delete(id);
}

export function listPeers() {
  return Array.from(peers);
}

export function shouldThisNodePost(nodeId, hash) {
  if (peers.size === 0) return true;
  const sorted = listPeers().sort();
  const index = sorted.indexOf(nodeId);
  if (index === -1) return true;

  const num = parseInt(hash.slice(0, 8), 16);
  const bucket = num % sorted.length;
  return bucket === index;
}
