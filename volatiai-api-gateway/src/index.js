const RAW_UIO =
  "https://raw.githubusercontent.com/christianscode1994/VolatiAI/main/data/outputs/uio.json";
const RAW_PULSE =
  "https://raw.githubusercontent.com/christianscode1994/VolatiAI/main/pulse/";
const RAW_HISTORY =
  "https://raw.githubusercontent.com/christianscode1994/VolatiAI/main/history/uio/";
const RAW_INSIGHTS =
  "https://raw.githubusercontent.com/christianscode1994/VolatiAI/main/insights/";

export default {
  async fetch(request) {
    const url = new URL(request.url);
    const path = url.pathname;

    if (path === "/api/uio") return fetch(RAW_UIO);

    if (path === "/api/pulse/latest") {
      const now = new Date();
      const iso = now.toISOString().slice(0, 13);
      return fetch(`${RAW_PULSE}${iso}.json`);
    }

    if (path === "/api/trend/7d") {
      const promises = [];
      for (let i = 0; i < 7; i++) {
        const d = new Date(Date.now() - i * 86400000);
        const iso = d.toISOString().slice(0, 10);
        promises.push(fetch(`${RAW_HISTORY}${iso}.json`).then(r => r.json()));
      }
      const data = await Promise.all(promises);
      return new Response(JSON.stringify(data.reverse()), {
        headers: { "Content-Type": "application/json" }
      });
    }

    if (path === "/api/insights/top-risk")
      return fetch(`${RAW_INSIGHTS}top_risk.json`);

    return new Response("VolatiAI API Gateway", { status: 200 });
  }
};
