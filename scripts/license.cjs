#!/usr/bin/env node
/**
 * VolatiAI license verifier — Node builtins only, zero network, zero state.
 *
 * A license is a small JSON file signed with Ed25519:
 *   {
 *     "product": "volatiai-personal",
 *     "instance_id": "<opaque string chosen by buyer or seller>",
 *     "tier": "personal",
 *     "issued_at": "<ISO-8601>",
 *     "exp": null,                       // null = perpetual (personal license)
 *     "signature": "<128 hex chars>"
 *   }
 *
 * Verification is the same primitive as envelope verification:
 *   canonical(license minus {signature}), ed25519 verify against baked pubkey.
 *
 * Usage:
 *   node scripts/license.cjs <license.json> <pubkey.pem>
 *
 * Exit codes: 0 valid, 1 invalid, 2 usage/load error.
 *
 * If `validate_license` in core/api/auth.py is a network call, this module
 * is the replacement. If it's already a pure Ed25519 check, this module is
 * the CLI-side complement to the Python-side check. Either way, the pattern
 * is the same and the pubkey is a build-time input.
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

function main() {
  const [licPath, pubPath] = process.argv.slice(2);
  if (!licPath || !pubPath) {
    console.error("usage: node scripts/license.cjs <license.json> <pubkey.pem>");
    process.exit(2);
  }

  let lic, pub;
  try {
    lic = JSON.parse(fs.readFileSync(licPath, "utf8"));
    pub = crypto.createPublicKey(fs.readFileSync(pubPath));
  } catch (e) {
    console.error(`❌ load failed: ${e.message}`);
    process.exit(2);
  }

  if (!lic.signature || lic.signature.length !== 128) {
    console.error(`❌ signature must be 128 hex chars (got ${(lic.signature || "").length})`);
    process.exit(1);
  }

  const signable = { ...lic };
  delete signable.signature;
  const msg = Buffer.from(canonical(signable), "utf8");
  const sig = Buffer.from(lic.signature, "hex");

  let ok = false;
  try {
    ok = crypto.verify(null, msg, pub, sig);
  } catch (e) {
    console.error(`❌ verify threw: ${e.message}`);
    process.exit(1);
  }

  if (!ok) {
    console.error(`❌ signature does not verify against ${pubPath}`);
    console.error(`   product:   ${lic.product || "<missing>"}`);
    console.error(`   instance:  ${lic.instance_id || "<missing>"}`);
    process.exit(1);
  }

  // Structural checks after signature — if the signature is valid, the
  // signed payload is what we expected; these checks just describe it.
  if (lic.product !== "volatiai-personal") {
    console.error(`❌ wrong product: ${lic.product}`);
    process.exit(1);
  }

  const now = Date.now();
  if (lic.exp != null) {
    const expMs = Date.parse(lic.exp);
    if (!Number.isFinite(expMs)) {
      console.error(`❌ unparseable exp: ${lic.exp}`);
      process.exit(1);
    }
    if (expMs < now) {
      console.error(`❌ license expired at ${lic.exp}`);
      process.exit(1);
    }
  }

  console.log(`✅ valid license`);
  console.log(`   product:  ${lic.product}`);
  console.log(`   instance: ${lic.instance_id}`);
  console.log(`   tier:     ${lic.tier}`);
  console.log(`   issued:   ${lic.issued_at}`);
  console.log(`   expiry:   ${lic.exp == null ? "perpetual" : lic.exp}`);
  process.exit(0);
}

main();
