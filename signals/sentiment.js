// signals/sentiment.js
import axios from "axios";

const SENTIMENT_API = process.env.SENTIMENT_API_URL;

export async function sentimentSignal() {
  if (!SENTIMENT_API) {
    console.log("Sentiment: no API configured.");
    return null;
  }

  try {
    const res = await axios.get(SENTIMENT_API);
    const data = res.data;

    // Expect sentiment in [-1, 1]
    const sentiment = Number(data.sentiment ?? 0);
    const posThreshold = Number(process.env.SENTIMENT_POS_THRESHOLD ?? 0.6);
    const negThreshold = Number(process.env.SENTIMENT_NEG_THRESHOLD ?? -0.6);

    if (Number.isNaN(sentiment)) return null;

    // --- Positive sentiment ---
    if (sentiment > posThreshold) {
      let severity = "info";

      if (sentiment >= posThreshold * 1.4) {
        severity = "critical";
      } else if (sentiment >= posThreshold * 1.15) {
        severity = "warning";
      }

      return {
        type: "sentiment",
        severity,
        summary: `Strong positive sentiment detected (score=${sentiment.toFixed(2)}, threshold=${posThreshold}).`,
        data: { sentiment, threshold: posThreshold },
      };
    }

    // --- Negative sentiment ---
    if (sentiment < negThreshold) {
      let severity = "info";

      if (sentiment <= negThreshold * 1.4) {
        severity = "critical";
      } else if (sentiment <= negThreshold * 1.15) {
        severity = "warning";
      }

      return {
        type: "sentiment",
        severity,
        summary: `Strong negative sentiment detected (score=${sentiment.toFixed(2)}, threshold=${negThreshold}).`,
        data: { sentiment, threshold: negThreshold },
      };
    }

    return null;
  } catch (err) {
    console.log("Sentiment signal error:", err.message);
    return null;
  }
}
