import { fetchBotSignals } from "volatiai-bots-core/client.js";
import { formatSignalsMessage } from "volatiai-bots-core/formatters.js";

export default {
  async scheduled(event, env, ctx) {
    const signals = await fetchBotSignals();
    const active = Object.values(signals).filter(s => s && s.active !== false);
    if (!active.length) return;

    const msg = formatSignalsMessage(signals);

    await Promise.all([
      postTelegram(env, msg),
      postDiscord(env, msg),
      postSlack(env, msg),
      postMastodon(env, msg),
      postBluesky(env, msg),
      postNostr(env, msg)
    ]);
  }
};

// Telegram
async function postTelegram(env, text) {
  await fetch(`https://api.telegram.org/bot${env.TELEGRAM_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: env.TELEGRAM_CHAT_ID, text })
  });
}

// Discord
async function postDiscord(env, text) {
  await fetch(env.DISCORD_WEBHOOK_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content: text })
  });
}

// Slack
async function postSlack(env, text) {
  await fetch(env.SLACK_WEBHOOK_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text })
  });
}

// Mastodon
async function postMastodon(env, text) {
  await fetch(`${env.MASTODON_BASE}/api/v1/statuses`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.MASTODON_TOKEN}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ status: text })
  });
}

// Bluesky
async function postBluesky(env, text) {
  // use your existing atproto client
  await env.BLUESKY.post(text);
}

// Nostr
async function postNostr(env, text) {
  // sign + publish event to relays
  await env.NOSTR.publish(text);
}
