// ─────────────────────────────────────────────────────────────────────
// AGENTKIT INTEGRATION — Prep file, do not import until World App ready
//
// World AgentKit adds a "Proof of Human" extension to the 402 challenge.
// An agent signs a CAIP-122 message with its wallet; the server looks up
// that wallet in AgentBook on World Chain (eip155:480) to confirm a unique
// human delegated authority. If confirmed, grant free-trial access instead
// of charging USDC.
//
// Integration steps once World App is set up:
//   1. Register agent wallet: npx @worldcoin/agentkit-cli register 0xWALLET
//   2. Add env vars: WORLD_AGENT_WALLET, WORLD_AGENTBOOK_RPC
//   3. Import this module and add `...agentkitExtension()` to the 402 extensions
//   4. Wire the verify branch in the /premium/mcp handler
// ─────────────────────────────────────────────────────────────────────

export const AGENTKIT_NETWORK = "eip155:480";  // World Chain mainnet
export const AGENTKIT_CHAIN_ID = 480;

/**
 * Build the agentkit extension object for the 402 challenge.
 * @param {string} domain - "volatiai-mcp.fourieranalys.workers.dev"
 * @param {string} uri - resource URL
 * @param {number} freeUses - how many free calls before requiring payment
 */
export function agentkitExtension(domain, uri, freeUses = 100) {
  return {
    agentkit: {
      info: {
        version: "1",
        statement: "Prove your human-backed identity for free-trial access",
        domain,
        uri,
        nonce: crypto.randomUUID(),
        issuedAt: new Date().toISOString(),
        resources: [uri],
      },
      supportedChains: [
        { chainId: AGENTKIT_NETWORK, type: "eip191" },
        { chainId: AGENTKIT_NETWORK, type: "eip1271" },  // smart wallet
      ],
      schema: {
        $schema: "https://json-schema.org/draft/2020-12/schema",
        type: "object",
        properties: {
          domain: { type: "string" },
          address: { type: "string" },
          statement: { type: "string" },
          uri: { type: "string", format: "uri" },
          version: { type: "string" },
          chainId: { type: "string" },
          type: { type: "string" },
          nonce: { type: "string" },
          issuedAt: { type: "string", format: "date-time" },
          signature: { type: "string" },
        },
        required: ["domain", "address", "uri", "version", "chainId", "type", "nonce", "issuedAt", "signature"],
      },
      _options: {
        mode: { type: "free-trial", uses: freeUses },
        network: AGENTKIT_NETWORK,
      },
    },
  };
}

/**
 * Verify a World ID signature from the SIGN-IN-WITH-AGENTKIT header.
 * Returns { isValid, wallet, isHumanBacked, usesRemaining }
 *
 * TODO: implement once World App is set up — needs @worldcoin/agentkit-client
 *       and an RPC to World Chain for AgentBook lookup.
 */
export async function verifyAgentkit(header, env) {
  // Placeholder — will be replaced with real verification
  return { isValid: false, wallet: null, isHumanBacked: false, usesRemaining: 0 };
}
