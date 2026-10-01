// topicEngine.js

const TOPIC_WEIGHTS = {
  volatility: 1.0,
  sentiment: 0.9,
  dev: 0.8,
  depth: 0.7,
  chain: 1.1
};

export function inferTopic(signal) {
  return signal.type || "unknown";
}

export function topicScore(signal) {
  const topic = inferTopic(signal);
  const base = TOPIC_WEIGHTS[topic] || 0.5;
  return base * (signal.volatility || 0)
       + base * Math.abs(signal.sentiment || 0)
       + base * (signal.devActivity || 0)
       + base * (signal.depth || 0);
}

export function shouldPublishTopic(signal, minScore = 3) {
  return topicScore(signal) >= minScore;
}
