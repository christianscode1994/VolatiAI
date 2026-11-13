import { privateKeyToAccount } from "viem/accounts";
import { randomBytes } from "crypto";
import { readFileSync } from "fs";

const PK = readFileSync(process.env.HOME + "/.volatiai/test-buyer.key", "utf8").trim();
const account = privateKeyToAccount(PK.startsWith("0x") ? PK : "0x" + PK);

const PAYTO = "0x5da4115fda99fb454b599c024af9475c4f676c70";
const USDC = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const VALUE = "1000000";
const NONCE = "0x" + randomBytes(32).toString("hex");
const VALID_BEFORE = Math.floor(Date.now() / 1000) + 300;

const body = {
  url: "https://volatiai-mcp.fourieranalys.workers.dev",
  email: "contact@fourieranalys.se",
  service_name: "VolatiAI",
  description: "Top-volatility crypto assets ranked by 1h/24h/7d price change. Returns up to 10 assets per call. USDC on Base, Arc, and Solana via x402 at $0.005/call.",
  website_url: "https://volatiai-mcp.fourieranalys.workers.dev",
  category: "Data",
  endpoints: ["/premium/mcp"],
};

const domain = { name: "USD Coin", version: "2", chainId: 8453, verifyingContract: USDC };
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
  validAfter: 0n, validBefore: BigInt(VALID_BEFORE), nonce: NONCE,
};

console.log("Buyer:   ", account.address);
console.log("PayTo:   ", PAYTO);
console.log("Amount:  1.000000 USDC on Base");

const signature = await account.signTypedData({
  domain, types, primaryType: "TransferWithAuthorization", message,
});
console.log("Signature:", signature.slice(0, 20) + "..." + signature.slice(-20));

const paymentPayload = {
  x402Version: 2, scheme: "exact", network: "eip155:8453",
  payload: {
    signature,
    authorization: {
      from: account.address, to: PAYTO, value: VALUE,
      validAfter: "0", validBefore: String(VALID_BEFORE), nonce: NONCE,
    },
  },
};
const payHeader = Buffer.from(JSON.stringify(paymentPayload)).toString("base64");

console.log("\nSubmitting to x402-list with PAYMENT-SIGNATURE...");
const res = await fetch("https://x402-list.com/api/v1/submit", {
  method: "POST",
  headers: { "Content-Type": "application/json", "PAYMENT-SIGNATURE": payHeader },
  body: JSON.stringify(body),
});

const text = await res.text();
console.log("\nHTTP", res.status);
try { console.log(JSON.stringify(JSON.parse(text), null, 2)); }
catch { console.log(text.slice(0, 1000)); }
