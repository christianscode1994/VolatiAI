import fetch from "node-fetch";

export async function postToDiscord(message) {
  const webhook = process.env.DISCORD_WEBHOOK_URL;
  if (!webhook) return;

  await fetch(webhook, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content: message })
  });
}
