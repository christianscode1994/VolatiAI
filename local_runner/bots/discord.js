// discord.js — VolatiAI Discord Bot

export async function postToDiscord(message) {
  const webhook = process.env.DISCORD_WEBHOOK_URL;

  if (!webhook) {
    return;
  }

  const response = await fetch(webhook, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      content: message
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Failed to post to Discord: ${response.status} ${errorText}`
    );
  }

  console.log("Posted to Discord successfully.");
}
