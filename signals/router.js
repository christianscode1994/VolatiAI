// signals/router.js

export function routeSignals(signals) {
  const routes = [];

  for (const sig of signals) {
    if (sig.type === "volatility") {
      routes.push({
        signal: sig,
        platforms: ["telegram", "discord", "nostr"],
      });
    } else if (sig.type === "sentiment") {
      routes.push({
        signal: sig,
        platforms: ["mastodon", "bluesky", "nostr"],
      });
    } else if (sig.type === "devActivity") {
      routes.push({
        signal: sig,
        platforms: ["nostr", "slack"],
      });
    } else if (sig.type === "depth") {
      routes.push({
        signal: sig,
        platforms: ["telegram", "discord"],
      });
    }
  }

  return routes;
}
