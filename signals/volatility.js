// signals/volatility.js
import axios from "axios";

const VOLATILITY_API = process.env.VOLATILITY_API_URL;

export async function volatilitySignal() {
  if (!VOLATILITY_API) {
    console.log("Volatility: no API configured.");
    return null;
  }

  try {
    const res = await axios.get(VOLATILITY_API);
    const data = res.data;

    // Expect a numeric volatility score in [0, 1]
    const volatility = Number(data.volatility ?? 0);
    const threshold = Number(process.env.VOLATILITY_THRESHOLD ?? 0.7);

    if (Number.isNaN(volatility) || volatility < threshold) {
      return null; // no signal triggered
    }

    // --- Severity Escalation ---
    let severity = "info";

    if (volatility >= threshold * 1.5) {
      severity = "critical";
    } else if (volatility >= threshold * 1.1) {
      severity = "warning";
    } else {
      severity = "info";
    }

    return {
      type: "volatility",
      severity,
      summary: `Volatility spike detected (score=${volatility.toFixed(2)}, threshold=${threshold}).`,
      data: { volatility, threshold },
    };
  } catch (err) {
    console.log("Volatility signal error:", err.message);
    return null;
  }
}
