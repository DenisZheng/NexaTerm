import test from "node:test";
import assert from "node:assert/strict";

import { normalizeTauriSigningPrivateKey } from "./prepare-tauri-signing-key.mjs";

test("updater signing key removes line wrapping without changing key bytes", () => {
  const raw = Buffer.from("nexaterm-updater-signing-key-fixture").toString("base64");
  const wrapped = `  ${raw.slice(0, 12)}\r\n${raw.slice(12, 28)}\n${raw.slice(28)}  `;
  assert.equal(normalizeTauriSigningPrivateKey(wrapped), raw);
});

test("updater signing key rejects missing and non-base64 values", () => {
  assert.throws(
    () => normalizeTauriSigningPrivateKey(" \r\n "),
    /Missing TAURI_SIGNING_PRIVATE_KEY/,
  );
  assert.throws(
    () => normalizeTauriSigningPrivateKey("not-a-base64-key!"),
    /must contain one base64 key/,
  );
});
