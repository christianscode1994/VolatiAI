// collectors/sentiment.js

import axios from "axios";
import { randomDelay } from "../postingPatterns.js";
import { collectorConfig } from "../config.js";

export async function collectSentiment(keyword) {
  try {
    // Anti-bot jitter
    await randomDelay(300, 1200);

    const apiKey =
      collectorConfig?.sentiment?.api_key ||
      "demo";

    const trendingUrl =
      `https://cryptopanic.com/api/v1/posts/?auth_token=${apiKey}&filter=trending&currencies=${keyword}`;

    const newsUrl =
      `https://cryptopanic.com/api/v1/posts/?auth_token=${apiKey}&filter=news&currencies=${keyword}`;

    const [trendingRes, newsRes] = await Promise.all([
      axios.get(trendingUrl),
      axios.get(newsUrl),
    ]);

    const trending =
      trendingRes?.data?.results || [];

    const news =
      newsRes?.data?.results || [];

    const trendingScore =
      trending.length > 0 ? 1 : 0;

    const newsScore =
      news.length > 0 ? 1 : 0;

    const score =
      trendingScore + newsScore;

    const count =
      trending.length + news.length;

    const avg =
      count > 0
        ? score / count
        : 0;

    return {
      metric: "sentiment",

      timestamp: new Date().toISOString(),

      score: Number(score),

      avg: Number(avg.toFixed(4)),

      count,

      label:
        avg > 0.5
          ? "bullish"
          : avg < -0.5
            ? "bearish"
            : "neutral",

      summary:
        score > 1
          ? `Sentiment spike detected for ${keyword}`
          : `Sentiment normal for ${keyword}`,

      data: {
        keyword,

        trendingCount:
          trending.length,

        newsCount:
          news.length,
      },

      sources: {
        cryptopanic: true,
      },
    };

  } catch (err) {

    console.error(
      `Sentiment collector error for ${keyword}:`,
      err?.message || err
    );

    return {
      metric: "sentiment",

      timestamp: new Date().toISOString(),

      score: 0,

      avg: 0,

      count: 0,

      label: "neutral",

      error:
        err?.message ||
        "Unknown sentiment error",

      data: {
        keyword,
        trendingCount: 0,
        newsCount: 0,
      },

      sources: {
        cryptopanic: true,
      },
    };
  }
}
