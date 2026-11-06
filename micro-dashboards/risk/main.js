const RAW_UIO =
  "https://raw.githubusercontent.com/christianscode1994/VolatiAI/main/data/outputs/uio.json";

async function load() {
  const res = await fetch(RAW_UIO);
  const uio = await res.json();

  const lines = [];
  lines.push(`Global Risk: ${uio.risk.global.toFixed(2)}`);
  lines.push(`Systemic Risk: ${uio.risk.systemic.toFixed(2)}`);
  lines.push("");

  lines.push("Top Sector Risks:");
  uio.risk.by_sector
    .sort((a, b) => b.score - a.score)
    .slice(0, 10)
    .forEach(r => {
      lines.push(`- ${r.sector}: ${r.score.toFixed(2)}`);
    });

  document.getElementById("risk").textContent = lines.join("\n");
}

load().catch(console.error);
