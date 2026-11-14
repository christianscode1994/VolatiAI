#!/usr/bin/env node
const BASE = process.argv[2] || "https://volatiai-mcp.fourieranalys.workers.dev";

async function post(path, body) {
  const r = await fetch(BASE + path, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`${path}: ${r.status}`);
  return r.json();
}

async function get(path) {
  const r = await fetch(BASE + path);
  if (!r.ok) throw new Error(`${path}: ${r.status}`);
  return r.json();
}

function fmt(sym, score) { return `${sym}:${score}`; }

async function runVector(formula, vector) {
  if (vector.type === "structural") {
    if (formula.id.startsWith("delta")) {
      const d = await post("/premium/signals/delta", { since: 0 });
      const ok = "next_cursor" in d && "changed_count" in d && "changed" in d;
      return { id: vector.id, pass: ok, detail: ok ? "structural ok" : "missing fields" };
    }
    return { id: vector.id, pass: true, detail: "no structural check" };
  }

  if (formula.id.startsWith("rank")) {
    const out = await post("/premium/signals/rank", vector.input);
    const order = (out.ranked || []).map(r => r.symbol);
    const pass = JSON.stringify(order) === JSON.stringify(vector.expected_order);
    return { id: vector.id, pass, detail: `expected [${vector.expected_order}] got [${order}]` };
  }

  if (formula.id === "evaluate-v1") {
    const out = await post("/premium/signals/evaluate", vector.input);
    const pass = out.alert === vector.expected.alert
      && JSON.stringify(out.matched) === JSON.stringify(vector.expected.matched)
      && out.policy_version === vector.expected.policy_version;
    return { id: vector.id, pass, detail: `alert=${out.alert} matched=${JSON.stringify(out.matched)}` };
  }

  return { id: vector.id, pass: false, detail: "no handler for formula " + formula.id };
}

(async () => {
  console.log(`\nVolatiAI Conformance — ${BASE}\n${"=".repeat(50)}\n`);
  const reg = await get("/premium/formulas");
  console.log(`Registry: ${reg.registry_version} (${reg.formulas.length} formulas)\n`);
  let total = 0, passed = 0;
  for (const f of reg.formulas) {
    for (const v of f.golden_vectors) {
      total++;
      const r = await runVector(f, v).catch(e => ({ id: v.id, pass: false, detail: e.message }));
      if (r.pass) passed++;
      console.log(`${r.pass ? "✓" : "✗"} ${r.id.padEnd(18)} ${r.detail}`);
    }
  }
  console.log(`\n${passed}/${total} vectors passed`);
  process.exit(passed === total ? 0 : 1);
})();
