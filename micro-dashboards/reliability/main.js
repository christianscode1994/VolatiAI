const RAW_UIO =
  "https://raw.githubusercontent.com/christianscode1994/VolatiAI/main/data/outputs/uio.json";

async function load() {
  const res = await fetch(RAW_UIO);
  const uio = await res.json();

  const lines = [];
  lines.push(`Global Reliability: ${uio.reliability.global.toFixed(2)}`);
  lines.push("");

  lines.push("Components:");
  Object.entries(uio.reliability.components).forEach(([k, v]) => {
    lines.push(`- ${k}: ${v.toFixed(2)}`);
  });

  document.getElementById("rel").textContent = lines.join("\n");
}

load().catch(console.error);
