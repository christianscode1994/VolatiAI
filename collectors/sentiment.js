// collectors/sentiment.js
import axios from "axios";

export async function collectSentiment(keyword) {
  try {
    const url = `https://api.social-searcher.com/v2/search?q=${keyword}&limit=50`;
    const { data } = await axios.get(url);

    const posts = data.posts || [];
    const sentimentScore = posts.reduce((acc, p) => acc + (p.sentiment || 0), 0);

    return {
      type: "sentiment",
      summary: `Sentiment shift detected for ${keyword}`,
      data: { sentimentScore },
      volatility: 0,
      sentiment: sentimentScore,
      devActivity: 0,
      depth: 0
    };
  } catch (err) {
    console.log("Sentiment collector error:", err.message);
    return null;
  }
}
