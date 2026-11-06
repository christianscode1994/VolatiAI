// tests/arbitration.mjs — tests for workers/sector-slow/src/arbitration.js
//
// Covers the two critical untested pure functions:
//   - detrendedResiduals: linear detrend used by every correlation
//   - arbitrate: graph-based confidence engine
//
// pearson and correlationPValue are covered elsewhere (correlation_pvalue.mjs
// and test_find_candidates.py). These two are not.

import {
  pearson,
  detrendedResiduals,
  arbitrate,
  buildClaimGraph,
} from '../workers/sector-slow/src/arbitration.js';

let passCount = 0;
let failCount = 0;
const failures = [];

function test(name, fn) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
    passCount++;
  } catch (e) {
    console.log(`  ✗ ${name} — ${e.message}`);
    failures.push({ name, message: e.message });
    failCount++;
  }
}

function assertAlmostEqual(actual, expected, tolerance = 1e-6) {
  if (Math.abs(actual - expected) > tolerance) {
    throw new Error(`expected ${expected}, got ${actual}`);
  }
}

function assertEqual(actual, expected) {
  if (actual !== expected) {
    throw new Error(`expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

const DAY_MS = 86400000;
const t0 = 1700000000000;

function makeClaim(sector) {
  return { id: `${sector}::current`, type: 'claim', sector, metric: 'test', value: 100, timestamp: t0 };
}

// ─────────────────────────────────────────────────────────────
// detrendedResiduals
// ─────────────────────────────────────────────────────────────
console.log("=== detrendedResiduals ===");

test("flat series → all residuals ~0", () => {
  const pts = [];
  for (let i = 0; i < 10; i++) pts.push({ t: t0 + i * DAY_MS, v: 5.0 });
  const r = detrendedResiduals(pts);
  if (!r || !Array.isArray(r.residuals)) throw new Error('unexpected shape');
  if (r.residuals.length !== 10) throw new Error(`expected 10 residuals, got ${r.residuals.length}`);
  for (const v of r.residuals) assertAlmostEqual(v, 0, 1e-9);
});

test("linear series → all residuals ~0", () => {
  const pts = [];
  for (let i = 0; i < 10; i++) pts.push({ t: t0 + i * DAY_MS, v: 2.0 + 3.0 * i });
  const r = detrendedResiduals(pts);
  for (const v of r.residuals) assertAlmostEqual(v, 0, 1e-9);
});

test("quadratic series → non-zero residuals", () => {
  const pts = [];
  for (let i = 0; i < 10; i++) pts.push({ t: t0 + i * DAY_MS, v: i * i });
  const r = detrendedResiduals(pts);
  const maxResid = Math.max(...r.residuals.map(v => Math.abs(v)));
  if (maxResid < 0.1) throw new Error(`expected curvature, got max residual ${maxResid}`);
});

test("returns null for < 3 points", () => {
  const r = detrendedResiduals([{ t: t0, v: 1 }, { t: t0 + DAY_MS, v: 2 }]);
  if (r !== null) throw new Error('expected null for short input');
});

test("returns null for empty array", () => {
  if (detrendedResiduals([]) !== null) throw new Error('expected null');
});

test("returns null for non-array", () => {
  if (detrendedResiduals(null) !== null) throw new Error('expected null');
});

// ─────────────────────────────────────────────────────────────
// arbitrate
// ─────────────────────────────────────────────────────────────
console.log("\n=== arbitrate ===");

test("empty graph → []", () => {
  const r = arbitrate({ nodes: [], edges: [] });
  assertEqual(r.length, 0);
});

test("null input → []", () => {
  const r = arbitrate(null);
  assertEqual(r.length, 0);
});

test("single claim no edges → no_evidence, conf 0", () => {
  const graph = { nodes: [makeClaim('a')], edges: [] };
  const r = arbitrate(graph);
  assertEqual(r.length, 1);
  assertEqual(r[0].verdict, 'no_evidence');
  assertAlmostEqual(r[0].confidence, 0);
});

test("2 strong supports → confirmed, conf 1.0", () => {
  const claim = makeClaim('a');
  const graph = {
    nodes: [claim],
    edges: [
      { from: 'p1', to: claim.id, relation: 'supports', weight: 1.0 },
      { from: 'p2', to: claim.id, relation: 'supports', weight: 1.0 },
    ],
  };
  const r = arbitrate(graph);
  assertEqual(r[0].verdict, 'confirmed');
  assertAlmostEqual(r[0].confidence, 1.0);
  assertEqual(r[0].support_count, 2);
  assertEqual(r[0].dispute_count, 0);
});

test("2 supports + 1 dispute → likely, conf 0.667", () => {
  const claim = makeClaim('a');
  const graph = {
    nodes: [claim],
    edges: [
      { from: 'p1', to: claim.id, relation: 'supports', weight: 1.0 },
      { from: 'p2', to: claim.id, relation: 'supports', weight: 1.0 },
      { from: 'p3', to: claim.id, relation: 'contradicts', weight: 1.0 },
    ],
  };
  const r = arbitrate(graph);
  assertEqual(r[0].verdict, 'likely');
  // arbitrate rounds to 3 decimals: 2/3 → 0.667
  assertAlmostEqual(r[0].confidence, 0.667, 1e-6);
});

test("2 disputes no supports → disputed, conf 0", () => {
  const claim = makeClaim('a');
  const graph = {
    nodes: [claim],
    edges: [
      { from: 'p1', to: claim.id, relation: 'contradicts', weight: 1.0 },
      { from: 'p2', to: claim.id, relation: 'contradicts', weight: 1.0 },
    ],
  };
  const r = arbitrate(graph);
  assertEqual(r[0].verdict, 'disputed');
  assertAlmostEqual(r[0].confidence, 0);
});

test("weak single support (w=0.3) → confidence clamps to 0.3", () => {
  // Documents the max(wSupport+wDispute, 1) divisor. A single weak edge
  // doesn't get diluted by a divisor of 0.3 — it uses 1. So confidence
  // equals the raw weight. If this behavior changes, update both the
  // test and the reasoning.
  const claim = makeClaim('a');
  const graph = {
    nodes: [claim],
    edges: [{ from: 'p1', to: claim.id, relation: 'supports', weight: 0.3 }],
  };
  const r = arbitrate(graph);
  assertAlmostEqual(r[0].confidence, 0.3);
});

test("multiple claims each get independent verdicts", () => {
  const claimA = makeClaim('a');
  const claimB = makeClaim('b');
  const graph = {
    nodes: [claimA, claimB],
    edges: [
      { from: 'p1', to: claimA.id, relation: 'supports', weight: 1.0 },
      { from: 'p2', to: claimB.id, relation: 'contradicts', weight: 1.0 },
    ],
  };
  const r = arbitrate(graph);
  assertEqual(r.length, 2);
  const a = r.find(x => x.sector === 'a');
  const b = r.find(x => x.sector === 'b');
  assertEqual(a.verdict, 'confirmed');
  assertEqual(b.verdict, 'disputed');
});

// ─────────────────────────────────────────────────────────────
// pearson (sanity — mostly covered elsewhere)
// ─────────────────────────────────────────────────────────────
console.log("\n=== pearson (sanity) ===");

test("perfect positive → +1", () => {
  assertAlmostEqual(pearson([1, 2, 3, 4, 5], [2, 4, 6, 8, 10]), 1.0);
});

test("perfect negative → -1", () => {
  assertAlmostEqual(pearson([1, 2, 3, 4, 5], [10, 8, 6, 4, 2]), -1.0);
});

test("zero variance → null", () => {
  if (pearson([1, 1, 1, 1], [1, 2, 3, 4]) !== null) throw new Error('expected null');
});

// ─────────────────────────────────────────────────────────────
// buildClaimGraph (structure only)
// ─────────────────────────────────────────────────────────────
console.log("\n=== buildClaimGraph (structure) ===");

test("empty snapshot → empty graph", () => {
  const r = buildClaimGraph({ sectors: {} });
  assertEqual(r.nodes.length, 0);
  assertEqual(r.edges.length, 0);
});

test("null snapshot → empty graph", () => {
  const r = buildClaimGraph(null);
  assertEqual(r.nodes.length, 0);
  assertEqual(r.edges.length, 0);
});

test("single sector produces 1 claim + 2 priors", () => {
  const snapshot = {
    sectors: {
      'test-sector': {
        metric: 'value',
        values: [
          { t: t0, v: 100 },
          { t: t0 + DAY_MS, v: 101 },
          { t: t0 + 2 * DAY_MS, v: 102 },
        ],
      },
    },
  };
  const r = buildClaimGraph(snapshot);
  // buildClaimGraph creates 1 claim node + 1 prior node per historical
  // data point (all values except the last). 3 values → 1 + 2 = 3 nodes.
  assertEqual(r.nodes.length, 3);
  const claims = r.nodes.filter(n => n.type === 'claim');
  assertEqual(claims.length, 1);
  assertEqual(claims[0].sector, 'test-sector');
  const priors = r.nodes.filter(n => n.type === 'prior_observation');
  assertEqual(priors.length, 2);
});

// ─────────────────────────────────────────────────────────────
// Summary
// ─────────────────────────────────────────────────────────────
console.log("\n=== Summary ===");
console.log(`Pass: ${passCount}`);
console.log(`Fail: ${failCount}`);

if (failures.length > 0) {
  console.log("\nFailures:");
  for (const f of failures) console.log(`  ✗ ${f.name}: ${f.message}`);
  console.log("");
  process.exit(1);
} else {
  console.log("\n✅ All tests pass\n");
  process.exit(0);
}
