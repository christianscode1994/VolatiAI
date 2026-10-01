// mastodon.js — VolatiAI Mastodon Bot

import fetch from "node-fetch";

export async function postToMastodon(message) {
  const token = process.env.MASTODON_TOKEN;
  const instance = process.env.MASTODON_INSTANCE;
  if (!token || !instance) return;

  await fetch(`${instance}/api/v1/statuses`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: new URLSearchParams({ status: message })
  });
}
