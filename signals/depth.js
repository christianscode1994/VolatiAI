// signals/depth.js
import axios from "axios";

const DEPTH_API = process.env.DEPTH_API_URL;

export async function depthSignal() {
  if (!DEPTH_API) {
    console.log("Depth: no API configured.");
    return null;
  }

  try {
    const res = await axios.get(DEPTH_API);
    const data = res.data;

    // Expect imbalance in [0, 1]
    const imbalance = Number(data.imbalance ?? 0);
    const threshold = Number(process.env.DEPTH_THRESHOLD ?? 0.6);

    if (Number.isNaN(imbalance) || imbalance < threshold) {
      return null;
    }

    return {
      type: "depth",
      severity: imbalance > 0.85 ? "critical" : "high",
      summary: `Order book imbalance detected (score=${imbalance.toFixed(2)}).`,
      data: { imbalance },
    };
  } catch (err) {
    console.log("Depth signal error:", err.message);
    return null;
  }
}
