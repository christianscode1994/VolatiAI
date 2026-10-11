export function updateTrust(
  reputation,
  verified
) {
  return verified
    ? reputation + 1
    : reputation - 1;
}
