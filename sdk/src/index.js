const DEFAULT_BASE = "https://volatiai-mcp.fourieranalys.workers.dev";

export class VolatiAI {
  constructor({ baseUrl = DEFAULT_BASE, fetchImpl = fetch } = {}) {
    this.baseUrl = baseUrl.replace(/\/$/, "");
    this.fetch = fetchImpl;
  }

  async _post(path, body) {
    const r = await this.fetch(this.baseUrl + path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!r.ok) throw new Error("VolatiAI " + path + ": " + r.status);
    return r.json();
  }

  async formulas() {
    const r = await this.fetch(this.baseUrl + "/premium/formulas");
    if (!r.ok) throw new Error("formulas: " + r.status);
    return r.json();
  }

  async delta({ since = 0 } = {}) {
    return this._post("/premium/signals/delta", { since });
  }

  async evaluate({ assets, min_volatility = 5, max_change_24h = -3 } = {}) {
    return this._post("/premium/signals/evaluate", { assets, min_volatility, max_change_24h });
  }

  async rank({ mode = "risk_adjusted", assets } = {}) {
    const body = { mode };
    if (assets) body.assets = assets;
    return this._post("/premium/signals/rank", body);
  }

  async watch({ intervalMs = 5 * 60 * 1000, onChanged, shouldStop } = {}) {
    let cursor = 0;
    while (!shouldStop || !shouldStop()) {
      const d = await this.delta({ since: cursor });
      if (d.changed_count > 0 && onChanged) await onChanged(d);
      cursor = d.next_cursor || cursor;
      await new Promise(r => setTimeout(r, intervalMs));
    }
  }
}
