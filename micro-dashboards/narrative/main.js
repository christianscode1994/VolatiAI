const RAW_UIO =
  "https://raw.githubusercontent.com/christianscode1994/VolatiAI/main/data/outputs/uio.json";

async function load() {
  const res = await fetch(RAW_UIO);
  const uio = await res.json();

  const lines = [];
  lines.push(`Headline: ${uio.narrative.headline}`);
  lines.push("");

  lines.push("Narrative Arcs:");
  uio.narrative.arcs.slice(0, 10).forEach(a => {
    lines.push(
      `- ${a.topic}: ${a.direction} (strength ${a.strength.toFixed(
        2
      )}, velocity ${a.velocity.toFixed(2)})`
    );
  });

  lines.push("");
  lines.push("Flags:");
  uio.narrative.flags.forEach(f => lines.push(`- ${f}`));

  document.getElementById("narr").textContent = lines.join("\n");
}

load().catch(console.error);
