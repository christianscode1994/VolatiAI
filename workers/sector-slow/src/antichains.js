/**
 * antichains.js — set-theoretic utilities for the sector DAG.
 *
 * Two sectors are comparable if one is an ancestor of the other in the
 * sector hierarchy. An antichain is a set where no two elements are
 * comparable.
 *
 * Why it matters for VolatiAI: when sampling sectors for correlation
 * analysis, a parent and its child share data. Picking a maximal
 * antichain ensures no selected sector depends on another, avoiding
 * spurious correlations from shared provenance.
 */

export function buildReachability(dag) {
  // dag: array of [parent, child] pairs.
  // Returns: Map<node, Set<descendants>> — transitive closure.
  const reach = new Map();
  for (const [from, to] of dag) {
    if (!reach.has(from)) reach.set(from, new Set());
    if (!reach.has(to)) reach.set(to, new Set());
    reach.get(from).add(to);
  }
  // Floyd-Warshall for transitive closure. N < 1000 in practice.
  const nodes = Array.from(reach.keys());
  for (const k of nodes) {
    for (const i of nodes) {
      if (reach.get(i).has(k)) {
        for (const j of reach.get(k)) {
          reach.get(i).add(j);
        }
      }
    }
  }
  return reach;
}

export function isAncestor(reach, a, b) {
  if (a === b) return false;
  return reach.get(a)?.has(b) ?? false;
}

export function isAntichain(reach, set) {
  const arr = Array.from(set);
  for (let i = 0; i < arr.length; i++) {
    for (let j = i + 1; j < arr.length; j++) {
      if (isAncestor(reach, arr[i], arr[j])) return false;
      if (isAncestor(reach, arr[j], arr[i])) return false;
    }
  }
  return true;
}

export function maximalAntichain(reach, set) {
  // Returns maximal elements only: those with no descendant inside the set.
  // Result is guaranteed to be an antichain because maximal elements in
  // a DAG are pairwise incomparable.
  const arr = Array.from(set);
  const result = new Set();
  for (const a of arr) {
    let dominated = false;
    for (const b of arr) {
      if (a !== b && isAncestor(reach, a, b)) {
        dominated = true;
        break;
      }
    }
    if (!dominated) result.add(a);
  }
  return result;
}
