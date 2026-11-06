const RAW_UIO =
  "https://raw.githubusercontent.com/christianscode1994/VolatiAI/main/data/outputs/uio.json";

async function load() {
  const res = await fetch(RAW_UIO);
  const uio = await res.json();

  const lines = [];
  lines.push("Top Opportunities:");
  uio.opportunities
    .sort((a, b) => b.score - a.score)
    .slice(0, 10)
    .forEach(o => {
      lines.push(`- ${o.sector}: ${o.score.toFixed(2)} (${o.drivers.join(", ")})`);
    });

  document.getElementById("opp").textContent = lines.join("\n");
}

load().catch(console.error);
