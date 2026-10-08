#!/usr/bin/env node
import { appendFileSync } from "node:fs";
import process from "node:process";
import { pathToFileURL } from "node:url";

export function normalizeTauriSigningPrivateKey(value) {
  const normalized = String(value ?? "").replace(/\s+/g, "");
  if (!normalized) {
    throw new Error(
      "Missing TAURI_SIGNING_PRIVATE_KEY secret. GitHub Release updater artifacts must be signed.",
    );
  }
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(normalized)) {
    throw new Error(
      "TAURI_SIGNING_PRIVATE_KEY must contain one base64 key; only wrapping whitespace may be present.",
    );
  }

  const canonical = Buffer.from(normalized, "base64").toString("base64");
  if (canonical.replace(/=+$/, "") !== normalized.replace(/=+$/, "")) {
    throw new Error("TAURI_SIGNING_PRIVATE_KEY is not valid base64.");
  }
  return normalized;
}

export function writeNormalizedSigningKey({
  value = process.env.TAURI_SIGNING_PRIVATE_KEY,
  githubEnv = process.env.GITHUB_ENV,
} = {}) {
  if (!githubEnv) {
    throw new Error("GITHUB_ENV is required.");
  }
  const normalized = normalizeTauriSigningPrivateKey(value);
  process.stdout.write(`::add-mask::${normalized}\n`);
  appendFileSync(githubEnv, `TAURI_SIGNING_PRIVATE_KEY=${normalized}\n`);
  return normalized;
}

function main() {
  const normalized = writeNormalizedSigningKey();
  console.log(
    `Updater signing key validated and normalized (${normalized.length} base64 characters).`,
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    main();
  } catch (error) {
    console.error(`::error::${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}
