import { tDistPValue } from '../workers/sector-slow/src/arbitration.js';

const cases = [
  [2.093, 19, 0.05, 't-table 95%, df=19'],
  [2.861, 19, 0.01, 't-table 99%, df=19'],
  [3.883, 19, 0.001, 't-table 99.9%, df=19'],
  [5.38, 19, 4.0e-5, 'r=0.777, n=21 case'],
  [1.96, 10000, 0.05, 'large df ~ normal'],
  [0, 19, 1.0, 't=0 -> p=1'],
  [20, 10, 1e-8, 'very large t, small df'],
];

let pass = 0, fail = 0;
for (const [t, df, expected, desc] of cases) {
  const p = tDistPValue(t, df);
  const tol = expected < 1e-4 ? expected * 10 : expected * 0.05;
  const ok = Math.abs(p - expected) < tol || (expected < 1e-6 && p < 1e-6);
  if (ok) {
    console.log(`  ✓ ${desc}: t=${t} df=${df} -> p=${p.toExponential(2)}`);
    pass++;
  } else {
    console.log(`  ✗ ${desc}: t=${t} df=${df} -> p=${p.toExponential(2)} (expected ~${expected.toExponential(2)})`);
    fail++;
  }
}
console.log(`\n${pass} pass, ${fail} fail`);
process.exit(fail === 0 ? 0 : 1);
