// nostr.js — VolatiAI Nostr Bot
// Broadcasts intelligence snapshots to Nostr relays

import { relayInit, getEventHash, getSignature } from "nostr-tools";

export async function postToNostr(message) {
  const privkey = process.env.NOSTR_PRIVATE_KEY;
  const relays = (process.env.NOSTR_RELAYS || "")
    .split(",")
    .map(r => r.trim())
    .filter(r => r.length > 0);

  if (!privkey || relays.length === 0) return;

  // Create event
  const event = {
    kind: 1, // text note
    created_at: Math.floor(Date.now() / 1000),
    tags: [],
    content: message,
    pubkey: "" // filled automatically by nostr-tools
  };

  // Hash + sign
  event.id = getEventHash(event);
  event.sig = getSignature(event, privkey);

  // Publish to all relays
  for (const url of relays) {
    try {
      const relay = relayInit(url);
      await relay.connect();

      relay.on("connect", () => console.log(`Connected to ${url}`));
      relay.on("error", () => console.log(`Failed to connect to ${url}`));

      const pub = relay.publish(event);
      pub.on("ok", () => console.log(`Published to ${url}`));
      pub.on("failed", reason => console.log(`Failed to publish to ${url}: ${reason}`));
    } catch (err) {
      console.log(`Relay error (${url}): ${err}`);
    }
  }
}
