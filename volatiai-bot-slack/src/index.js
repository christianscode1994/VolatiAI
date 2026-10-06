import { fetchBotRisk } from "volatiai-bots-core/client.js";
import { formatRiskMessage } from "volatiai-bots-core/formatters.js";

const SLACK_BOT_TOKEN = SLACK_TOKEN_FROM_ENV;

export default {
  async fetch(request) {
    const body = await request.json();

    // URL verification
    if (body.type === "url_verification") {
      return new Response(body.challenge);
    }

    if (body.type === "event_callback") {
      const event = body.event;
      if (event.type === "app_mention" && event.text.includes("risk")) {
        const risk = await fetchBotRisk();
        const text = formatRiskMessage(risk);
        await postSlackMessage(event.channel, text);
      }
    }

    return new Response("ok");
  }
};

async function postSlackMessage(channel, text) {
  await fetch("https://slack.com/api/chat.postMessage", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${SLACK_BOT_TOKEN}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ channel, text })
  });
}
