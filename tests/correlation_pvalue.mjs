// Document correlationPValue() behavior — run manually, not in CI yet.
//
// The worker's correlationPValue uses a normal-distribution tail approximation.
// For small df (n-2 < 30), this under-reports p-values by orders of magnitude
// because the t-distribution has heavier tails than the normal.
//
// This test verifies:
//   - p-value is always in [0, 1]
//   - p-value decreases as r increases (monotonic)
//   - for large df, normal and t converge (no bug observable)
//   - for small df + high r, current implementation under-reports
//
// Run: node tests/correlation_pvalue.mjs

import { correlationPValue } from '../workers/sector-slow/src/arbitration.js';

let passCount = 0;
let failCount = 0;
let documentedCount = 0;

function test(name, fn, expectPass = true) {
  try {
    fn();
    if (expectPass) {
      console.log(`  ✓ ${name}`);
      passCount++;
    } else {
      console.log(`  ✗ ${name} (expected to fail but passed — remove expectFail)`);
      failCount++;
    }
  } catch (e) {
    if (!expectPass) {
      console.log(`  ◇ ${name} (documented failure: ${e.message})`);
      documentedCount++;
    } else {
      console.log(`  ✗ ${name} (${e.message})`);
      failCount++;
    }
  }
}

console.log("=== correlationPValue — structural checks (expected to pass) ===");

test("returns number in [0,1] for positive r", () => {
  const p = correlationPValue(0.5, 30);
  if (typeof p !== 'number') throw new Error(`type ${typeof p}`);
  if (p < 0 || p > 1) throw new Error(`out of range: ${p}`);
});

test("returns number in [0,1] for negative r", () => {
  const p = correlationPValue(-0.7, 50);
  if (typeof p !== 'number') throw new Error(`type ${typeof p}`);
  if (p < 0 || p > 1) throw new Error(`out of range: ${p}`);
});

test("p(r=0, n=30) is high (≈1)", () => {
  const p = correlationPValue(0, 30);
  if (p < 0.9) throw new Error(`unexpectedly low: ${p}`);
});

test("p decreases as |r| increases at fixed n", () => {
  const p_low = correlationPValue(0.3, 30);
  const p_high = correlationPValue(0.8, 30);
  if (p_low <= p_high) throw new Error(`not monotonic: p(0.3)=${p_low}, p(0.8)=${p_high}`);
});

test("p decreases as n increases at fixed r", () => {
  const p_small = correlationPValue(0.5, 15);
  const p_large = correlationPValue(0.5, 200);
  if (p_small <= p_large) throw new Error(`not monotonic: p(15)=${p_small}, p(200)=${p_large}`);
});

console.log(`\n${passCount} pass, ${failCount} fail`);

console.log("\n=== correlationPValue — t-distribution accuracy (expected to document bug) ===");

// For r=0.777, n=21, df=19:
//   t = r * sqrt((n-2)/(1-r²)) = 5.38
//   two-tailed t-dist p ≈ 4e-5
// Observed worker output: 7.77e-8 — ~500× smaller (normal approximation)
test("r=0.777, n=21 gives ~4e-5 (t-dist)", () => {
  const p = correlationPValue(0.777, 21);
  // Expected t-distribution p-value
  const expected = 4e-5;
  const tolerance_factor = 10; // within 10× of correct
  if (p < expected / tolerance_factor) {
    throw new Error(`under-reported: got ${p.toExponential(2)}, expected ≈${expected.toExponential(2)}`);
  }
  if (p > expected * tolerance_factor) {
    throw new Error(`over-reported: got ${p.toExponential(2)}, expected ≈${expected.toExponential(2)}`);
  }
}, false); // expectFail — this is the documented bug

test("r=0.5, n=30 gives ~7e-4 (t-dist)", () => {
  const p = correlationPValue(0.5, 30);
  const expected = 7e-4;
  const tolerance_factor = 10;
  if (p < expected / tolerance_factor || p > expected * tolerance_factor) {
    throw new Error(`got ${p.toExponential(2)}, expected ≈${expected.toExponential(2)}`);
  }
}, false);

console.log(`\n${documentedCount} documented failures (bug: normal approximation, not t)`);
console.log("\n=== Summary ===");
console.log(`Structural checks: ${passCount} pass, ${failCount} fail`);
console.log(`Accuracy checks:   ${documentedCount} documented failures`);
console.log("\nThe documented failures are real: correlationPValue uses a normal");
console.log("approximation. For df<30, this under-reports p by 10-500×. Fix requires");
console.log("a t-distribution tail function — worker change, deferred to Nov 5+.");
console.log("");
console.log(failCount === 0 ? "✅ All structural checks pass" : "❌ Structural checks failed");
process.exit(failCount === 0 ? 0 : 1);
