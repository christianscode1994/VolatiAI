import axios from "axios";
import pkg from "@atproto/api";
const { BskyAgent } = pkg;
import Mastodon from "mastodon-api";
import { SimplePool, finalizeEvent } from "nostr-tools";
import { TwitterApi } from "twitter-api-v2";

const MESSAGE = "VolatiAI broadcast test — swarm online.";

async function slack() {
  if (!process.env.SLACK_WEBHOOK_URL) return;
  await axios.post(process.env.SLACK_WEBHOOK_URL, { text: MESSAGE });
}

async function discord() {
  if (!process.env.DISCORD_WEBHOOK_URL) return;
  await axios.post(process.env.DISCORD_WEBHOOK_URL, { content: MESSAGE });
}

async function telegram() {
  if (!process.env.TELEGRAM_BOT_TOKEN || !process.env.TELEGRAM_CHAT_ID) return;
  const url = `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`;
  await axios.post(url, { chat_id: process.env.TELEGRAM_CHAT_ID, text: MESSAGE });
}

async function twitter() {
  if (!process.env.TWITTER_API_KEY) return;
  const client = new TwitterApi({
    appKey: process.env.TWITTER_API_KEY,
    appSecret: process.env.TWITTER_API_SECRET,
    accessToken: process.env.TWITTER_ACCESS_TOKEN,
    accessSecret: process.env.TWITTER_ACCESS_SECRET,
  });
  await client.v2.tweet(MESSAGE);
}

async function bluesky() {
  if (!process.env.BLUESKY_HANDLE) return;

  const agent = new BskyAgent({ service: "https://bsky.social" });

  await agent.login({
    identifier: process.env.BLUESKY_HANDLE,
    password: process.env.BLUESKY_PASSWORD,
  });

  await agent.post({ text: MESSAGE });
}

async function mastodon() {
  if (!process.env.MASTODON_INSTANCE) return;
  const M = new Mastodon({
    access_token: process.env.MASTODON_ACCESS_TOKEN,
    api_url: `${process.env.MASTODON_INSTANCE}/api/v1/`,
  });
  await M.post("statuses", { status: MESSAGE });
}

async function nostr() {
  if (!process.env.NOSTR_PRIVATE_KEY) return;

  const relay = process.env.NOSTR_RELAY || "wss://relay.damus.io";
  const pool = new SimplePool();

  const eventTemplate = {
    kind: 1,
    created_at: Math.floor(Date.now() / 1000),
    tags: [],
    content: MESSAGE,
  };

  const event = finalizeEvent(eventTemplate, process.env.NOSTR_PRIVATE_KEY);

  await pool.publish(relay, event);
}

async function main() {
  console.log("Broadcasting…");

  await slack();
  await discord();
  await telegram();
  await twitter();
  await bluesky();
  await mastodon();
  await nostr();

  console.log("Broadcast complete.");
}

main();
