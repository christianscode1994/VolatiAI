#!/usr/bin/env node
// Usage: node scripts/make-license.cjs --instance <id>
// Reads private key from LICENSE_PRIVATE_KEY env var or ~/.volatiai/license.key
const fs = require("fs");
const crypto = require("crypto");
const os = require("os");
const path = require("path");

const arg = (n, d) => {
  const i = process.argv.indexOf(n);
  return i >= 0 ? process.argv[i + 1] : d;
};

const instance = arg("--instance");
if (!instance) {
  console.error("usage: node scripts/make-license.cjs --instance <id>");
  process.exit(2);
}

let keyPem = process.env.LICENSE_PRIVATE_KEY;
if (!keyPem) {
  const p = path.join(os.homedir(), ".volatiai", "license.key");
  if (!fs.existsSync(p)) {
    console.error(`❌ set LICENSE_PRIVATE_KEY or create ${p}`);
    console.error(`   generate: node -e 'const c=require("crypto");const{privateKey}=c.generateKeyPairSync("ed25519");console.log(privateKey.export({type:"pkcs8",format:"pem"}))' > ~/.volatiai/license.key`);
    process.exit(2);
  }
  keyPem = fs.readFileSync(p, "utf8");
}

function canonical(o) {
  if (o === null) return "null";
  if (typeof o === "boolean") return o ? "true" : "false";
  if (typeof o === "number") return String(o);
  if (typeof o === "string") return JSON.stringify(o);
  if (Array.isArray(o)) return "[" + o.map(canonical).join(",") + "]";
  const k = Object.keys(o).sort();
  return "{" + k.map(x => JSON.stringify(x) + ":" + canonical(o[x])).join(",") + "}";
}

const priv = crypto.createPrivateKey(keyPem);
const payload = {
  product: "volatiai-personal",
  instance_id: instance,
  tier: "personal",
  issued_at: new Date().toISOString(),
  exp: null,
};
const msg = Buffer.from(canonical(payload), "utf8");
const sig = crypto.sign(null, msg, priv);
payload.signature = sig.toString("hex");

fs.writeFileSync(`license-${instance}.json`, JSON.stringify(payload, null, 2));
console.log(`✅ wrote license-${instance}.json`);
