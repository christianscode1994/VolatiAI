// collectors/sentiment.js
import axios from "axios";
import { randomDelay } from "../postingPatterns.js";
import { collectorConfig } from "../config.js";

// --------------------------------------
//  SENTIMENT COLLECTOR (CONFIG‑DRIVEN)
// --------------------------------------
//
// Uses CryptoPanic trending + news sentiment as a proxy.
// This avoids dead APIs and gives real crypto sentiment.
//

export async function collectSentiment(keyword) {
  try {
    // Anti‑detection jitter before API call
    await randomDelay(300, 1200);

    const apiKey = collectorConfig.sentiment.api_key || "demo";

    const trendingUrl = `https://cryptopanic.com/api/v1/posts/?auth_token=${apiKey}&filter=trending&currencies=${keyword}`;
    const newsUrl = `https://cryptopanic.com/api/v1/posts/?auth_token=${apiKey}&filter=news&currencies=${keyword}`;

    const [trendingRes, newsRes] = await Promise.all([
      axios.get(trendingUrl),
      axios.get(newsUrl)
    ]);

    const trending = trendingRes.data?.results || [];
    const news = newsRes.data?.results || [];

    // Basic sentiment scoring heuristic
    const trendingScore = trending.length ? 1 : 0;
    const newsScore = news.length ? 1 : 0;

    const sentimentScore = trendingScore + newsScore;

    const summary =
      sentimentScore > 1
        ? `Sentiment spike detected for ${keyword}`
        : `Sentiment normal for ${keyword}`;

    return {
      type: "sentiment",
      summary,
      data: {
        keyword,
        trendingCount: trending.length,
        newsCount: news.length,
        sentimentScore
      },
      volatility: 0,
      sentiment: sentimentScore,
      devActivity: 0,
      depth: 0
    };
  } catch (err) {
    console.log(`Sentiment collector error for ${keyword}:`, err.message);
    return null;
  }
}
