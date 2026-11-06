import { safeDigest } from "../../scripts/safe_digest.mjs";
// discord.js — VolatiAI Discord Bot
import { checkAttribution } from '../../connectors/attribution.js';

export async function postToDiscord(message, sectors = []) {
  const webhook = process.env.DISCORD_WEBHOOK_URL;
  if (!webhook) return;

  if (!sectors || sectors.length === 0) {
    console.log('SKIP discord: no sectors');
    return;
  }
  const attr = await checkAttribution(sectors);
  if (!attr.safe) {
    console.log(`SKIP discord: unverified license in ${sectors.join(', ')}`);
    return;
  }
  const text = safeDigest(message, "discord");

  const response = await fetch(webhook, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content: text })
  });
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to post to Discord: ${response.status} ${errorText}`);
  }
  console.log("Posted to Discord successfully.");
}
