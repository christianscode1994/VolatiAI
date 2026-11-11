# x402 CDP Settlement — What We Learned

## The protocol reality
- CDP's Base mainnet facilitator is **V1**, not V2, despite the challenge saying `x402Version: 2`
- V1 = `network: "base"` (plain), `x402Version: 1` everywhere, no `extensions` in `paymentPayload`
- V2 = `network: "eip155:8453"` (CAIP-2), `x402Version: 2`, flattened payload

## The build-time traps
- `@noble/secp256k1` v2 needs explicit `prehash: false` + `format: 'compact'`
- `@noble/hashes` v2 requires `.js` subpaths (`hmac.js`, `sha2.js`)
- `@coinbase/cdp-sdk/auth` needs `nodejs_compat` in wrangler.toml (top-level, not under [vars])

## The runtime traps
- **A 500 does NOT mean no payment.** Always check balances after errors.
- **Post-settlement code must never throw.** Once `settleResult.success === true`, wrap everything else in try/catch.
- **`const` inside `try` is not visible after the try block.** Use `var` for state shared with the success branch.

## The costs
- Real testnet doesn't exist for CDP Base mainnet — every test costs real USDC.
- ~0.4 USDC burned on the debugging journey.
- Once deployed, on-chain nonce is the true replay boundary; KV cache is an optimization.

## The commits
- `30f0dd0f` — V1 baseline (verified working)
- `e3505ef4` — hardening (tx-log + retry + replay + network-pin)
- `2512b20b` — hotfix: scope bug that 500'd after successful settle
- Pushed as `3503d141` on origin/main
