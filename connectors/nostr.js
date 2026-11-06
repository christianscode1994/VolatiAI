import {
  finalizeEvent,
  relayInit
} from "nostr-tools";

export async function publish(message) {

  const relay = relayInit(
    process.env.NOSTR_RELAY
  );

  await relay.connect();

  const event = finalizeEvent(
    {
      kind: 1,
      created_at: Math.floor(Date.now()/1000),
      tags: [],
      content: message
    },
    process.env.NOSTR_PRIVATE_KEY
  );

  relay.publish(event);

  return true;

}
