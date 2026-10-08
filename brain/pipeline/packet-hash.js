/**
 * Deterministic GraphPacket Hash
 */

function stableStringify(value) {

  if (
    value === null ||
    typeof value !== "object"
  ) {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value
      .map(stableStringify)
      .join(",")}]`;
  }

  return `{${Object.keys(value)
    .sort()
    .map(
      key =>
        `"${key}":${stableStringify(
          value[key]
        )}`
    )
    .join(",")}}`;
}

export async function packetHash(
  packet
) {

  const normalized =
    stableStringify(packet);

  const bytes =
    new TextEncoder()
      .encode(normalized);

  const hash =
    await crypto.subtle.digest(
      "SHA-256",
      bytes
    );

  return Array
    .from(
      new Uint8Array(hash)
    )
    .map(
      b =>
        b
         .toString(16)
         .padStart(2, "0")
    )
    .join("");
}
