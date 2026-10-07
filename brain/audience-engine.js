export function forTelegram(signal) {

  return `
📡 ${signal.theme}

Confidence: ${signal.confidence}%

${signal.narrative}

Evidence:
${signal.sectors.join(", ")}
`;

}

export function forDiscord(signal) {

  return `

# ${signal.theme}

${signal.narrative}

What do you think?

`;




export function forSlack(signal) {

  return `
Theme: ${signal.theme}

Confidence:
${signal.confidence}%

${signal.narrative}
`;

}

export function forBluesky(signal) {

  return `${signal.theme}

${signal.narrative.slice(0,180)}

#VolatiAI`;
}


export function forMastodon(signal) {

  return `
${signal.theme}

${signal.narrative}

#opensource
#intelligence
`;
}

export function forNostr(signal) {

  return `
${signal.theme}

${signal.narrative}
`;
}






}
