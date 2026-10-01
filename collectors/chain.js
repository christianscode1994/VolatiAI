// collectors/chain.js
import axios from "axios";
import { randomDelay } from "../postingPatterns.js";
import { collectorConfig } from "../config.js";

// --------------------------------------
//  CHAIN EVENT COLLECTOR (CONFIG‑DRIVEN)
// --------------------------------------
//
// Fetches recent transactions + detects anomalies.
// Adds anti‑detection jitter + threshold logic.
// Fully normalized for signalEngine.
//

export async function collectChainEvents(address) {
  try {
    // Anti‑detection jitter before API call
    await randomDelay(300, 1200);

    const apiKey = collectorConfig.chain.api_key || "";
    const url =
      `https://api.etherscan.io/api?module=account&action=txlist` +
      `&address=${address}&sort=desc` +
      (apiKey ? `&apikey=${apiKey}` : "");

    const { data } = await axios.get(url, {
      headers: {
        "User-Agent": "VolatiAI-Swarm",
        "Accept": "application/json"
      }
    });

    const txs = Array.isArray(data?.result) ? data.result : [];
    const recent = txs.slice(0, collectorConfig.chain.recent_count || 5);

    // Detect anomalies: failed tx, high gas, unusual value
    const anomalies = recent.filter(tx => {
      const failed = tx.isError === "1";
      const highGas = Number(tx.gasUsed) > (collectorConfig.chain.gas_threshold || 200000);
      const bigValue = Number(tx.value) > (collectorConfig.chain.value_threshold || 1e18); // 1 ETH default
      return failed || highGas || bigValue;
    });

    const summary =
      anomalies.length > 0
        ? `On-chain anomaly detected for ${address} (${anomalies.length} events)`
        : `Chain activity normal for ${address}`;

    return {
      type: "chain",
      summary,
      data: {
        address,
        recent,
        anomalies,
        thresholds: {
          gas: collectorConfig.chain.gas_threshold,
          value: collectorConfig.chain.value_threshold
        }
      },
      volatility: 0,
      sentiment: 0,
      devActivity: 0,
      depth: 0
    };
  } catch (err) {
    console.log(`Chain collector error for ${address}:`, err.message);
    return null;
  }
}
