export function actor({
  id,
  type,
  capabilities = []
}) {

  return {

    id,

    type,

    capabilities
  };
}
