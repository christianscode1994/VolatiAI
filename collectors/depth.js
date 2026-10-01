// collectors/depth.js
import axios from "axios";
import { randomDelay } from "../postingPatterns.js";
import { collectorConfig } from "../config.js";

// --------------------------------------
//  DEPTH COLLECTOR (CONFIG‑DRIVEN)
// --------------------------------------
//
// Measures bid/ask depth + imbalance from Binance.
// Adds anti‑detection jitter + threshold logic.
// Fully normalized for signalEngine.
//

export async function collectDepth(asset) {
  try {
    // Anti‑detection jitter before API call
    await randomDelay(300, 1200);

    const symbol = `${asset.toUpperCase()}USDT`;
    const url = `https://api.binance.com/api/v3/depth?symbol=${symbol}&limit=100`;

    const { data } = await axios.get(url, {
      headers: {
        "User-Agent": "VolatiAI-Swarm",
        "Accept": "application/json"
      }
    });

    if (!data || !data.bids || !data.asks) {
      console.log(`Depth collector: insufficient data for ${asset}`);
      return null;
    }

    const bids = data.bids.reduce((acc, b) => acc + parseFloat(b[1]), 0);
    const asks = data.asks.reduce((acc, a) => acc + parseFloat(a[1]), 0);

    const depthTotal = bids + asks;
    const imbalance = bids - asks;

    const threshold = Number(collectorConfig.depth.threshold ?? 0);

    const summary =
      Math.abs(imbalance) > threshold
        ? `${asset.toUpperCase()} depth imbalance detected (Δ=${imbalance.toFixed(2)})`
        : `${asset.toUpperCase()} depth normal`;

    return {
      type: "depth",
      summary,
      data: {
        asset,
        bids,
        asks,
        depthTotal,
        imbalance,
        threshold
      },
      volatility: 0,
      sentiment: 0,
      devActivity: 0,
      depth: depthTotal
    };
  } catch (err) {
    console.log(`Depth collector error for ${asset}:`, err.message);
    return null;
  }
}
