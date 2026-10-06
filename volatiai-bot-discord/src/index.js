import { fetchBotRisk } from "volatiai-bots-core/client.js";
import { formatRiskMessage } from "volatiai-bots-core/formatters.js";

export default {
  async fetch(request) {
    const interaction = await request.json();

    if (interaction.type === 2) {
      const name = interaction.data.name;
      if (name === "risk") {
        const risk = await fetchBotRisk();
        const content = formatRiskMessage(risk);
        return json({
          type: 4,
          data: { content }
        });
      }
    }

    return new Response("ok");
  }
};

function json(obj) {
  return new Response(JSON.stringify(obj), {
    headers: { "Content-Type": "application/json" }
  });
}
