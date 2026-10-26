// slack.js — VolatiAI Slack Bot
import { checkAttribution } from '../../connectors/attribution.js';

export async function postToSlack(message, sectors = []) {
  const webhook = process.env.SLACK_WEBHOOK_URL;
  if (!webhook) return;

  if (!sectors || sectors.length === 0) {
    console.log('SKIP slack: no sectors');
    return;
  }
  const attr = await checkAttribution(sectors);
  if (!attr.safe) {
    console.log(`SKIP slack: unverified license in ${sectors.join(', ')}`);
    return;
  }
  const text = attr.footer ? `${message}\n\n${attr.footer}` : message;

  await fetch(webhook, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text })
  });
}
