import { createSIWxPayload, encodeSIWxHeader } from '@x402/extensions/sign-in-with-x';
import { privateKeyToAccount } from 'viem/accounts';

const SIGNER_PK = process.env.X402SCAN_SIGNER_KEY;
if (!SIGNER_PK) {
  console.error('❌ set X402SCAN_SIGNER_KEY');
  process.exit(1);
}
const signer = privateKeyToAccount(SIGNER_PK);

const ROUTE = 'https://volatiai-mcp.fourieranalys.workers.dev/premium/mcp';
const REGISTER_URL = 'https://www.x402scan.com/api/x402/registry/register';

// 1. Unauthenticated POST → 402 with SIWX extension
const r1 = await fetch(REGISTER_URL, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ url: ROUTE })
});
const body1 = await r1.json();

if (r1.status !== 402) {
  console.error(`❌ expected 402, got ${r1.status}`);
  console.error(JSON.stringify(body1, null, 2));
  process.exit(1);
}

const extension = body1?.extensions?.['sign-in-with-x'];
if (!extension) {
  console.error('❌ no sign-in-with-x extension in 402 body. Body shape:');
  console.error(JSON.stringify(body1, null, 2));
  process.exit(1);
}

console.log('✓ got SIWX challenge');
console.log('  supportedChains:', JSON.stringify(extension.supportedChains));

// 2. Pick matching chain from the 402's accepts
const paymentNetwork = body1.accepts?.[0]?.network;
const matchingChain = extension.supportedChains?.find(c => c.chainId === paymentNetwork)
                    ?? extension.supportedChains?.[0];
if (!matchingChain) {
  console.error('❌ no supportedChains in extension');
  process.exit(1);
}
console.log(`  using chain: ${matchingChain.chainId} (${matchingChain.type})`);

// 3. Build completeInfo — spread info + selected chain
const completeInfo = {
  ...extension.info,
  chainId: matchingChain.chainId,
  type: matchingChain.type,
};

// 4. Sign — third arg (response.url) is REQUIRED for origin binding
const payload = await createSIWxPayload(completeInfo, signer, r1.url);
const header = encodeSIWxHeader(payload);
console.log('✓ signed SIWX payload');

// 5. Retry with the header
const r2 = await fetch(REGISTER_URL, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'SIGN-IN-WITH-X': header,
  },
  body: JSON.stringify({ url: ROUTE })
});
const body2 = await r2.text();

if (r2.ok) {
  console.log('✅ registered on x402scan');
  console.log(body2);
} else {
  console.error(`❌ registration failed (${r2.status}):`);
  console.error(body2);
  process.exit(1);
}
