import { safeDigest } from "../../scripts/safe_digest.mjs";
// telegram.js — VolatiAI Telegram Bot
import { checkAttribution } from '../../connectors/attribution.js';

export async function postToTelegram(message, sectors = []) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;

  if (!token || !chatId) {
    return;
  }

  // ─── Compliance gate: fail closed ───
  if (!sectors || sectors.length === 0) {
    console.log('SKIP telegram: no sectors — cannot verify license');
    return;
  }
  const attr = await checkAttribution(sectors);
  if (!attr.safe) {
    console.log(`SKIP telegram: unverified license in ${sectors.join(', ')}`);
    return;
  }

  const text = safeDigest(message, "telegram");

  await fetch(
    `https://api.telegram.org/bot${token}/sendMessage`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text })
    }
  );
}
