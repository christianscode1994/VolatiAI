// nostr.js — VolatiAI Nostr Bot
import { finalizeEvent, Relay } from "nostr-tools";
import { checkAttribution } from '../../connectors/attribution.js';

export async function postToNostr(message, sectors = []) {
  const privkey = process.env.NOSTR_PRIVATE_KEY;
  const relays = (process.env.NOSTR_RELAYS || "")
    .split(",")
    .map(r => r.trim())
    .filter(Boolean);

  if (!privkey || relays.length === 0) return;

  if (!sectors || sectors.length === 0) {
    console.log('SKIP nostr: no sectors');
    return;
  }
  const attr = await checkAttribution(sectors);
  if (!attr.safe) {
    console.log(`SKIP nostr: unverified license in ${sectors.join(', ')}`);
    return;
  }
  const text = attr.footer ? `${message}\n\n${attr.footer}` : message;

  const privateKeyBytes = Uint8Array.from(
    privkey.match(/.{1,2}/g).map(byte => parseInt(byte, 16))
  );
  const eventTemplate = {
    kind: 1,
    created_at: Math.floor(Date.now() / 1000),
    tags: [],
    content: text,
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
      console.error(`Relay error (${url}):`, err);
    }
  }
}
