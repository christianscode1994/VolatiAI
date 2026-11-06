// antiDetection.js
import { randomDelay } from "./postingPatterns.js";

export async function antiDetectionPause() {
  await randomDelay(800, 5000);
}

export function shouldSkipPost() {
  return Math.random() < 0.05; // 5% random skip
}

export function throttlePlatform(platform) {
  const base = {
    nostr: 1.0,
    mastodon: 0.9,
    bluesky: 0.8,
    telegram: 1.1,
    discord: 1.1,
    slack: 1.0
  }[platform] || 1.0;

  return base * (0.8 + Math.random() * 0.4);
}
