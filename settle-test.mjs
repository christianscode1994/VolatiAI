import { privateKeyToAccount } from 'viem/accounts';
import { randomBytes } from 'crypto';
import { readFileSync } from 'fs';

const PAYTO     = "0x3EE508f75342315164301B2282f302DF3d3beD47";
const USDC_BASE = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const ENDPOINT  = "https://volatiai-mcp.fourieranalys.workers.dev/premium/mcp";
const VALUE     = "5000";
const CHAIN_ID  = 8453;

let pk = readFileSync(process.env.HOME + "/.volatiai/test-buyer.key", "utf8").trim();
if (!pk.startsWith("0x")) pk = "0x" + pk;
const account = privateKeyToAccount(pk);

if (account.address.toLowerCase() === PAYTO.toLowerCase()) {
  console.error("❌ Wallet equals payTo — CDP rejects self-sends");
  process.exit(1);
}

console.log("Buyer:   " + account.address);
console.log("PayTo:   " + PAYTO);
console.log("Amount:  0.005 USDC on Base\n");

async function checkBalance() {
  const res = await fetch("https://mainnet.base.org", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0", id: 1, method: "eth_call",
      params: [{
        to: USDC_BASE,
        data: "0x70a08231" + account.address.slice(2).padStart(64, "0"),
      }, "latest"],
    }),
  });
  const data = await res.json();
  return (!data.result || data.result === "0x") ? 0n : BigInt(data.result);
}

const balBefore = await checkBalance();
console.log("Balance before: " + (Number(balBefore) / 1e6) + " USDC\n");
if (balBefore < BigInt(VALUE)) {
  console.error("❌ Insufficient USDC: have " + (Number(balBefore)/1e6) + ", need 0.1");
  process.exit(1);
}

const now = Math.floor(Date.now() / 1000);
const nonce = "0x" + randomBytes(32).toString("hex");

const domain = { name: "USD Coin", version: "2", chainId: CHAIN_ID, verifyingContract: USDC_BASE };
const types = {
  TransferWithAuthorization: [
    { name: "from", type: "address" },
    { name: "to", type: "address" },
    { name: "value", type: "uint256" },
    { name: "validAfter", type: "uint256" },
    { name: "validBefore", type: "uint256" },
    { name: "nonce", type: "bytes32" },
  ],
};
const message = {
  from: account.address, to: PAYTO, value: BigInt(VALUE),
  validAfter: 0n, validBefore: BigInt(now + 3600), nonce,
};

console.log("Signing EIP-712 TransferWithAuthorization...");
const signature = await account.signTypedData({ domain, types, primaryType: "TransferWithAuthorization", message });
console.log("Signature: " + signature.slice(0, 20) + "..." + signature.slice(-20) + "\n");

const payload = {
  x402Version: 1, scheme: "exact", network: "base",
  payload: {
    signature,
    authorization: {
      from: account.address, to: PAYTO, value: VALUE,
      validAfter: "0", validBefore: String(now + 3600), nonce,
    },
  },
};
const xPayment = Buffer.from(JSON.stringify(payload)).toString("base64");




console.log("Submitting payment to Worker...\n");
const res = await fetch(ENDPOINT, {
  method: "POST",
  headers: { "Content-Type": "application/json", "X-PAYMENT": xPayment },
  body: JSON.stringify({
    jsonrpc: "2.0",
    id: 1,
    method: "tools/call",
    params: {
      name: "get_wallet_summary",
      arguments: { address: "0x5060f8A0d4ebbe6c46011690e2d4761F35c75d48" }
    }
  }),
});
const resText = await res.text();
console.log("HTTP " + res.status + "\n");

let parsed;
try { parsed = JSON.parse(resText); } catch { parsed = null; }

if (!parsed) {
  console.error("❌ Non-JSON response from Worker (HTTP " + res.status + ")");
  console.error("Body: " + resText.slice(0, 500));
  process.exit(1);
}
if (parsed.error) {
  console.log("❌ Settlement failed:");
  console.log(JSON.stringify(parsed, null, 2));
  process.exit(1);
}
if (!parsed.result) {
  console.error("❌ Unexpected response shape:");
  console.log(JSON.stringify(parsed, null, 2).slice(0, 500));
  process.exit(1);
}

console.log("✅ Settlement succeeded:");
  console.log("   Result:", JSON.stringify(parsed.result, null, 2));
if (parsed && parsed.result && parsed.result.tools) {
  console.log("   " + parsed.result.tools.length + " tools returned");
}

await new Promise(r => setTimeout(r, 3000));
const balAfter = await checkBalance();
console.log("\nBalance before: " + (Number(balBefore) / 1e6) + " USDC");
console.log("Balance after:  " + (Number(balAfter) / 1e6) + " USDC");
console.log("Difference:     " + (Number(balAfter - balBefore) / 1e6) + " USDC");

if (balAfter < balBefore) {
  console.log("\n🎉 USDC moved! Payment settled on-chain.");
  console.log("   Buyer: https://basescan.org/address/" + account.address);
  console.log("   PayTo: https://basescan.org/address/" + PAYTO);
} else {
  console.log("\n⚠️  Balance unchanged — check basescan manually");
}
