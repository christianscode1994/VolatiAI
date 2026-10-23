// persona.js

const PERSONAS = {
  default: {
    name: "VolatiAI",
    tone: "neutral",
    style: "concise",
    emoji: "⚡"
  },
  analyst: {
    name: "VolatiAI Analyst",
    tone: "analytical",
    style: "structured",
    emoji: "📊"
  },
  degen: {
    name: "VolatiAI Degen",
    tone: "casual",
    style: "short",
    emoji: "🧨"
  },
  guardian: {
    name: "VolatiAI Guardian",
    tone: "cautious",
    style: "explanatory",
    emoji: "🛡️"
  }
};

export function getPersona(name = "default") {
  return PERSONAS[name] || PERSONAS.default;
}

export function applyPersona(personaName, message) {
  const persona = getPersona(personaName);
  return `${persona.emoji} ${persona.name}\n${message}`;
}
