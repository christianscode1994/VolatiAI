#!/usr/bin/env node
/**
 * Standalone VolatiAI verifier — zero deps beyond node builtins.
 *
 * Verifies the load-bearing claim: the bytes you hold are the bytes the
 * signer attested to, and the signer is the holder of the private key
 * for the pubkey you trust. No network, no worker, no GitHub Pages.
 *
 * Usage:
 *   node scripts/verify.js <envelope.json> <snapshot-file> <pubkey.pem> \
 *                          [--expected-pubkey-id volatiai-XXXXXXXX]
 *
 * Exit codes: 0 verified, 1 verification failed, 2 usage error.
 *
 * Verification layers (both must pass):
 *   1. envelope_signature (hex, ed25519) over canonical(envelope minus
 *      envelope_signature minus envelope_pubkey_id) → attestation authentic.
 *   2. sha256(snapshot_bytes) == envelope.snapshot_hash → the file you
 *      hold is the file the attestation names.
 *
 * The snapshot_signature field (base64) is a secondary layer whose signing
 * domain (raw bytes vs canonical form) is not this script's contract.
 * verify-all.sh handles it in the trusted pipeline.
 */
const fs = require("fs");
const crypto = require("crypto");

function canonical(o) {
  if (o === null) return "null";
  if (typeof o === "boolean") return o ? "true" : "false";
  if (typeof o === "number") return String(o);
  if (typeof o === "string") return JSON.stringify(o);
  if (Array.isArray(o)) return "[" + o.map(canonical).join(",") + "]";
  const k = Object.keys(o).sort();
  return "{" + k.map(x => JSON.stringify(x) + ":" + canonical(o[x])).join(",") + "}";
}

function ed25519(pub, sigBytes, msg) {
  try { return crypto.verify(null, msg, pub, sigBytes); } catch { return false; }
}

function main() {
  const argv = process.argv.slice(2);
  const positional = argv.filter(a => !a.startsWith("--"));
  const flagIdx = argv.indexOf("--expected-pubkey-id");
  const expectedId = flagIdx >= 0 ? argv[flagIdx + 1] : null;

  if (positional.length !== 3) {
    console.error("usage: node scripts/verify.js <envelope.json> <snapshot-file> <pubkey.pem> [--expected-pubkey-id ID]");
    process.exit(2);
  }
  const [envPath, snapPath, pubPath] = positional;

  let env, snapBytes, pub;
  try {
    env = JSON.parse(fs.readFileSync(envPath, "utf8"));
    snapBytes = fs.readFileSync(snapPath);
    pub = crypto.createPublicKey(fs.readFileSync(pubPath));
  } catch (e) {
    console.error(`❌ load failed: ${e.message}`);
    process.exit(2);
  }

  console.log("═".repeat(60));
  console.log("VolatiAI — standalone verification");
  console.log("═".repeat(60));
  console.log(`envelope: ${envPath}`);
  console.log(`snapshot: ${snapPath}`);
  console.log(`pubkey:   ${pubPath}`);
  console.log(`revision: ${env.revision}`);
  if (expectedId && env.envelope_pubkey_id !== expectedId) {
    console.error(`\n❌ envelope_pubkey_id mismatch: have "${env.envelope_pubkey_id}", expected "${expectedId}"`);
    process.exit(1);
  }
  console.log("");

  // ── 1. Envelope signature ──
  const envSigned = { ...env };
  delete envSigned.envelope_signature;
  delete envSigned.envelope_pubkey_id;     // added AFTER signing — see sign_envelope
  const envMsg = Buffer.from(canonical(envSigned), "utf8");
  const envSig = Buffer.from(env.envelope_signature, "hex");
  const envOk = ed25519(pub, envSig, envMsg);
  console.log(`[1] envelope signature  ${envOk ? "✅ valid" : "❌ INVALID"} (canonical ${envMsg.length}B)`);
  if (!envOk) {
    console.error(`\n❌ signature does not verify against ${pubPath}`);
    console.error(`   pubkey_id in envelope: ${env.envelope_pubkey_id}`);
    console.error(`   — the file was not signed by the holder of this key, or`);
    console.error(`     the canonical form changed since signing.`);
    process.exit(1);
  }

  // ── 2. Snapshot hash ──
  const actual = crypto.createHash("sha256").update(snapBytes).digest("hex");
  const hashOk = actual === env.snapshot_hash;
  console.log(`[2] snapshot sha256     ${hashOk ? "✅ matches" : "❌ MISMATCH"}`);
  if (!hashOk) {
    console.error(`   envelope: ${env.snapshot_hash}`);
    console.error(`   actual:   ${actual}`);
    process.exit(1);
  }

  console.log("");
  console.log(`✅ ${env.revision} verified offline — no network, no worker`);
  console.log(`   the bytes you hold are the bytes that were signed,`);
  console.log(`   by the holder of ${env.envelope_pubkey_id}.`);
  console.log("═".repeat(60));
  process.exit(0);
}

main();
