// signals/router.js

export function routeSignals(signals) {
  const routes = [];

  for (const sig of signals) {
    const platforms = decidePlatforms(sig);
    routes.push({ signal: sig, platforms });
  }

  return routes;
}

// Adaptive routing based on severity + type
function decidePlatforms(sig) {
  const { type, severity } = sig;

  // --- Base routing by severity ---
  let platforms;

  switch (severity) {
    case "critical":
      platforms = ["slack", "telegram", "discord", "bluesky", "mastodon", "nostr"];
      break;

    case "warning":
      platforms = ["telegram", "discord", "mastodon", "nostr"];
      break;

    case "info":
    default:
      platforms = ["nostr"]; // low-noise archival channel
      break;
  }

  // --- Fine-tuning by signal type ---
  switch (type) {
    case "volatility":
      // volatility is trading-heavy → Telegram/Discord/Nostr
      if (severity === "critical") {
        platforms = ["telegram", "discord", "nostr", "slack"];
      } else if (severity === "warning") {
        platforms = ["telegram", "discord", "nostr"];
      }
      break;

    case "sentiment":
      // sentiment is social → Bluesky/Mastodon emphasized
      if (severity === "critical") {
        platforms = ["bluesky", "mastodon", "telegram", "discord", "nostr"];
      } else if (severity === "warning") {
        platforms = ["bluesky", "mastodon", "nostr"];
      }
      break;

    case "devActivity":
      // dev activity is infra/nerd → Discord/Mastodon/Nostr
      if (severity === "critical") {
        platforms = ["discord", "mastodon", "nostr"];
      } else if (severity === "warning") {
        platforms = ["discord", "nostr"];
      }
      break;

    case "depth":
      // order book depth → Telegram/Discord/Nostr
      if (severity === "critical") {
        platforms = ["telegram", "discord", "nostr"];
      } else if (severity === "warning") {
        platforms = ["telegram", "nostr"];
      }
      break;

    default:
      // unknown types: keep severity defaults
      break;
  }

  return platforms;
}
