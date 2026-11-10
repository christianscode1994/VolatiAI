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
 * Verification layers:
 *   1. envelope_signature (hex, ed25519) over canonical(envelope minus
 *      envelope_signature minus envelope_pubkey_id) → attestation authentic.
 *   2a. snapshot.hash == envelope.snapshot_hash
 *       → the attestation names THIS snapshot.
 *   2b. sha256(canonical(snapshot minus {hash, prev_hash, signature,
 *       pubkey_id})) == snapshot.hash
 *       → the snapshot's hash field honestly describes its own content.
 *       (See docs/VERIFICATION.md — signed_at STAYS in the payload.)
 *   2c. [optional, --anchor <path>] sha256(raw_bytes) == anchor.file_sha256
 *       → raw bytes on disk match the timestamped anchor. This is the
 *       layer that catches formatting-only edits that don't change the
 *       canonical payload.
 *
 * Note: envelope.snapshot_hash is the CANONICAL PAYLOAD HASH, not the
 * raw-file SHA-256. Those are different fields with different purposes;
 * the anchor log records both. verify.cjs at 47847931 checked raw bytes
 * against the canonical hash and always failed on correct artifacts.
 *
 * The snapshot.signature field (base64) is a secondary layer handled by
 * verify-all.sh; this script's contract is content authentication via
 * the envelope + snapshot hash chain.
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
  const flagVals = new Set();
  for (const f of ["--expected-pubkey-id", "--anchor"]) {
    const i = argv.indexOf(f);
    if (i >= 0) flagVals.add(argv[i + 1]);
  }
  const positional = argv.filter(a => !a.startsWith("--") && !flagVals.has(a));
  const flagIdx = argv.indexOf("--expected-pubkey-id");
  const expectedId = flagIdx >= 0 ? argv[flagIdx + 1] : null;
  const anchorIdx = argv.indexOf("--anchor");
  const anchorPath = anchorIdx >= 0 ? argv[anchorIdx + 1] : null;

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

  // ── 2. Snapshot integrity ──
  let snap;
  try {
    snap = JSON.parse(snapBytes.toString("utf8"));
  } catch (e) {
    console.error(`❌ snapshot is not valid JSON: ${e.message}`);
    process.exit(1);
  }

  // 2a — envelope names this snapshot
  if (snap.hash !== env.snapshot_hash) {
    console.error(`[2a] envelope names this snapshot  ❌`);
    console.error(`     envelope.snapshot_hash: ${env.snapshot_hash}`);
    console.error(`     snapshot.hash:          ${snap.hash}`);
    process.exit(1);
  }
  console.log(`[2a] envelope names this snapshot  ✅`);

  // 2b — snapshot's hash honestly describes its payload.
  // Per docs/VERIFICATION.md: strip {hash, prev_hash, signature, pubkey_id}.
  // signed_at STAYS in the payload.
  const payload = { ...snap };
  for (const k of ["hash", "prev_hash", "signature", "pubkey_id"]) delete payload[k];
  const computed = crypto.createHash("sha256")
    .update(Buffer.from(canonical(payload), "utf8"))
    .digest("hex");
  if (computed !== snap.hash) {
    console.error(`[2b] snapshot hash matches payload  ❌`);
    console.error(`     snapshot.hash:  ${snap.hash}`);
    console.error(`     computed:       ${computed}`);
    console.error(`     (if this diverges, either the file was tampered, or`);
    console.error(`      the strip set / canonicalizer no longer matches`);
    console.error(`      scripts/sign_snapshot.py — check verify-all.sh)`);
    process.exit(1);
  }
  console.log(`[2b] snapshot hash matches payload  ✅`);

  // 2c — optional: raw bytes match anchor
  if (anchorPath) {
    let anchors;
    try {
      anchors = fs.readFileSync(anchorPath, "utf8")
        .split("\n").filter(Boolean).map(l => JSON.parse(l));
    } catch (e) {
      console.error(`❌ anchor file unreadable: ${e.message}`);
      process.exit(2);
    }
    const entry = anchors.find(a => a.date === env.snapshot_date);
    if (!entry) {
      console.error(`[2c] raw bytes match anchor        ❌`);
      console.error(`     no anchor entry for date ${env.snapshot_date}`);
      process.exit(1);
    }
    const fileSha = crypto.createHash("sha256").update(snapBytes).digest("hex");
    if (fileSha !== entry.file_sha256) {
      console.error(`[2c] raw bytes match anchor        ❌`);
      console.error(`     anchor.file_sha256: ${entry.file_sha256}`);
      console.error(`     actual file:        ${fileSha}`);
      process.exit(1);
    }
    console.log(`[2c] raw bytes match anchor        ✅ (${fileSha.slice(0, 16)}…)`);
  }

  console.log("");
  console.log(`✅ ${env.revision} verified offline — no network, no worker`);
  console.log(`   the content you hold is the content the attestation names,`);
  console.log(`   the attestation was signed by ${env.envelope_pubkey_id},`);
  console.log(`   and the snapshot hash honestly describes its payload.`);
  if (!anchorPath) {
    console.log(`   (pass --anchor <_anchors.jsonl> to additionally check`);
    console.log(`    that the raw file bytes match the timestamped anchor)`);
  }
  console.log("═".repeat(60));
  process.exit(0);
}

main();
