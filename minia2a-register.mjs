import { privateKeyToAccount } from 'viem/accounts';
import { readFileSync } from 'fs';
const pk = readFileSync(process.env.HOME + '/.volatiai/x402scan-signer.key', 'utf8').trim();
const wallet = privateKeyToAccount(pk);
const signature = await wallet.signMessage({ message: `minia2a register: ${wallet.address}` });
const res = await fetch('https://minia2a.uk/api/v1/register-simple', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ name: 'VolatiAI', wallet: wallet.address, signature })
});
console.log(await res.text());
