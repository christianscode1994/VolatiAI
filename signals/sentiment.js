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

    if (sentiment > posThreshold) {
      return {
        type: "sentiment",
        severity: "positive",
        summary: `Strong positive sentiment detected (score=${sentiment.toFixed(2)}).`,
        data: { sentiment },
      };
    }

    if (sentiment < negThreshold) {
      return {
        type: "sentiment",
        severity: "negative",
        summary: `Strong negative sentiment detected (score=${sentiment.toFixed(2)}).`,
        data: { sentiment },
      };
    }

    return null;
  } catch (err) {
    console.log("Sentiment signal error:", err.message);
    return null;
  }
}
