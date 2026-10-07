export function forTelegram(signal) {

  return `
📡 ${signal.theme}

Confidence: ${signal.confidence}%

${signal.narrative}

Evidence:
${signal.sectors.join(", ")}
`;

}
