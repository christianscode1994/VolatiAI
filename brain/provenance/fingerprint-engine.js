export async function fingerprint(
  text
) {

  const encoder =
    new TextEncoder();

  const data =
    encoder.encode(
      text.trim()
    );

  const hash =
    await crypto.subtle.digest(
      "SHA-256",
      data
    );

  return Array
    .from(
      new Uint8Array(hash)
    )
    .map(
      b =>
      b.toString(16)
       .padStart(2, "0")
    )
    .join("");
}
