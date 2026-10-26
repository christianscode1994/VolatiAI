
## signLatest orphaned "pypi-daily-requests" property — WONTFIX

signLatest() in sector-slow returns a signature object that includes an
extra "pypi-daily-requests" property (dead code from an early refactor).

Impact: cosmetic only. /latest returns a valid signature. Nothing in the
codebase verifies /latest signatures — the only verify() calls are in
node_modules (unrelated noble-curves library).

Fix would require 100-line inspection + brace-tracing + signature comparison
for zero functional benefit. Deferred indefinitely.

## War-Tracker events went x402-paywalled (2026-10)

The `/api/v1/events` endpoint documented as "free, no API key" now returns
402 with `{"x402Version":2,"error":"PAYMENT-SIGNATURE header is required"}`.
The `/api/v1/regions` endpoint remains free (static taxonomy, not useful).

This is the same pattern as CoinPaprika's 402 earlier this session — vendor
moved from free to paid. Not a technical failure; a policy change.

Status: DO NOT retry unless willing to pay via x402.
