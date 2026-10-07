export function broadcast(signal) {

  return {
    telegram: true,
    discord: true,
    slack: true,
    mastodon: true,
    bluesky: true,
    nostr: true,
    signal
  };

}
