// workers/sector-slow/src/chain.js
//
// Chain linking for correlation snapshots. Turns a sequence of individually
// signed snapshots into a tamper-evident chain.
//
// Each snapshot contains prev_hash: the SHA-256 of the previous snapshot's
// FULL canonicalized payload (including its signature). This means:
//   - Deleting a snapshot breaks the chain at the following link
//   - Modifying any field in a past snapshot breaks every subsequent link
//   - Reordering snapshots breaks the chain
//
// Not yet wired into index.js. Wiring is Nov 8+, when 3+ cron-written
// snapshots exist to form the first real chain. Until then, snapshots
// have prev_hash: null (genesis).

import { canonicalize } from "./signing.js";

// Compute SHA-256 of a UTF-8 string, return lowercase hex
async function sha256Hex(str) {
  const data = new TextEncoder().encode(str);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash))
    .map(b => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Compute the prev_hash for a new snapshot given the previous one.
 *
 * previousSnapshot must be the full signed object (with signature and
 * pubkey_id). The hash covers the canonicalized form of that object,
 * so any change to any field — including the signature itself —
 * changes the hash.
 *
 * Returns null for genesis snapshot (previousSnapshot is null/undefined).
 */
export async function computeChainLink(previousSnapshot) {
  if (!previousSnapshot) return null;
  const canonical = canonicalize(previousSnapshot);
  const hex = await sha256Hex(canonical);
  return "sha256:" + hex;
}

/**
 * Verify a chain of signed snapshots.
 *
 * Input: array of snapshot objects in chronological order, each with:
 *   - prev_hash    (or null for the first)
 *   - signature
 *   - signed_at
 *   - any other fields
 *
 * Checks:
 *   - First snapshot has prev_hash: null (or matches expected genesis)
 *   - Each subsequent snapshot's prev_hash matches SHA-256 of previous
 *
 * Returns:
 *   { valid: true, length: N }
 *   { valid: false, broken_at: i, reason: "..." }
 */
export async function verifyChain(snapshots) {
  if (!Array.isArray(snapshots) || snapshots.length === 0) {
    return { valid: false, reason: "empty_chain" };
  }

  // First snapshot must be genesis
  if (snapshots[0].prev_hash !== null) {
    return {
      valid: false,
      broken_at: 0,
      reason: "first_snapshot_has_prev_hash",
    };
  }

  for (let i = 1; i < snapshots.length; i++) {
    const expected = await computeChainLink(snapshots[i - 1]);
    if (snapshots[i].prev_hash !== expected) {
      return {
        valid: false,
        broken_at: i,
        reason: "prev_hash_mismatch",
        expected,
        actual: snapshots[i].prev_hash,
      };
    }
  }

  return { valid: true, length: snapshots.length };
}

/**
 * Verify a chain where the first snapshot is not necessarily genesis.
 *
 * This is useful when verifying an incremental append: the caller knows
 * the hash of the last verified snapshot, and wants to verify that all
 * snapshots after it chain correctly and that the first new snapshot
 * links to the known anchor.
 *
 * anchor_hash: the expected prev_hash of snapshots[0] (e.g., "sha256:abc...")
 */
export async function verifyChainFromAnchor(snapshots, anchorHash) {
  if (!Array.isArray(snapshots) || snapshots.length === 0) {
    return { valid: false, reason: "empty_chain" };
  }

  if (snapshots[0].prev_hash !== anchorHash) {
    return {
      valid: false,
      broken_at: 0,
      reason: "anchor_mismatch",
      expected: anchorHash,
      actual: snapshots[0].prev_hash,
    };
  }

  for (let i = 1; i < snapshots.length; i++) {
    const expected = await computeChainLink(snapshots[i - 1]);
    if (snapshots[i].prev_hash !== expected) {
      return {
        valid: false,
        broken_at: i,
        reason: "prev_hash_mismatch",
        expected,
        actual: snapshots[i].prev_hash,
      };
    }
  }

  return { valid: true, length: snapshots.length };
}
