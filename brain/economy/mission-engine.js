export function createMission({
  id,
  issuer,
  capability,
  reward
}) {

  return {

    id,

    type: "mission",

    issuer,

    capability,

    reward
  };
}
