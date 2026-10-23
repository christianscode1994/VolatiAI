// pacing.js — rate-limit respect. No evasion.
//
// Extracted from the retired antiDetection.js (which also contained
// shouldSkipPost, deliberately dropping 5% of posts to look organic).
// That function is NOT restored. The two pacing functions are.

const PLATFORM_THROTTLE = {
  nostr:    1.0,
  mastodon: 0.9,
  bluesky:  0.8,
  telegram: 1.1,
  discord:  1.1,
  slack:    1.0,
};

const BASE_MIN_MS = 800;
const BASE_MAX_MS = 5000;

export function throttleFor(platform) {
  return PLATFORM_THROTTLE[platform] ?? 1.0;
}

export async function pause(platform) {
  const mult = throttleFor(platform);
  const min = BASE_MIN_MS * mult;
  const max = BASE_MAX_MS * mult;
  const delay = min + Math.random() * (max - min);
  await new Promise(r => setTimeout(r, delay));
}
