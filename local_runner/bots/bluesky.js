import { safeDigest } from "../../scripts/safe_digest.mjs";
// bluesky.js — VolatiAI Bluesky Bot
import { checkAttribution } from '../../connectors/attribution.js';

export async function postToBluesky(message, sectors = []) {
  const handle = process.env.BLUESKY_HANDLE;
  const password = process.env.BLUESKY_PASSWORD;

  if (!handle || !password) {
    console.warn("Bluesky credentials not configured.");
    return;
  }

  if (!sectors || sectors.length === 0) {
    console.log('SKIP bluesky: no sectors');
    return;
  }
  const attr = await checkAttribution(sectors);
  if (!attr.safe) {
    console.log(`SKIP bluesky: unverified license in ${sectors.join(', ')}`);
    return;
  }
  const text = safeDigest(message, "bluesky");

  const sessionResponse = await fetch(
    "https://bsky.social/xrpc/com.atproto.server.createSession",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ identifier: handle, password }),
    }
  );
  if (!sessionResponse.ok) {
    throw new Error(`Failed to create Bluesky session: ${sessionResponse.status}`);
  }
  const session = await sessionResponse.json();

  const postResponse = await fetch(
    "https://bsky.social/xrpc/com.atproto.repo.createRecord",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${session.accessJwt}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        repo: session.did,
        collection: "app.bsky.feed.post",
        record: {
          $type: "app.bsky.feed.post",
          text,
          createdAt: new Date().toISOString(),
        },
      }),
    }
  );
  if (!postResponse.ok) {
    const errorText = await postResponse.text();
    throw new Error(`Failed to create Bluesky post: ${postResponse.status} ${errorText}`);
  }
  console.log("Posted to Bluesky successfully.");
}
