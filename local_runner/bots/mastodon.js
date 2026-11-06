import { safeDigest } from "../../scripts/safe_digest.mjs";
// mastodon.js — VolatiAI Mastodon Bot
import { checkAttribution } from '../../connectors/attribution.js';

export async function postToMastodon(message, sectors = []) {
  const token = process.env.MASTODON_TOKEN;
  const instance = process.env.MASTODON_INSTANCE;

  if (!token || !instance) return;

  if (!sectors || sectors.length === 0) {
    console.log('SKIP mastodon: no sectors');
    return;
  }
  const attr = await checkAttribution(sectors);
  if (!attr.safe) {
    console.log(`SKIP mastodon: unverified license in ${sectors.join(', ')}`);
    return;
  }
  const text = safeDigest(message, "mastodon");

  const response = await fetch(`${instance}/api/v1/statuses`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: new URLSearchParams({ status: text })
  });
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to post to Mastodon: ${response.status} ${errorText}`);
  }
  console.log("Posted to Mastodon successfully.");
}
