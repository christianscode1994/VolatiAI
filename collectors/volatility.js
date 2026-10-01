// collectors/volatility.js
import axios from "axios";
import { randomDelay } from "../postingPatterns.js";
import { collectorConfig } from "../config.js";

// --------------------------------------
//  VOLATILITY COLLECTOR (CONFIG‑DRIVEN)
// --------------------------------------

export async function collectVolatility(asset) {
  try {
    // Anti‑detection jitter before API call
    await randomDelay(300, 1200);

    const url = `https://api.coingecko.com/api/v3/coins/${asset}/market_chart?vs_currency=usd&days=1`;
    const { data } = await axios.get(url);

    if (!data || !data.prices || data.prices.length < 2) {
      console.log(`Volatility collector: insufficient data for ${asset}`);
      return null;
    }

    const prices = data.prices.map(p => p[1]);
    const diffs = prices.slice(1).map((p, i) => Math.abs(p - prices[i]));
    const volatility = diffs.reduce((a, b) => a + b, 0) / diffs.length;

    const threshold = collectorConfig.volatility.threshold || 0;

    const summary =
      volatility > threshold
        ? `${asset.toUpperCase()} volatility spike detected`
        : `${asset.toUpperCase()} volatility normal`;

    return {
      type: "volatility",
      summary,
      data: {
        asset,
        volatility,
        threshold
      },
      volatility,
      sentiment: 0,
      devActivity: 0,
      depth: 0
    };
  } catch (err) {
    console.log(`Volatility collector error for ${asset}:`, err.message);
    return null;
  }
}
