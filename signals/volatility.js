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
      return null;
    }

    return {
      type: "volatility",
      severity: volatility > 0.9 ? "critical" : "high",
      summary: `Volatility spike detected (score=${volatility.toFixed(2)}).`,
      data: { volatility },
    };
  } catch (err) {
    console.log("Volatility signal error:", err.message);
    return null;
  }
}
