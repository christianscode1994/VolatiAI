import { privateKeyToAccount } from 'viem/accounts';
import fs from 'fs';
import crypto from 'crypto';
import { createSIWxMessage } from '@x402/extensions/sign-in-with-x';

const pk = fs.readFileSync(process.env.HOME + '/.volatiai/test-buyer.key', 'utf8').trim();
const account = privateKeyToAccount(pk.startsWith('0x') ? pk : '0x' + pk);

const ENDPOINT = 'https://volatiai-mcp.fourieranalys.workers.dev';
const RESOURCE_PATH = '/premium/mcp';

console.log('Buyer:', account.address);

// Step 1: Fetch SIWX challenge
const siwxExt = await (await fetch(`${ENDPOINT}/.well-known/sign-in-with-x`)).json();
const challenge = siwxExt['sign-in-with-x'];
const chain = challenge.supportedChains.find(c => c.chainId.startsWith('eip155:'));
console.log('Chain:', chain.chainId);

// Step 2: Build EIP-4361 message (SIWE format)
const domain = 'volatiai-mcp.fourieranalys.workers.dev';
const uri = `${ENDPOINT}${RESOURCE_PATH}`;
const nonce = crypto.randomBytes(16).toString('hex');
const issuedAt = new Date().toISOString();
const expirationTime = new Date(Date.now() + 5 * 60 * 1000).toISOString();
const chainIdNum = chain.chainId.split(':')[1];

const completeInfo = {
  ...challenge.info,
  chainId: chain.chainId,
  type: 'eip191',
  domain,
  uri,
  nonce,
  issuedAt,
  expirationTime,
};
const message = createSIWxMessage(completeInfo, account.address);

// Step 3: Sign
const signature = await account.signMessage({ message });
console.log('Signature:', signature.slice(0, 20) + '...' + signature.slice(-20));

// Step 4: Build payload
const payload = {
  domain,
  address: account.address,
  statement: challenge.info.statement,
  uri,
  version: '1',
  chainId: chain.chainId,
  type: 'eip191',
  nonce,
  issuedAt,
  expirationTime,
  signature,
};

// Step 5: Base64-encode
const header = Buffer.from(JSON.stringify(payload)).toString('base64');
console.log('Header length:', header.length);

// Step 6: Send SIGN-IN-WITH-X (no X-PAYMENT)
console.log('\nSending SIGN-IN-WITH-X header (no payment)...');
const res = await fetch(`${ENDPOINT}${RESOURCE_PATH}`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'SIGN-IN-WITH-X': header,
  },
  body: JSON.stringify({
    jsonrpc: '2.0',
    id: 1,
    method: 'tools/call',
    params: { name: 'get_block_number', arguments: {} },
  }),
});

const resText = await res.text();
console.log('\nHTTP', res.status);
try {
  const parsed = JSON.parse(resText);
  if (parsed.error) {
    console.log('❌ Error:', JSON.stringify(parsed.error));
  } else if (parsed.result) {
    console.log('✅ Got result:', JSON.stringify(parsed.result).slice(0, 200));
  }
} catch {
  console.log('Body:', resText.slice(0, 300));
}
