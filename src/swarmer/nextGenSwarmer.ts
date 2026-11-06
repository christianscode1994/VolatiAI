// src/swarmer/nextGenSwarmer.ts
// Next‑gen Swarmers for VolatiAI (serverless, stateless, anti‑compliance)

type SwarmRole =
  | 'narrative'
  | 'depth'
  | 'developer'
  | 'sentiment'
  | 'anomaly';

type AnomalyLevel = 'normal' | 'ignition' | 'critical' | 'systemic';

type PlatformProfile = {
  name: string;
  maxDailyActions: number;
  minIntervalMs: number;
};

type SwarmBehavior = {
  jitterMs: number;
  maxActionsPerRun: number;
};

type IntelScores = {
  volatility_score: number;
  sentiment_score: number;
  developer_score: number;
  depth_stress_score: number;
  rpc_truth_score: number;
  anomaly_score?: number;
};

type IntelSnapshot = {
  scores: IntelScores;
  anomaly?: {
    score: number;
    level: AnomalyLevel;
  };
  sectors?: string[];        // optional sector tags from fusion/intel
  depinSignals?: string[];   // optional DePIN‑related signals
};

const PLATFORM_PROFILES: PlatformProfile[] = [
  { name: 'bluesky',   maxDailyActions: 80, minIntervalMs: 30_000 },
  { name: 'mastodon',  maxDailyActions: 50, minIntervalMs: 60_000 },
  { name: 'farcaster', maxDailyActions: 40, minIntervalMs: 45_000 },
];

function getPlatformProfile(platformName: string): PlatformProfile {
  return (
    PLATFORM_PROFILES.find(p => p.name === platformName) ?? {
      name: platformName,
      maxDailyActions: 30,
      minIntervalMs: 60_000,
    }
  );
}

function getBehaviorFromAnomaly(level: AnomalyLevel): SwarmBehavior {
  switch (level) {
    case 'normal':
      return { jitterMs: 60_000, maxActionsPerRun: 1 };
    case 'ignition':
      return { jitterMs: 30_000, maxActionsPerRun: 2 };
    case 'critical':
      return { jitterMs: 15_000, maxActionsPerRun: 3 };
    case 'systemic':
      return { jitterMs: 10_000, maxActionsPerRun: 4 };
  }
}

function desiredSwarmSize(intel: IntelSnapshot): number {
  const s = intel.scores;
  const anomalyScore = intel.anomaly?.score ?? s.anomaly_score ?? 0;

  let interesting = 0;
  if (anomalyScore > 0.8) interesting += 2;
  if (s.depth_stress_score > 70) interesting += 1;
  if (Math.abs(s.sentiment_score) > 0.7) interesting += 1;

  return Math.min(4, 1 + interesting); // 1–4 swarmers
}

function shouldCooldown(
  lastRunTs: number | null,
  actionsToday: number,
  platform: PlatformProfile
): boolean {
  const now = Date.now();
  const tooFrequent =
    lastRunTs !== null && now - lastRunTs < platform.minIntervalMs;
  const tooMany = actionsToday >= platform.maxDailyActions;
  return tooFrequent || tooMany;
}

// ---- Sector‑aware narrative tracking ----

function sectorAwareNarrative(intel: IntelSnapshot) {
  const sectors = intel.sectors ?? [];
  const s = intel.scores;

  const dominantSector =
    sectors.length > 0 ? sectors[0] : 'global';

  const narrativeBias =
    s.volatility_score > 70
      ? 'high‑volatility'
      : Math.abs(s.sentiment_score) > 0.6
      ? 'sentiment‑driven'
      : s.developer_score > 60
      ? 'builder‑driven'
      : 'neutral';

  return {
    dominantSector,
    narrativeBias,
    sectors,
  };
}

// ---- Depth stress interpreters ----

function interpretDepthStress(intel: IntelSnapshot) {
  const depth = intel.scores.depth_stress_score;

  let regime: 'calm' | 'strained' | 'illiquid' | 'panic';
  if (depth < 30) regime = 'calm';
  else if (depth < 60) regime = 'strained';
  else if (depth < 80) regime = 'illiquid';
  else regime = 'panic';

  return {
    regime,
    depthScore: depth,
  };
}

// ---- Developer ecosystem mapping ----

function mapDeveloperEcosystem(intel: IntelSnapshot) {
  const dev = intel.scores.developer_score;

  let activityBand: 'low' | 'normal' | 'elevated' | 'surge';
  if (dev < 20) activityBand = 'low';
  else if (dev < 50) activityBand = 'normal';
  else if (dev < 80) activityBand = 'elevated';
  else activityBand = 'surge';

  return {
    activityBand,
    devScore: dev,
  };
}

// ---- Sentiment polarity analyzers ----

function analyzeSentimentPolarity(intel: IntelSnapshot) {
  const sent = intel.scores.sentiment_score;

  let polarity: 'bearish' | 'neutral' | 'bullish';
  if (sent < -0.3) polarity = 'bearish';
  else if (sent > 0.3) polarity = 'bullish';
  else polarity = 'neutral';

  return {
    polarity,
    sentimentScore: sent,
  };
}

// ---- Anomaly escalation logic ----

function anomalyEscalation(intel: IntelSnapshot) {
  const level: AnomalyLevel = intel.anomaly?.level ?? 'normal';
  const score = intel.anomaly?.score ?? intel.scores.anomaly_score ?? 0;

  let escalationTier: 'none' | 'watch' | 'alert' | 'crisis';
  switch (level) {
    case 'normal':
      escalationTier = 'none';
      break;
    case 'ignition':
      escalationTier = 'watch';
      break;
    case 'critical':
      escalationTier = 'alert';
      break;
    case 'systemic':
      escalationTier = 'crisis';
      break;
  }

  return {
    escalationTier,
    anomalyLevel: level,
    anomalyScore: score,
  };
}

// ---- DePIN‑aware swarm behavior ----

function depinBehavior(intel: IntelSnapshot) {
  const signals = intel.depinSignals ?? [];
  const hasDePIN = signals.length > 0;

  let mode: 'idle' | 'observe' | 'track' | 'intensify';
  if (!hasDePIN) mode = 'idle';
  else if (signals.length < 3) mode = 'observe';
  else if (signals.length < 6) mode = 'track';
  else mode = 'intensify';

  return {
    mode,
    signals,
  };
}

// ---- Mission logic per role (internal only, no external posting) ----

function runNarrativeMission(intel: IntelSnapshot, platform: PlatformProfile) {
  const narrative = sectorAwareNarrative(intel);
  const sentiment = analyzeSentimentPolarity(intel);

  console.log('[SWARMER:NARRATIVE]', {
    platform: platform.name,
    dominantSector: narrative.dominantSector,
    narrativeBias: narrative.narrativeBias,
    sectors: narrative.sectors,
    sentimentPolarity: sentiment.polarity,
  });
}

function runDepthMission(intel: IntelSnapshot, platform: PlatformProfile) {
  const depth = interpretDepthStress(intel);
  const depin = depinBehavior(intel);

  console.log('[SWARMER:DEPTH]', {
    platform: platform.name,
    depthRegime: depth.regime,
    depthScore: depth.depthScore,
    depinMode: depin.mode,
    depinSignals: depin.signals,
  });
}

function runDeveloperMission(intel: IntelSnapshot, platform: PlatformProfile) {
  const devMap = mapDeveloperEcosystem(intel);
  const depin = depinBehavior(intel);

  console.log('[SWARMER:DEVELOPER]', {
    platform: platform.name,
    devActivityBand: devMap.activityBand,
    devScore: devMap.devScore,
    depinMode: depin.mode,
  });
}

function runSentimentMission(intel: IntelSnapshot, platform: PlatformProfile) {
  const sentiment = analyzeSentimentPolarity(intel);
  const narrative = sectorAwareNarrative(intel);

  console.log('[SWARMER:SENTIMENT]', {
    platform: platform.name,
    sentimentPolarity: sentiment.polarity,
    sentimentScore: sentiment.sentimentScore,
    narrativeBias: narrative.narrativeBias,
  });
}

function runAnomalyMission(intel: IntelSnapshot, platform: PlatformProfile) {
  const escalation = anomalyEscalation(intel);
  const depth = interpretDepthStress(intel);
  const devMap = mapDeveloperEcosystem(intel);

  console.log('[SWARMER:ANOMALY]', {
    platform: platform.name,
    escalationTier: escalation.escalationTier,
    anomalyLevel: escalation.anomalyLevel,
    anomalyScore: escalation.anomalyScore,
    depthRegime: depth.regime,
    devActivityBand: devMap.activityBand,
  });
}

// ---- Main swarmer runner (serverless entrypoint) ----

export function runSwarmer(options: {
  role: SwarmRole;
  platformName: string;
  intel: IntelSnapshot;
  lastRunTs: number | null;
  actionsToday: number;
}) {
  const { role, platformName, intel, lastRunTs, actionsToday } = options;

  const platform = getPlatformProfile(platformName);
  const anomalyLevel: AnomalyLevel =
    intel.anomaly?.level ?? 'normal';

  const behavior = getBehaviorFromAnomaly(anomalyLevel);

  if (shouldCooldown(lastRunTs, actionsToday, platform)) {
    return {
      acted: false,
      reason: 'cooldown',
      nextJitterMs: behavior.jitterMs,
    };
  }

  const swarmSize = desiredSwarmSize(intel);

  switch (role) {
    case 'narrative':
      runNarrativeMission(intel, platform);
      break;
    case 'depth':
      runDepthMission(intel, platform);
      break;
    case 'developer':
      runDeveloperMission(intel, platform);
      break;
    case 'sentiment':
      runSentimentMission(intel, platform);
      break;
    case 'anomaly':
      runAnomalyMission(intel, platform);
      break;
  }

  return {
    acted: true,
    swarmSize,
    anomalyLevel,
    nextJitterMs: behavior.jitterMs,
  };
}
