// tests/chain.mjs — tests for chain linking
import {
  computeChainLink,
  verifyChain,
  verifyChainFromAnchor,
} from '../workers/sector-slow/src/chain.js';

let pass = 0, fail = 0;
const failures = [];

async function test(name, fn) {
  try {
    await fn();
    console.log(`  ✓ ${name}`);
    pass++;
  } catch (e) {
    console.log(`  ✗ ${name} — ${e.message}`);
    failures.push({ name, message: e.message });
    fail++;
  }
}

function assertEqual(a, b, msg = '') {
  if (JSON.stringify(a) !== JSON.stringify(b)) {
    throw new Error(`expected ${JSON.stringify(b)}, got ${JSON.stringify(a)} ${msg}`);
  }
}

// Build a fake snapshot chain (no crypto, just structure)
function makeSnapshot(date, prev_hash, extra = {}) {
  return {
    date,
    prev_hash,
    pairs: [{ a: 'treasuries', b: 'treasuries-gov', r: 0.777 }],
    signed_at: `${date}T03:57:00.000Z`,
    signature: `fake_sig_${date}`,
    pubkey_id: 'test-v1',
    ...extra,
  };
}

console.log("=== computeChainLink ===");

await test("null previous → null (genesis)", async () => {
  const result = await computeChainLink(null);
  assertEqual(result, null);
});

await test("undefined previous → null (genesis)", async () => {
  const result = await computeChainLink(undefined);
  assertEqual(result, null);
});

await test("non-null previous → sha256: prefixed hex", async () => {
  const snap = makeSnapshot('2026-11-05', null);
  const hash = await computeChainLink(snap);
  if (!hash.startsWith('sha256:')) throw new Error(`wrong prefix: ${hash}`);
  if (hash.length !== 7 + 64) throw new Error(`wrong length: ${hash.length}`);
});

await test("same snapshot → same hash (deterministic)", async () => {
  const snap = makeSnapshot('2026-11-05', null);
  const h1 = await computeChainLink(snap);
  const h2 = await computeChainLink(snap);
  assertEqual(h1, h2);
});

await test("different snapshot → different hash", async () => {
  const snap1 = makeSnapshot('2026-11-05', null);
  const snap2 = makeSnapshot('2026-11-06', null);
  const h1 = await computeChainLink(snap1);
  const h2 = await computeChainLink(snap2);
  if (h1 === h2) throw new Error('different snapshots produced same hash');
});

await test("changing one field → different hash", async () => {
  const snap1 = makeSnapshot('2026-11-05', null);
  const snap2 = { ...snap1, signature: 'different_sig' };
  const h1 = await computeChainLink(snap1);
  const h2 = await computeChainLink(snap2);
  if (h1 === h2) throw new Error('field change did not affect hash');
});

await test("key order irrelevant → same hash", async () => {
  const snap1 = makeSnapshot('2026-11-05', null);
  const snap2 = { signature: snap1.signature, pubkey_id: snap1.pubkey_id, signed_at: snap1.signed_at, pairs: snap1.pairs, prev_hash: snap1.prev_hash, date: snap1.date };
  const h1 = await computeChainLink(snap1);
  const h2 = await computeChainLink(snap2);
  assertEqual(h1, h2);
});

console.log("\n=== verifyChain ===");

await test("empty chain → invalid", async () => {
  const result = await verifyChain([]);
  assertEqual(result.valid, false);
  assertEqual(result.reason, 'empty_chain');
});

await test("single genesis snapshot → valid", async () => {
  const snap = makeSnapshot('2026-11-05', null);
  const result = await verifyChain([snap]);
  assertEqual(result.valid, true);
  assertEqual(result.length, 1);
});

await test("2-snapshot valid chain", async () => {
  const s1 = makeSnapshot('2026-11-05', null);
  const link12 = await computeChainLink(s1);
  const s2 = makeSnapshot('2026-11-06', link12);
  const result = await verifyChain([s1, s2]);
  assertEqual(result.valid, true);
  assertEqual(result.length, 2);
});

await test("3-snapshot valid chain", async () => {
  const s1 = makeSnapshot('2026-11-05', null);
  const link12 = await computeChainLink(s1);
  const s2 = makeSnapshot('2026-11-06', link12);
  const link23 = await computeChainLink(s2);
  const s3 = makeSnapshot('2026-11-07', link23);
  const result = await verifyChain([s1, s2, s3]);
  assertEqual(result.valid, true);
  assertEqual(result.length, 3);
});

await test("broken chain: middle snapshot tampered", async () => {
  const s1 = makeSnapshot('2026-11-05', null);
  const link12 = await computeChainLink(s1);
  const s2 = makeSnapshot('2026-11-06', link12);
  const link23 = await computeChainLink(s2);
  const s3 = makeSnapshot('2026-11-07', link23);
  // Tamper middle snapshot
  const tampered = { ...s2, pairs: [{ a: 'x', b: 'y', r: 0.5 }] };
  const result = await verifyChain([s1, tampered, s3]);
  assertEqual(result.valid, false);
  assertEqual(result.broken_at, 2);
  assertEqual(result.reason, 'prev_hash_mismatch');
});

await test("broken chain: deleted middle snapshot", async () => {
  const s1 = makeSnapshot('2026-11-05', null);
  const link12 = await computeChainLink(s1);
  const s2 = makeSnapshot('2026-11-06', link12);
  const link23 = await computeChainLink(s2);
  const s3 = makeSnapshot('2026-11-07', link23);
  // Delete s2, chain s1 → s3 directly
  const result = await verifyChain([s1, s3]);
  assertEqual(result.valid, false);
  assertEqual(result.broken_at, 1);
});

await test("broken chain: first snapshot has non-null prev_hash", async () => {
  const snap = makeSnapshot('2026-11-05', 'sha256:fake');
  const result = await verifyChain([snap]);
  assertEqual(result.valid, false);
  assertEqual(result.reason, 'first_snapshot_has_prev_hash');
});

console.log("\n=== verifyChainFromAnchor ===");

await test("anchor matches → valid", async () => {
  const known_anchor = 'sha256:abc123';
  const s1 = makeSnapshot('2026-11-06', known_anchor);
  const link12 = await computeChainLink(s1);
  const s2 = makeSnapshot('2026-11-07', link12);
  const result = await verifyChainFromAnchor([s1, s2], known_anchor);
  assertEqual(result.valid, true);
  assertEqual(result.length, 2);
});

await test("anchor mismatch → invalid", async () => {
  const s1 = makeSnapshot('2026-11-06', 'sha256:wrong');
  const result = await verifyChainFromAnchor([s1], 'sha256:expected');
  assertEqual(result.valid, false);
  assertEqual(result.reason, 'anchor_mismatch');
});

await test("anchor matches but internal link broken → invalid", async () => {
  const anchor = 'sha256:abc';
  const s1 = makeSnapshot('2026-11-06', anchor);
  const link12 = await computeChainLink(s1);
  const s2 = makeSnapshot('2026-11-07', link12);
  const s3 = makeSnapshot('2026-11-08', 'sha256:wrong');
  const result = await verifyChainFromAnchor([s1, s2, s3], anchor);
  assertEqual(result.valid, false);
  assertEqual(result.broken_at, 2);
});

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
