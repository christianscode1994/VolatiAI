// tests/signing.mjs — tests for Ed25519 snapshot signing
//
// Generates a fresh Ed25519 keypair in-memory, signs a test snapshot,
// verifies the signature. Same crypto.subtle API that runs in
// Cloudflare Workers. If this test passes, the signing code is correct.

import {
  signSnapshot,
  verifySnapshot,
  canonicalize,
  bytesToBase64,
} from '../workers/sector-slow/src/signing.js';

let pass = 0, fail = 0;
const failures = [];

function test(name, fn) {
  try {
    const r = fn();
    if (r && typeof r.then === 'function') {
      throw new Error('async test not awaited');
    }
    console.log(`  ✓ ${name}`);
    pass++;
  } catch (e) {
    console.log(`  ✗ ${name} — ${e.message}`);
    failures.push({ name, message: e.message });
    fail++;
  }
}

async function testAsync(name, fn) {
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

// ─── canonicalize (sync) ─────────────────────────────────────
console.log("=== canonicalize ===");

test("simple object", () => {
  assertEqual(canonicalize({ a: 1, b: 2 }), '{"a":1,"b":2}');
});

test("key order irrelevant", () => {
  const a = canonicalize({ b: 2, a: 1 });
  const b = canonicalize({ a: 1, b: 2 });
  if (a !== b) throw new Error(`order-dependent: ${a} != ${b}`);
});

test("nested objects sort recursively", () => {
  const a = canonicalize({ z: { y: 2, x: 1 }, a: 0 });
  const b = canonicalize({ a: 0, z: { x: 1, y: 2 } });
  if (a !== b) throw new Error(`not deterministic: ${a} != ${b}`);
});

test("arrays preserve order", () => {
  const a = canonicalize([1, 2, 3]);
  const b = canonicalize([3, 2, 1]);
  if (a === b) throw new Error('arrays should be order-sensitive');
});

test("null and primitives", () => {
  assertEqual(canonicalize(null), 'null');
  assertEqual(canonicalize(42), '42');
  assertEqual(canonicalize("hello"), '"hello"');
  assertEqual(canonicalize(true), 'true');
});

// ─── Signing (async) ─────────────────────────────────────────
console.log("\n=== signing ===");

// Generate test keypair once
const keyPair = await crypto.subtle.generateKey(
  { name: 'Ed25519' },
  true,
  ['sign', 'verify']
);
const privDer = await crypto.subtle.exportKey('pkcs8', keyPair.privateKey);
const pubSpki = await crypto.subtle.exportKey('spki', keyPair.publicKey);
const privB64 = bytesToBase64(new Uint8Array(privDer));
const pubB64 = bytesToBase64(new Uint8Array(pubSpki));
const pubPem = `-----BEGIN PUBLIC KEY-----\n${pubB64}\n-----END PUBLIC KEY-----`;

const env = { VOLATIAI_SIGNING_KEY: privB64, VOLATIAI_PUBKEY_ID: 'test-v1' };

await testAsync("signSnapshot adds signature + pubkey_id + signed_at", async () => {
  const snapshot = { date: '2026-11-05', pairs: [], note: 'test' };
  const signed = await signSnapshot(snapshot, env);
  if (!signed.signature) throw new Error('no signature');
  if (signed.pubkey_id !== 'test-v1') throw new Error(`wrong pubkey_id: ${signed.pubkey_id}`);
  if (!signed.signed_at) throw new Error('no signed_at');
  if (signed.date !== '2026-11-05') throw new Error('lost original field');
});

await testAsync("signSnapshot preserves all original fields", async () => {
  const snapshot = { a: 1, b: { c: [1, 2, 3] }, d: 'text' };
  const signed = await signSnapshot(snapshot, env);
  if (signed.a !== 1) throw new Error('lost a');
  if (signed.b.c[1] !== 2) throw new Error('lost nested');
  if (signed.d !== 'text') throw new Error('lost d');
});

await testAsync("throws if VOLATIAI_SIGNING_KEY missing", async () => {
  let threw = false;
  try {
    await signSnapshot({}, {});
  } catch (e) {
    if (String(e).includes('VOLATIAI_SIGNING_KEY')) threw = true;
  }
  if (!threw) throw new Error('expected throw');
});

await testAsync("verifySnapshot returns {valid: true} for unmodified", async () => {
  const snapshot = { date: '2026-11-05', value: 42 };
  const signed = await signSnapshot(snapshot, env);
  const result = await verifySnapshot(signed, pubPem);
  if (!result.valid) throw new Error(`not valid: ${JSON.stringify(result)}`);
  if (result.pubkey_id !== 'test-v1') throw new Error(`wrong pubkey_id: ${result.pubkey_id}`);
});

await testAsync("verifySnapshot fails on modified field", async () => {
  const signed = await signSnapshot({ date: '2026-11-05', value: 42 }, env);
  const tampered = { ...signed, value: 43 };
  const result = await verifySnapshot(tampered, pubPem);
  if (result.valid) throw new Error('should be invalid');
  if (result.reason !== 'signature_mismatch') throw new Error(`wrong reason: ${result.reason}`);
});

await testAsync("verifySnapshot fails on modified signed_at", async () => {
  const signed = await signSnapshot({ value: 1 }, env);
  const tampered = { ...signed, signed_at: '2020-01-01T00:00:00.000Z' };
  const result = await verifySnapshot(tampered, pubPem);
  if (result.valid) throw new Error('should be invalid');
});

await testAsync("verifySnapshot fails on wrong public key", async () => {
  const otherPair = await crypto.subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify']);
  const otherPub = await crypto.subtle.exportKey('spki', otherPair.publicKey);
  const otherPem = `-----BEGIN PUBLIC KEY-----\n${bytesToBase64(new Uint8Array(otherPub))}\n-----END PUBLIC KEY-----`;
  
  const signed = await signSnapshot({ value: 1 }, env);
  const result = await verifySnapshot(signed, otherPem);
  if (result.valid) throw new Error('should be invalid with wrong key');
  if (result.reason !== 'signature_mismatch') throw new Error(`wrong reason: ${result.reason}`);
});

await testAsync("verifySnapshot fails on missing signature", async () => {
  const result = await verifySnapshot({ date: '2026-11-05' }, pubPem);
  if (result.valid) throw new Error('should be invalid');
  if (result.reason !== 'no_signature') throw new Error(`wrong reason: ${result.reason}`);
});

await testAsync("verifySnapshot fails on missing signed_at", async () => {
  const signed = await signSnapshot({ value: 1 }, env);
  delete signed.signed_at;
  const result = await verifySnapshot(signed, pubPem);
  if (result.valid) throw new Error('should be invalid');
  if (result.reason !== 'no_signed_at') throw new Error(`wrong reason: ${result.reason}`);
});

await testAsync("canonicalize order-independence survives sign/verify roundtrip", async () => {
  const a = await signSnapshot({ x: 1, y: 2 }, env);
  // Verify with semantically-equal but differently-ordered object
  const reordered = { y: a.y, x: a.x, signed_at: a.signed_at, signature: a.signature, pubkey_id: a.pubkey_id };
  const result = await verifySnapshot(reordered, pubPem);
  if (!result.valid) throw new Error('order should not matter');
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
