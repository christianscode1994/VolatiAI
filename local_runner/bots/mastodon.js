// mastodon.js — VolatiAI Mastodon Bot

export async function postToMastodon(message) {
  const token = process.env.MASTODON_TOKEN;
  const instance = process.env.MASTODON_INSTANCE;

  if (!token || !instance) {
    return;
  }

  const response = await fetch(`${instance}/api/v1/statuses`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`
    },
    body: new URLSearchParams({
      status: message
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Failed to post to Mastodon: ${response.status} ${errorText}`
    );
  }

  console.log("Posted to Mastodon successfully.");
}
