// collectors/chain.js

import axios from "axios";
import { randomDelay } from "../postingPatterns.js";
import { collectorConfig } from "../config.js";

export async function collectChainEvents(address) {
  try {
    await randomDelay(300, 1200);

    const apiKey =
      collectorConfig?.chain?.api_key || "";

    const url =
      `https://api.etherscan.io/api?module=account&action=txlist&address=${address}&sort=desc` +
      (apiKey ? `&apikey=${apiKey}` : "");

    const { data } = await axios.get(
      url,
      {
        headers: {
          "User-Agent": "VolatiAI-Swarm",
          "Accept": "application/json"
        }
      }
    );

    const transactions =
      Array.isArray(data?.result)
        ? data.result
        : [];

    const recentCount =
      Number(
        collectorConfig?.chain?.recent_count
        ?? 5
      );

    const recent =
      transactions.slice(
        0,
        recentCount
      );

    const gasThreshold =
      Number(
        collectorConfig?.chain
          ?.gas_threshold
        ?? 200000
      );

    const valueThreshold =
      Number(
        collectorConfig?.chain
          ?.value_threshold
        ?? 1e18
      );

    const anomalies =
      recent.filter(tx => {

        const failed =
          tx?.isError === "1";

        const highGas =
          Number(tx?.gasUsed || 0)
          > gasThreshold;

        const largeValue =
          Number(tx?.value || 0)
          > valueThreshold;

        return (
          failed ||
          highGas ||
          largeValue
        );
      });

    const score =
      anomalies.length;

    const label =
      anomalies.length > 0
        ? "anomaly"
        : "normal";

    const summary =
      anomalies.length > 0
        ? `On-chain anomaly detected for ${address} (${anomalies.length} events)`
        : `Chain activity normal for ${address}`;

    return {
      metric: "onchain",

      timestamp:
        new Date().toISOString(),

      score,

      label,

      summary,

      address,

      recentCount:
        recent.length,

      anomalyCount:
        anomalies.length,

      data: {
        address,
        recent,
        anomalies,

        thresholds: {
          gas:
            gasThreshold,

          value:
            valueThreshold
        }
      },

      sources: {
        etherscan: true
      }
    };

  } catch (err) {

    console.error(
      `Chain collector error for ${address}:`,
      err?.message || err
    );

    return {
      metric: "onchain",

      timestamp:
        new Date().toISOString(),

      score: 0,

      label: "error",

      address,

      recentCount: 0,

      anomalyCount: 0,

      error:
        err?.message ||
        "Unknown chain error",

      sources: {
        etherscan: true
      }
    };
  }
}
