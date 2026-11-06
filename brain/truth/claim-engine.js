export function createClaim({
  id,
  text,
  actor,
  domain
}) {

  return {

    id,

    type: "claim",

    properties: {

      text,

      actor,

      domain,

      created:
        Date.now()
    }
  };
}
