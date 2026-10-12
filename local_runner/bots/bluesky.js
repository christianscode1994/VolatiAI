// bluesky.js — VolatiAI Bluesky Bot

export async function postToBluesky(message) {
  const handle = process.env.BLUESKY_HANDLE;
  const password = process.env.BLUESKY_PASSWORD;

  if (!handle || !password) {
    console.warn("Bluesky credentials not configured.");
    return;
  }

  // Create session
  const sessionResponse = await fetch(
    "https://bsky.social/xrpc/com.atproto.server.createSession",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        identifier: handle,
        password,
      }),
    }
  );

  if (!sessionResponse.ok) {
    throw new Error(
      `Failed to create Bluesky session: ${sessionResponse.status}`
    );
  }

  const session = await sessionResponse.json();

  // Create post
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
          text: message,
          createdAt: new Date().toISOString(),
        },
      }),
    }
  );

  if (!postResponse.ok) {
    const errorText = await postResponse.text();
    throw new Error(
      `Failed to create Bluesky post: ${postResponse.status} ${errorText}`
    );
  }

  console.log("Posted to Bluesky successfully.");
}
