const RAW_UIO =
  "https://raw.githubusercontent.com/christianscode1994/VolatiAI/main/data/outputs/uio.json";

async function load() {
  const res = await fetch(RAW_UIO);
  const uio = await res.json();

  const lines = [];
  lines.push("Centrality:");
  Object.entries(uio.graph.centrality).forEach(([sector, score]) => {
    lines.push(`- ${sector}: ${score.toFixed(2)}`);
  });

  lines.push("");
  lines.push("Hotspots:");
  uio.graph.hotspots.forEach(h => lines.push(`- ${h}`));

  lines.push("");
  lines.push("Clusters:");
  uio.graph.clusters.forEach(c => lines.push(`- ${c.join(", ")}`));

  document.getElementById("graph").textContent = lines.join("\n");
}

load().catch(console.error);
