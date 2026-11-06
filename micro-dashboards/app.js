import { renderRisk } from "./views/risk.js";
import { renderOpp } from "./views/opportunity.js";
import { renderNarr } from "./views/narrative.js";
import { renderFlow } from "./views/flow.js";
import { renderRel } from "./views/reliability.js";
import { renderGraph } from "./views/graph.js";

const RAW_UIO =
  "https://raw.githubusercontent.com/christianscode1994/VolatiAI/main/data/outputs/uio.json";
const RAW_PULSE =
  "https://raw.githubusercontent.com/christianscode1994/VolatiAI/main/pulse/";
const RAW_HISTORY =
  "https://raw.githubusercontent.com/christianscode1994/VolatiAI/main/history/uio/";

async function fetchPulse() {
  const now = new Date();
  const iso = now.toISOString().slice(0, 13);
  const res = await fetch(`${RAW_PULSE}${iso}.json`);
  return res.ok ? res.json() : null;
}

async function fetchTrend(days = 7) {
  const out = [];
  for (let i = 0; i < days; i++) {
    const d = new Date(Date.now() - i * 86400000);
    const iso = d.toISOString().slice(0, 10);
    const res = await fetch(`${RAW_HISTORY}${iso}.json`);
    if (res.ok) out.push(await res.json());
  }
  return out.reverse();
}

async function bootstrap() {
  const [uio, pulse, trend] = await Promise.all([
    fetch(RAW_UIO).then(r => r.json()),
    fetchPulse(),
    fetchTrend(7)
  ]);

  const view = document.getElementById("view");

  document.getElementById("tab-risk").onclick = () =>
    renderRisk(view, uio, pulse, trend);
  document.getElementById("tab-opp").onclick = () =>
    renderOpp(view, uio, pulse, trend);
  document.getElementById("tab-narr").onclick = () =>
    renderNarr(view, uio, pulse, trend);
  document.getElementById("tab-flow").onclick = () =>
    renderFlow(view, uio, pulse, trend);
  document.getElementById("tab-rel").onclick = () =>
    renderRel(view, uio, pulse, trend);
  document.getElementById("tab-graph").onclick = () =>
    renderGraph(view, uio, pulse, trend);

  renderRisk(view, uio, pulse, trend);
}

bootstrap();
