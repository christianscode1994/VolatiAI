import { checkAttribution } from './attribution.js';

export async function publish(message, sectors = []) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;

  // Compliance gate
  if (!sectors || sectors.length === 0) {
    console.log('SKIP telegram: no sector info — cannot verify license');
    return null;
  }
  const attr = await checkAttribution(sectors);
  if (!attr.safe) {
    console.log(`SKIP telegram: unverified license in ${sectors.join(', ')}`);
    return null;
  }

  const text = attr.footer
    ? `${message}\n\n${attr.footer}`
    : message;

  return fetch(
    `https://api.telegram.org/bot${token}/sendMessage`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text })
    }
  );
}
