const RAW_UIO =
  "https://raw.githubusercontent.com/christianscode1994/VolatiAI/main/data/outputs/uio.json";

async function load() {
  const res = await fetch(RAW_UIO);
  const uio = await res.json();

  const lines = [];
  lines.push("Flow Dynamics:");
  uio.flows.dynamics.slice(0, 20).forEach(d => {
    lines.push(
      `- ${d.sector}: acceleration ${d.acceleration.toFixed(
        2
      )}, reversal ${d.reversal}, concentration ${d.concentration.toFixed(2)}`
    );
  });

  document.getElementById("flow").textContent = lines.join("\n");
}

load().catch(console.error);
