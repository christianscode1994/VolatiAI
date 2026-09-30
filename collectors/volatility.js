// collectors/volatility.js
import axios from "axios";

export async function collectVolatility(asset) {
  try {
    const url = `https://api.coingecko.com/api/v3/coins/${asset}/market_chart?vs_currency=usd&days=1`;
    const { data } = await axios.get(url);

    const prices = data.prices.map(p => p[1]);
    const diffs = prices.slice(1).map((p, i) => Math.abs(p - prices[i]));
    const volatility = diffs.reduce((a, b) => a + b, 0) / diffs.length;

    return {
      type: "volatility",
      summary: `${asset.toUpperCase()} volatility spike detected`,
      data: { volatility },
      volatility,
      sentiment: 0,
      devActivity: 0,
      depth: 0
    };
  } catch (err) {
    console.log("Volatility collector error:", err.message);
    return null;
  }
}
