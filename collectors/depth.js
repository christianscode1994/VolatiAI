// collectors/depth.js
import axios from "axios";

export async function collectDepth(asset) {
  try {
    const url = `https://api.binance.com/api/v3/depth?symbol=${asset.toUpperCase()}USDT&limit=100`;
    const { data } = await axios.get(url);

    const bids = data.bids.reduce((acc, b) => acc + parseFloat(b[1]), 0);
    const asks = data.asks.reduce((acc, a) => acc + parseFloat(a[1]), 0);
    const depth = bids + asks;

    return {
      type: "depth",
      summary: `${asset.toUpperCase()} depth imbalance detected`,
      data: { bids, asks },
      volatility: 0,
      sentiment: 0,
      devActivity: 0,
      depth
    };
  } catch (err) {
    console.log("Depth collector error:", err.message);
    return null;
  }
}
