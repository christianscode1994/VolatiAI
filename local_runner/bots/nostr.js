// nostr.js — VolatiAI Nostr Bot

import { finalizeEvent } from "nostr-tools";
import { Relay } from "nostr-tools";

export async function postToNostr(message) {
  const privkey = process.env.NOSTR_PRIVATE_KEY;

  const relays = (process.env.NOSTR_RELAYS || "")
    .split(",")
    .map(r => r.trim())
    .filter(Boolean);

  if (!privkey || relays.length === 0) {
    return;
  }

  // Private key should be a hex string
  const privateKeyBytes = Uint8Array.from(
    privkey.match(/.{1,2}/g).map(byte => parseInt(byte, 16))
  );

  const eventTemplate = {
    kind: 1,
    created_at: Math.floor(Date.now() / 1000),
    tags: [],
    content: message,
  };

  const event = finalizeEvent(eventTemplate, privateKeyBytes);

  for (const url of relays) {
    try {
      const relay = await Relay.connect(url);

      console.log(`Connected to ${url}`);

      await relay.publish(event);

      console.log(`Published to ${url}`);

      relay.close();
    } catch (err) {
      console.
