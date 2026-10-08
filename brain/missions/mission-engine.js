export function createMission(
  capability,
  reward
) {
  return {
    capability,
    reward
  };
}

export function matchMission(
  mission,
  agents
) {

  return agents.filter(
    agent =>
      agent.capabilities.includes(
        mission.capability
      )
  );
}
