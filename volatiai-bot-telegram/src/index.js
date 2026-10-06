import { fetchBotRisk } from "volatiai-bots-core/client.js";
import { formatRiskMessage } from "volatiai-bots-core/formatters.js";

const TELEGRAM_TOKEN = TELEGRAM_BOT_TOKEN_FROM_ENV;

export default {
  async fetch(request) {
    const update = await request.json();
    const chatId = update.message.chat.id;
    const text = update.message.text || "";

    if (text.startsWith("/risk")) {
      const risk = await fetchBotRisk();
      const msg = formatRiskMessage(risk);
      await sendTelegramMessage(chatId, msg);
    }

    return new Response("ok");
  }
};

async function sendTelegramMessage(chatId, text) {
  const url = `https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`;
  await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text })
  });
}
