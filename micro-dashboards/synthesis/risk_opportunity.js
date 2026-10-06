const RAW_UIO =
  "https://raw.githubusercontent.com/christianscode1994/VolatiAI/main/data/outputs/uio.json";

async function fetchUIO() {
  const res = await fetch(RAW_UIO);
  return res.json();
}

function buildPairs(uio) {
  const riskBySector = uio.risk.by_sector;
  const oppBySector = uio.opportunities;

  const map = new Map();
  for (const r of riskBySector) {
    map.set(r.sector, { sector: r.sector, risk: r.score, opportunity: 0 });
  }
  for (const o of oppBySector) {
    const existing = map.get(o.sector) || { sector: o.sector, risk: 0, opportunity: 0 };
    existing.opportunity = o.score;
    map.set(o.sector, existing);
  }
  return [...map.values()];
}

async function render() {
  const root = document.getElementById("view");
  const uio = await fetchUIO();
  const pairs = buildPairs(uio);

  root.innerHTML = `
    <h1>Risk × Opportunity Map</h1>
    <table>
      <thead>
        <tr>
          <th>Sector</th>
          <th>Risk</th>
          <th>Opportunity</th>
        </tr>
      </thead>
      <tbody>
        ${pairs
          .map(
            p => `
          <tr>
            <td>${p.sector}</td>
            <td>${p.risk.toFixed(2)}</td>
            <td>${p.opportunity.toFixed(2)}</td>
          </tr>
        `
          )
          .join("")}
      </tbody>
    </table>
  `;
}

render();
