import { privateKeyToAccount } from 'viem/accounts';
import { readFileSync } from 'fs';
const pk = readFileSync(process.env.HOME + '/.volatiai/x402scan-signer.key', 'utf8').trim();
const wallet = privateKeyToAccount(pk);
const signature = await wallet.signMessage({ message: `minia2a publish: ${wallet.address}` });
const res = await fetch('https://minia2a.uk/api/v1/publish-service', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    name: 'VolatiAI Signed Signals',
    description: 'Signed, verifiable signals from 421 sectors. Every response carries an Ed25519 attestation verifiable offline against a published public key. No accounts, no subscriptions, no phone-home.',
    endpoint: 'https://volatiai-mcp.fourieranalys.workers.dev/premium/mcp',
    price_cents: 10,
    category: 'data',
    wallet: wallet.address,
    signature
  })
});
console.log(await res.text());
