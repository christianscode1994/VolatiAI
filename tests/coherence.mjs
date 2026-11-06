// tests/coherence.mjs — tests for coherenceScore and detrendedCoherence
//
// Both functions return a NORMALIZED [0, 1] "confidence" score:
//   1.0 = current observation is consistent with history/trend
//   0.0 = current observation is far from history/trend
//
// They use Math.abs(), so there is no direction — they answer
// "how anomalous" not "which way anomalous". Direction comes from
// the raw value itself (v vs mean).
//
// These functions power the 'confidence' field in /signal/<sector>,
// which drives severity classification. If they break, severity is
// wrong for every sector. This file locks the contract.

import {
  coherenceScore,
  detrendedCoherence,
} from '../workers/sector-slow/src/arbitration.js';

let pass = 0, fail = 0;
const failures = [];

function test(name, fn) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
    pass++;
  } catch (e) {
    console.log(`  ✗ ${name} — ${e.message}`);
    failures.push({ name, message: e.message });
    fail++;
  }
}

function assertRange(actual, min, max) {
  if (!Number.isFinite(actual) || actual < min || actual > max) {
    throw new Error(`expected in [${min}, ${max}], got ${actual}`);
  }
}

function assertAlmost(actual, expected, tol = 0.05) {
  if (Math.abs(actual - expected) > tol) {
    throw new Error(`expected ~${expected} (±${tol}), got ${actual}`);
  }
}

function assertNull(actual, msg = '') {
  if (actual !== null) throw new Error(`expected null, got ${actual} ${msg}`);
}

const DAY_MS = 86400000;
const t0 = 1700000000000;

// Helper: build [{t, v}] series
function series(values) {
  return values.map((v, i) => ({ t: t0 + i * DAY_MS, v }));
}

// ─────────────────────────────────────────────────────────────
// coherenceScore — [0, 1] normalized score
// ─────────────────────────────────────────────────────────────
console.log("=== coherenceScore ===");

test("current == mean → high score (near 1.0)", () => {
  const values = series([10, 10, 10, 10, 10, 10, 10, 10, 10, 10]);
  const score = coherenceScore(values, 10);
  // std=0 shortcut returns exactly 1.0
  assertAlmost(score, 1.0, 0.001);
});

test("current exactly at mean of noisy series → score near 1", () => {
  const values = series([8, 12, 8, 12, 8, 12, 8, 12, 8, 12]);
  const mean = 10;
  const score = coherenceScore(values, mean);
  assertAlmost(score, 1.0, 0.05);
});

test("current 1σ above mean → score ~0.8", () => {
  // series with known std: [5,6,7,8,9,10,11,12,13,14] mean=9.5, std≈2.87
  const values = series([5, 6, 7, 8, 9, 10, 11, 12, 13, 14]);
  // |z| = |(9.5+2.87) - 9.5| / 2.87 = 1.0 → score = 1/(1+0.5) ≈ 0.667
  const score = coherenceScore(values, 9.5 + 2.87);
  assertRange(score, 0.6, 0.75);
});

test("current far above mean → score near 0", () => {
  const values = series([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  const score = coherenceScore(values, 100);
  if (score > 0.1) throw new Error(`expected near 0, got ${score}`);
});

test("current far below mean → score near 0 (abs, no direction)", () => {
  const values = series([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  const score = coherenceScore(values, -100);
  if (score > 0.1) throw new Error(`expected near 0, got ${score}`);
});

test("symmetry: same |z| gives same score regardless of direction", () => {
  const values = series([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  const above = coherenceScore(values, 50);
  const below = coherenceScore(values, -30);
  // Both are >5σ from mean; both should be near 0
  if (Math.abs(above - below) > 0.05) {
    throw new Error(`asymmetric: above=${above}, below=${below}`);
  }
});

test("score is always in [0, 1]", () => {
  const values = series([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  for (const cur of [-1000, -10, 0, 5, 10, 1000]) {
    const score = coherenceScore(values, cur);
    assertRange(score, 0, 1);
  }
});

test("returns null for non-array", () => {
  assertNull(coherenceScore(null, 5));
  assertNull(coherenceScore(undefined, 5));
  assertNull(coherenceScore("string", 5));
});

test("returns null for non-numeric current", () => {
  const values = series([1, 2, 3, 4, 5]);
  assertNull(coherenceScore(values, null));
  assertNull(coherenceScore(values, "5"));
  assertNull(coherenceScore(values, NaN));
});

test("returns null for < 2 points", () => {
  assertNull(coherenceScore(series([10]), 10));
  assertNull(coherenceScore([], 10));
});

// ─────────────────────────────────────────────────────────────
// detrendedCoherence — [0, 1] normalized score vs linear trend
// ─────────────────────────────────────────────────────────────
console.log("\n=== detrendedCoherence ===");

test("current on perfect linear trend → returns 1.0 (std=0 shortcut)", () => {
  // perfect line → all residuals 0 → stdR=0 → returns 1.0
  // even if current is far from the line, std=0 wins
  const values = series([10, 11, 12, 13, 14, 15, 16, 17, 18, 19]);
  const score = detrendedCoherence(values, 19);
  assertAlmost(score, 1.0, 0.001);
});

test("noisy trend, current on trend → score near 1", () => {
  // up-trending with alternating ±1 noise: values are 10+i±1
  const values = series([9, 12, 11, 14, 13, 16, 15, 18, 17, 20]);
  // last value is 20; current=20 (roughly on trend)
  const score = detrendedCoherence(values, 20);
  // Should be high confidence since 20 is close to the noisy trend's end
  assertRange(score, 0.5, 1.0);
});

test("noisy trend, current FAR above → score near 0", () => {
  // up-trending with noise so stdR > 0
  const values = series([9, 12, 11, 14, 13, 16, 15, 18, 17, 20]);
  // current is way above trend (should be ~20)
  const score = detrendedCoherence(values, 1000);
  if (score > 0.2) throw new Error(`expected near 0, got ${score}`);
});

test("noisy trend, current FAR below → score near 0 (abs, no direction)", () => {
  const values = series([9, 12, 11, 14, 13, 16, 15, 18, 17, 20]);
  const score = detrendedCoherence(values, -1000);
  if (score > 0.2) throw new Error(`expected near 0, got ${score}`);
});

test("score always in [0, 1]", () => {
  const values = series([9, 12, 11, 14, 13, 16, 15, 18, 17, 20]);
  for (const cur of [-1e6, -100, 0, 20, 100, 1e6]) {
    const score = detrendedCoherence(values, cur);
    assertRange(score, 0, 1);
  }
});

test("returns null for non-array", () => {
  assertNull(detrendedCoherence(null, 5));
  assertNull(detrendedCoherence("string", 5));
});

test("returns null for non-numeric current", () => {
  const values = series([1, 2, 3, 4, 5]);
  assertNull(detrendedCoherence(values, null));
  assertNull(detrendedCoherence(values, NaN));
});

test("returns null for < 3 points", () => {
  assertNull(detrendedCoherence(series([1, 2]), 2));
  assertNull(detrendedCoherence([], 5));
});

test("flat series (all same value) → returns 1.0", () => {
  // stdR would be 0 → returns 1.0
  const values = series([5, 5, 5, 5, 5, 5, 5, 5, 5, 5]);
  const score = detrendedCoherence(values, 5);
  assertAlmost(score, 1.0, 0.001);
});

// ─────────────────────────────────────────────────────────────
// Summary
// ─────────────────────────────────────────────────────────────
console.log(`\n=== Summary ===`);
console.log(`Pass: ${pass}`);
console.log(`Fail: ${fail}`);

if (failures.length > 0) {
  console.log("\nFailures:");
  for (const f of failures) console.log(`  ✗ ${f.name}: ${f.message}`);
  process.exit(1);
} else {
  console.log("\n✅ All tests pass\n");
  process.exit(0);
}
