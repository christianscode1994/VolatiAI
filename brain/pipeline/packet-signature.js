import {
  packetHash
}
from "./packet-hash.js";

export async function signPacket(
  packet,
  privateKey
) {

  const hash =
    await packetHash(packet);

  const bytes =
    new TextEncoder()
      .encode(hash);

  const signature =
    await crypto.subtle.sign(
      {
        name: "ECDSA",
        hash: "SHA-256"
      },
      privateKey,
      bytes
    );

  return {

    packet,

    signature:
      Array.from(
        new Uint8Array(
          signature
        )
      )
  };
}

export async function verifyPacket(
  packet,
  signature,
  publicKey
) {

  const hash =
    await packetHash(packet);

  const bytes =
    new TextEncoder()
      .encode(hash);

  return crypto.subtle.verify(
    {
      name: "ECDSA",
      hash: "SHA-256"
    },
    publicKey,
    new Uint8Array(
      signature
    ),
    bytes
  );
}
