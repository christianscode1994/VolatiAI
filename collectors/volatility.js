// collectors/volatility.js

import axios from "axios";
import { randomDelay } from "../postingPatterns.js";
import { collectorConfig } from "../config.js";

/**
 * Compute standard deviation.
 */
function standardDeviation(values) {
  if (!values.length) {
    return 0;
  }

  const avg =
    values.reduce((a, b) => a + b, 0) /
    values.length;

  const variance =
    values.reduce(
      (sum, value) =>
        sum + Math.pow(value - avg, 2),
      0
    ) / values.length;

  return Math.sqrt(variance);
}

export async function collectVolatility(asset) {
  try {

    await randomDelay(300, 1200);

    const url =
      `https://api.coingecko.com/api/v3/coins/${asset}/market_chart?vs_currency=usd&days=1`;

    const { data } =
      await axios.get(url);

    if (
      !data ||
      !Array.isArray(data.prices) ||
      data.prices.length < 2
    ) {
      console.log(
        `Volatility collector: insufficient data for ${asset}`
      );

      return {
        metric: "volatility",
        timestamp: new Date().toISOString(),
        score: 0,
        volatility: 0,
        asset,
        count: 0,
      };
    }

    const prices = data.prices.map(
      point => point[1]
    );

    const returns = [];

    for (let i = 1; i < prices.length; i++) {

      const prev = prices[i - 1];
      const curr = prices[i];

      if (prev <= 0) {
        continue;
      }

      returns.push(
        ((curr - prev) / prev) * 100
      );
    }

    const volatility =
      standardDeviation(returns);

    const threshold =
      collectorConfig?.volatility?.threshold ??
      1.0;

    const score = Number(
      volatility.toFixed(4)
    );

    const label =
      score > threshold
        ? "high"
        : "normal";

    const summary =
      score > threshold
        ? `${asset.toUpperCase()} volatility spike detected`
        : `${asset.toUpperCase()} volatility normal`;

    return {
      metric: "volatility",

      timestamp:
        new Date().toISOString(),

      score,

      volatility: score,

      label,

      summary,

      asset,

      count: returns.length,

      threshold,

      data: {
        asset,
        sampleCount:
          returns.length,
        volatility: score,
      },

      sources: {
        coingecko: true,
      },
    };

  } catch (err) {

    console.error(
      `Volatility collector error for ${asset}:`,
      err?.message || err
    );

    return {
      metric: "volatility",

      timestamp:
        new Date().toISOString(),

      score: 0,

      volatility: 0,

      asset,

      count: 0,

      error:
        err?.message ||
        "Unknown volatility error",

      sources: {
        coingecko: true,
      },
    };
  }
}
