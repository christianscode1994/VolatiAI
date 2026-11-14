# VolatiAI

Stateless primitives for autonomous agents.

> **Verify any implementation:** `npx @volatiai/conformance <url>`
> **Install the primitives:** `npm install @volatiai/primitives`
> **Formula registry:** `GET https://volatiai-mcp.fourieranalys.workers.dev/premium/formulas`

Three primitives, caller holds all state:
- `signals_delta` — cursor-parameterized delta feed
- `signals_evaluate` — pure-function threshold evaluator
- `signals_rank` — deterministic ranking with published formula

See `PROTOCOL.md` for the wire format.

## Verify

    npx @volatiai/conformance https://volatiai-mcp.fourieranalys.workers.dev

Runs every golden vector from the registry against the live endpoint.
