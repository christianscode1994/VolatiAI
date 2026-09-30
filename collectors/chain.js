// collectors/chain.js
import axios from "axios";

export async function collectChainEvents(address) {
  try {
    const url = `https://api.etherscan.io/api?module=account&action=txlist&address=${address}&sort=desc`;
    const { data } = await axios.get(url);

    const txs = data.result || [];
    const recent = txs.slice(0, 5);

    const anomalies = recent.filter(tx => tx.isError === "1");

    return {
      type: "chain",
      summary: anomalies.length > 0
        ? `On-chain anomaly detected for ${address}`
        : `Chain activity normal for ${address}`,
      data: { recent, anomalies },
      volatility: 0,
      sentiment: 0,
      devActivity: 0,
      depth: 0
    };
  } catch (err) {
    console.log("Chain collector error:", err.message);
    return null;
  }
}
