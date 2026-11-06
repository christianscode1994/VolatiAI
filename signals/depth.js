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
      return null; // no signal triggered
    }

    // --- Severity Escalation ---
    let severity = "info";

    if (imbalance >= threshold * 1.4) {
      severity = "critical";
    } else if (imbalance >= threshold * 1.15) {
      severity = "warning";
    } else {
      severity = "info";
    }

    return {
      type: "depth",
      severity,
      summary: `Order book imbalance detected (score=${imbalance.toFixed(2)}, threshold=${threshold}).`,
      data: { imbalance, threshold },
    };
  } catch (err) {
    console.log("Depth signal error:", err.message);
    return null;
  }
}
