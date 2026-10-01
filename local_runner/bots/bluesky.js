// bluesky.js — VolatiAI Bluesky Bot

import fetch from "node-fetch";

export async function postToBluesky(message) {
  const handle = process.env.BLUESKY_HANDLE;
  const password = process.env.BLUESKY_PASSWORD;
  if (!handle || !password) return;

  const session = await fetch("https://bsky.social/xrpc/com.atproto.server.createSession", {
    method: "POST",
    body: JSON.stringify({ identifier: handle, password })
  }).then(r => r.json());

  await fetch("https://bsky.social/xrpc/com.atproto.repo.createRecord", {
    method: "POST",
    headers: { Authorization: `Bearer ${session.accessJwt}` },
    body: JSON.stringify({
      repo: session.did,
      collection: "app.bsky.feed.post",
      record: {
        text: message,
        createdAt: new Date().toISOString()
      }
    })
  });
}
