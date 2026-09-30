// workflows/signal_broadcast.js

import { volatilitySignal } from "../signals/volatility.js";
import { sentimentSignal } from "../signals/sentiment.js";
import { devActivitySignal } from "../signals/devActivity.js";
import { depthSignal } from "../signals/depth.js";
import { routeSignals } from "../signals/router.js";
import { broadcast } from "../broadcaster/broadcaster.js";

async function main() {
  const signals = [];

  const v = await volatilitySignal();
  if (v) signals.push(v);

  const s = await sentimentSignal();
  if (s) signals.push(s);

  const d = await devActivitySignal();
  if (d) signals.push(d);

  const liq = await depthSignal();
  if (liq) signals.push(liq);

  if (signals.length === 0) {
    console.log("No signals triggered. No broadcast.");
    return;
  }

  const routes = routeSignals(signals);

  for (const route of routes) {
    const sig = route.signal;
    const message = `[${sig.type.toUpperCase()} / ${sig.severity}] ${sig.summary}`;
    await broadcast(message, route.platforms);
  }
}

main();
