export function renderRisk(root, uio, pulse, trend) {
  root.innerHTML = `
    <h1>Risk</h1>
    <pre>${JSON.stringify(
      {
        global: uio.risk.global,
        systemic: uio.risk.systemic,
        pulse: pulse?.risk?.global ?? null
      },
      null,
      2
    )}</pre>
  `;
}
