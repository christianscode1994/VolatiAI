// src/worker/volatiai.ts
import { loadStateFromGitHub } from "../io/loadState.github";
import { runAgentCore } from "../agent/engine";

export default {
  async fetch(request: Request): Promise<Response> {
    const state = await loadStateFromGitHub();
    const result = runAgentCore(state);
    return new Response(JSON.stringify(result), {
      headers: { "Content-Type": "application/json" }
    });
  }
};
