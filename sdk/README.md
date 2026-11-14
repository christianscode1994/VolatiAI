# @volatiai/primitives

Stateless primitives for autonomous agents. The caller holds all state.

## Usage

  import { VolatiAI } from "@volatiai/primitives";
  const v = new VolatiAI();

  // Delta loop — caller holds the cursor
  await v.watch({
    onChanged: async (batch) => {
      const verdict = await v.evaluate({ assets: batch.changed });
      if (verdict.alert) console.log("ALERT:", verdict.matched);
    }
  });

  // Deterministic rank
  const ranked = await v.rank({ mode: "risk_adjusted" });

  // Registry — every formula and its golden vector
  const reg = await v.formulas();

## v0.1 limitations

Payment handling is not implemented. Callers on paid endpoints must handle
x402 signing themselves. See PROTOCOL.md for the wire format.
