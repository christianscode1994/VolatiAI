// src/swarmer/metaSwarmer.ts
// Meta‑Swarmers for VolatiAI (serverless, stateless, anti‑compliance)
// Intelligence layer above the mission swarmers

type SwarmRole =
  | 'narrative'
  | 'depth'
  | 'developer'
  | 'sentiment'
  | 'anomaly';

type AnomalyLevel = 'normal' | 'ignition' | 'critical' | 'systemic';

type SwarmHealthLevel = 'stable' | 'fatigued' | 'overactive' | 'underactive';

type MetaAnomalyLevel = 'none' | 'converging' | 'aligned' | 'systemic';

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
  sectors?: string[];
  depinSignals?: string[];
};

type SwarmRunSummary = {
  role: SwarmRole;
  platformName: string;
  anomalyLevel: AnomalyLevel;
  swarmSize: number;
  acted: boolean;
};

type SwarmAdjustment = {
  role: SwarmRole;
  delta: number; // + = increase swarmers, - = decrease
};

type SwarmHealth = {
  level: SwarmHealthLevel;
  reason: string;
};

type MetaAnomaly = {
  level: MetaAnomalyLevel;
  score: number;
  drivers: string[];
};

type MetaIntel = {
  metaAnomaly: MetaAnomaly;
  swarmHealth: SwarmHealth;
  adjustments: SwarmAdjustment[];
  patterns: string[];
};

function computeMetaAnomaly(
  intel: IntelSnapshot,
  swarmRuns: SwarmRunSummary[]
): MetaAnomaly {
  const s = intel.scores;
  const baseAnomaly = intel.anomaly?.score ?? s.anomaly_score ?? 0;

  const highAnomalyRoles = swarmRuns.filter(
    r => r.anomalyLevel === 'critical' || r.anomalyLevel === 'systemic'
  ).length;

  const highDepth = s.depth_stress_score > 70;
  const extremeSentiment = Math.abs(s.sentiment_score) > 0.7;
  const devSurge = s.developer_score > 70;
  const depinActive = (intel.depinSignals ?? []).length > 0;

  let score = baseAnomaly;
  const drivers: string[] = [];

  if (highAnomalyRoles >= 3) {
    score += 0.15;
    drivers.push('multi‑role anomaly');
  }
  if (highDepth) {
    score += 0.1;
    drivers.push('depth stress');
  }
  if (extremeSentiment) {
    score += 0.1;
    drivers.push('extreme sentiment');
  }
  if (devSurge) {
    score += 0.1;
    drivers.push('developer surge');
  }
  if (depinActive) {
    score += 0.1;
    drivers.push('DePIN activity');
  }

  score = Math.min(1, score);

  let level: MetaAnomalyLevel = 'none';
  if (score > 0.9) level = 'systemic';
  else if (score > 0.75) level = 'aligned';
  else if (score > 0.6) level = 'converging';

  return { level, score, drivers };
}

function assessSwarmHealth(
  swarmRuns: SwarmRunSummary[],
  totalActionsToday: number
): SwarmHealth {
  const actedCount = swarmRuns.filter(r => r.acted).length;
  const avgSwarmSize =
    swarmRuns.length === 0
      ? 0
      : swarmRuns.reduce((acc, r) => acc + r.swarmSize, 0) / swarmRuns.length;

  if (totalActionsToday > 200 || avgSwarmSize > 3.5) {
    return {
      level: 'overactive',
      reason: 'high total actions or large average swarm size',
    };
  }

  if (actedCount === 0 || avgSwarmSize < 1) {
    return {
      level: 'underactive',
      reason: 'no swarmers acting or very small swarm size',
    };
  }

  if (totalActionsToday > 100) {
    return {
      level: 'fatigued',
      reason: 'moderately high action volume across swarm',
    };
  }

  return {
    level: 'stable',
    reason: 'balanced swarm activity and size',
  };
}

function recommendSwarmAdjustments(
  metaAnomaly: MetaAnomaly,
  swarmHealth: SwarmHealth,
  swarmRuns: SwarmRunSummary[]
): SwarmAdjustment[] {
  const adjustments: SwarmAdjustment[] = [];

  const rolesPresent = new Set<SwarmRole>(swarmRuns.map(r => r.role));

  const addAdjustment = (role: SwarmRole, delta: number) => {
    adjustments.push({ role, delta });
  };

  // Base on meta‑anomaly level
  switch (metaAnomaly.level) {
    case 'none':
      // Slightly favor narrative + developer
      if (rolesPresent.has('narrative')) addAdjustment('narrative', +1);
      if (rolesPresent.has('developer')) addAdjustment('developer', +1);
      break;
    case 'converging':
      // Increase anomaly + depth, reduce sentiment noise
      if (rolesPresent.has('anomaly')) addAdjustment('anomaly', +1);
      if (rolesPresent.has('depth')) addAdjustment('depth', +1);
      if (rolesPresent.has('sentiment')) addAdjustment('sentiment', -1);
      break;
    case 'aligned':
      // Strong focus on anomaly + depth + narrative
      if (rolesPresent.has('anomaly')) addAdjustment('anomaly', +2);
      if (rolesPresent.has('depth')) addAdjustment('depth', +1);
      if (rolesPresent.has('narrative')) addAdjustment('narrative', +1);
      break;
    case 'systemic':
      // Crisis mode: anomaly + depth maxed, sentiment reduced
      if (rolesPresent.has('anomaly')) addAdjustment('anomaly', +3);
      if (rolesPresent.has('depth')) addAdjustment('depth', +2);
      if (rolesPresent.has('sentiment')) addAdjustment('sentiment', -2);
      break;
  }

  // Adjust based on swarm health
  if (swarmHealth.level === 'overactive') {
    // globally dampen
    adjustments.forEach(a => {
      a.delta = Math.min(a.delta, 0); // no positive scaling when overactive
    });
  } else if (swarmHealth.level === 'underactive') {
    // globally encourage
    adjustments.forEach(a => {
      if (a.delta < 0) a.delta = 0;
      else a.delta = a.delta + 1;
    });
  }

  return adjustments;
}

function detectPatterns(
  intel: IntelSnapshot,
  metaAnomaly: MetaAnomaly,
  swarmRuns: SwarmRunSummary[]
): string[] {
  const patterns: string[] = [];
  const s = intel.scores;

  const roles = new Set<SwarmRole>(swarmRuns.map(r => r.role));

  if (metaAnomaly.level === 'systemic') {
    patterns.push('Systemic meta‑anomaly across multiple signals and missions');
  } else if (metaAnomaly.level === 'aligned') {
    patterns.push('Strong alignment between anomaly, depth, sentiment, and developer activity');
  } else if (metaAnomaly.level === 'converging') {
    patterns.push('Signals converging toward a higher‑risk regime');
  }

  if (s.depth_stress_score > 80 && roles.has('depth')) {
    patterns.push('Depth swarmer active during panic‑level depth stress');
  }

  if (Math.abs(s.sentiment_score) > 0.7 && roles.has('sentiment')) {
    patterns.push('Sentiment swarmer observing extreme crowd polarity');
  }

  if (s.developer_score > 70 && roles.has('developer')) {
    patterns.push('Developer swarmer tracking ecosystem surge');
  }

  if ((intel.depinSignals ?? []).length > 3 && roles.has('anomaly')) {
    patterns.push('Anomaly swarmer operating under intensified DePIN signal regime');
  }

  if ((intel.sectors ?? []).length > 2 && roles.has('narrative')) {
    patterns.push('Narrative swarmer monitoring multi‑sector rotation');
  }

  return patterns;
}

export function buildMetaIntel(options: {
  intel: IntelSnapshot;
  swarmRuns: SwarmRunSummary[];
  totalActionsToday: number;
}): MetaIntel {
  const { intel, swarmRuns, totalActionsToday } = options;

  const metaAnomaly = computeMetaAnomaly(intel, swarmRuns);
  const swarmHealth = assessSwarmHealth(swarmRuns, totalActionsToday);
  const adjustments = recommendSwarmAdjustments(metaAnomaly, swarmHealth, swarmRuns);
  const patterns = detectPatterns(intel, metaAnomaly, swarmRuns);

  const metaIntel: MetaIntel = {
    metaAnomaly,
    swarmHealth,
    adjustments,
    patterns,
  };

  console.log('[META‑SWARMER]', metaIntel);

  return metaIntel;
}

// Serverless entrypoint for meta‑swarmers
export function runMetaSwarmer(options: {
  intel: IntelSnapshot;
  swarmRuns: SwarmRunSummary[];
  totalActionsToday: number;
}) {
  const metaIntel = buildMetaIntel(options);

  return {
    metaIntel,
    metaAnomalyLevel: metaIntel.metaAnomaly.level,
    swarmHealthLevel: metaIntel.swarmHealth.level,
  };
}
