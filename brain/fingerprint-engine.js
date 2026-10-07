import crypto from "crypto";

export function fingerprint(text) {

  return crypto
    .createHash("sha256")
    .update(text.trim())
    .digest("hex");

}

export function isDuplicate(
  fingerprint,
  history = []
) {
  return history.includes(fingerprint);
}
