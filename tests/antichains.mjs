#!/usr/bin/env node
/**
 * tests/antichains.mjs — verifies antichains.js against hand-computed fixtures.
 *
 * VERIFY: node tests/antichains.mjs
 * EXPECT: Pass: N, Fail: 0
 */

import {
  buildReachability,
  isAncestor,
  isAntichain,
  maximalAntichain,
} from '../workers/sector-slow/src/antichains.js';

let pass = 0, fail = 0;
const failures = [];

function eq(actual, expected, name) {
  const a = JSON.stringify([...actual].sort());
  const e = JSON.stringify([...expected].sort());
  if (a === e) { pass++; console.log(`  ✓ ${name}`); }
  else {
    fail++;
    failures.push(name);
    console.log(`  ✗ ${name}\n    expected: ${e}\n    actual:   ${a}`);
  }
}

function ok(actual, expected, name) {
  if (actual === expected) { pass++; console.log(`  ✓ ${name}`); }
  else {
    fail++;
    failures.push(name);
    console.log(`  ✗ ${name}\n    expected: ${expected}, got: ${actual}`);
  }
}

// ─── Fixtures ───
const chain = [['a','b'], ['b','c']];                          // a→b→c
const chainR = buildReachability(chain);

const diamond = [['a','b'], ['a','c'], ['b','d'], ['c','d']];  // a→{b,c}→d
const diamondR = buildReachability(diamond);

const star = [['a','b'], ['a','c'], ['a','d']];                // a→{b,c,d}
const starR = buildReachability(star);

// ─── buildReachability ───
console.log('\n=== buildReachability ===');
ok(chainR.get('a').has('b'), true,  'chain: a reaches b (direct)');
ok(chainR.get('a').has('c'), true,  'chain: a reaches c (transitive)');
ok(chainR.get('c').has('a'), false, 'chain: c does not reach a');
ok(chainR.get('b').has('b'), false, 'chain: b does not reach itself');
ok(buildReachability([]).size, 0,   'empty dag → empty reachability');

// ─── isAncestor ───
console.log('\n=== isAncestor ===');
ok(isAncestor(chainR, 'a', 'c'), true,  'chain: a is ancestor of c');
ok(isAncestor(chainR, 'c', 'a'), false, 'chain: c is not ancestor of a');
ok(isAncestor(chainR, 'a', 'a'), false, 'chain: a is not its own ancestor');

// ─── isAntichain ───
console.log('\n=== isAntichain ===');
ok(isAntichain(chainR, []), true,               'empty set is antichain');
ok(isAntichain(chainR, ['a']), true,            'singleton is antichain');
ok(isAntichain(chainR, ['a','b']), false,       'chain {a,b} not antichain');
ok(isAntichain(chainR, ['b','c']), false,       'chain {b,c} not antichain');
ok(isAntichain(diamondR, ['b','c']), true,      'diamond {b,c} is antichain');
ok(isAntichain(diamondR, ['b','d']), false,     'diamond {b,d} not antichain');
ok(isAntichain(starR, ['b','c','d']), true,     'star {b,c,d} is antichain');
ok(isAntichain(starR, ['a','b']), false,        'star {a,b} not antichain');

// ─── maximalAntichain ───
console.log('\n=== maximalAntichain ===');
eq(maximalAntichain(chainR, ['a','b','c']), ['c'],       'chain all → {c}');
eq(maximalAntichain(chainR, ['a','b']), ['b'],           'chain {a,b} → {b}');
eq(maximalAntichain(diamondR, ['a','b','c','d']), ['d'], 'diamond all → {d}');
eq(maximalAntichain(diamondR, ['a','b','c']), ['b','c'], 'diamond {a,b,c} → {b,c}');
eq(maximalAntichain(starR, ['a','b','c','d']), ['b','c','d'], 'star all → {b,c,d}');
eq(maximalAntichain(starR, ['b','c']), ['b','c'], 'star {b,c} → {b,c}');

// ─── Invariant: maximalAntichain output is always an antichain ───
console.log('\n=== invariant: maximalAntichain output is an antichain ===');
for (const [name, r, input] of [
  ['chain', chainR, ['a','b','c']],
  ['diamond', diamondR, ['a','b','c','d']],
  ['star', starR, ['a','b','c','d']],
]) {
  const result = maximalAntichain(r, input);
  ok(isAntichain(r, result), true, `${name}: output of maximalAntichain is antichain`);
}

// ─── Summary ───
console.log(`\n=== Summary ===`);
console.log(`Pass: ${pass}`);
console.log(`Fail: ${fail}`);
if (failures.length > 0) {
  console.log('\nFailures:');
  for (const f of failures) console.log(`  ✗ ${f}`);
  process.exit(1);
}
console.log('\n✅ All tests pass\n');
