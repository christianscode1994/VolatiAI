// collectors/depth.js

import axios from "axios";
import { randomDelay } from "../postingPatterns.js";
import { collectorConfig } from "../config.js";

export async function collectDepth(asset) {
  try {
    await randomDelay(300, 1200);

    const symbol =
      `${asset.toUpperCase()}USDT`;

    const url =
      `https://api.binance.com/api/v3/depth?symbol=${symbol}&limit=100`;

    const { data } = await axios.get(
      url,
      {
        headers: {
          "User-Agent": "VolatiAI-Swarm",
          "Accept": "application/json"
        }
      }
    );

    if (
      !data ||
      !Array.isArray(data.bids) ||
      !Array.isArray(data.asks)
    ) {
      return {
        metric: "liquidity",
        timestamp:
          new Date().toISOString(),

        score: 0,

        asset,

        bids: 0,
        asks: 0,
        depthTotal: 0,
        imbalance: 0,

        label: "unavailable"
      };
    }

    const bids = data.bids.reduce(
      (acc, bid) =>
        acc + Number(bid[1] || 0),
      0
    );

    const asks = data.asks.reduce(
      (acc, ask) =>
        acc + Number(ask[1] || 0),
      0
    );

    const depthTotal =
      bids + asks;

    const imbalance =
      bids - asks;

    const threshold =
      Number(
        collectorConfig?.depth
          ?.threshold ?? 0
      );

    let score = 0;

    if (depthTotal > 0) {
      score =
        Math.abs(imbalance)
        / depthTotal;
    }

    score = Number(
      (1 - score).toFixed(4)
    );

    const label =
      Math.abs(imbalance) > threshold
        ? "imbalanced"
        : "balanced";

    const summary =
      Math.abs(imbalance) > threshold
        ? `${asset.toUpperCase()} depth imbalance detected (Δ=${imbalance.toFixed(2)})`
        : `${asset.toUpperCase()} depth normal`;

    return {
      metric: "liquidity",

      timestamp:
        new Date().toISOString(),

      score,

      label,

      summary,

      asset,

      bids: Number(
        bids.toFixed(4)
      ),

      asks: Number(
        asks.toFixed(4)
      ),

      depthTotal: Number(
        depthTotal.toFixed(4)
      ),

      imbalance: Number(
        imbalance.toFixed(4)
      ),

      threshold,

      data: {
        asset,
        bids,
        asks,
        depthTotal,
        imbalance,
        threshold
      },

      sources: {
        binance: true
      }
    };

  } catch (err) {

    console.error(
      `Depth collector error for ${asset}:`,
      err?.message || err
    );

    return {
      metric: "liquidity",

      timestamp:
        new Date().toISOString(),

      score: 0,

      asset,

      label: "error",

      error:
        err?.message ||
        "Unknown depth error",

      sources: {
        binance: true
      }
    };
  }
}
