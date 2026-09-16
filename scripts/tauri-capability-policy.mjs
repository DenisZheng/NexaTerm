import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

export const MAIN_CAPABILITY_IDENTIFIER = "default";
export const RUNNER_CAPABILITY_IDENTIFIER = "vnc-runner-host";

export const MAIN_PERMISSIONS = [
  "core:default",
  "core:webview:allow-create-webview-window",
  "core:window:allow-close",
  "core:window:allow-available-monitors",
  "core:window:allow-inner-size",
  "core:window:allow-minimize",
  "core:window:allow-outer-position",
  "core:window:allow-set-position",
  "core:window:allow-set-size",
  "core:window:allow-set-focus",
  "core:window:allow-show",
  "core:window:allow-start-dragging",
  "core:window:allow-toggle-maximize",
  "core:window:allow-unminimize",
  "dialog:allow-open",
  "dialog:allow-save",
  "opener:default",
  "process:default",
  "updater:default",
  "clipboard-manager:allow-read-text",
  "clipboard-manager:allow-write-text",
];

export const RUNNER_PERMISSIONS = [
  "core:event:allow-listen",
  "core:event:allow-unlisten",
  "core:event:allow-emit",
  "core:window:allow-close",
  "core:window:allow-destroy",
  "core:window:allow-minimize",
  "core:window:allow-start-dragging",
  "core:window:allow-toggle-maximize",
];

export function readTauriCapabilities(
  capabilityDirectory = path.resolve("src-tauri/capabilities"),
) {
  return readdirSync(capabilityDirectory)
    .filter((name) => name.endsWith(".json"))
    .sort()
    .map((name) =>
      JSON.parse(readFileSync(path.join(capabilityDirectory, name), "utf8")),
    );
}

export function validateTauriCapabilities(capabilities) {
  const errors = [];
  const byIdentifier = new Map();

  for (const capability of capabilities) {
    if (byIdentifier.has(capability.identifier)) {
      errors.push("Duplicate capability identifier: " + capability.identifier);
      continue;
    }
    byIdentifier.set(capability.identifier, capability);
  }

  const main = byIdentifier.get(MAIN_CAPABILITY_IDENTIFIER);
  const runner = byIdentifier.get(RUNNER_CAPABILITY_IDENTIFIER);

  validateCapability(errors, main, {
    identifier: MAIN_CAPABILITY_IDENTIFIER,
    permissions: MAIN_PERMISSIONS,
    windows: ["main"],
  });
  validateCapability(errors, runner, {
    identifier: RUNNER_CAPABILITY_IDENTIFIER,
    permissions: RUNNER_PERMISSIONS,
    windows: ["vnc-runner-host"],
  });

  for (const capability of capabilities) {
    const windows = Array.isArray(capability.windows) ? capability.windows : [];
    if (windows.includes("main") && windows.includes("vnc-runner-host")) {
      errors.push(
        "Capability " +
          capability.identifier +
          " must not cover both main and vnc-runner-host.",
      );
    }
    if (capability.remote) {
      errors.push(
        "Capability " + capability.identifier + " must not allow remote origins.",
      );
    }
  }

  return errors;
}

function validateCapability(errors, capability, expected) {
  if (!capability) {
    errors.push("Missing capability: " + expected.identifier);
    return;
  }

  compareExactSet(
    errors,
    expected.identifier + " windows",
    capability.windows,
    expected.windows,
  );
  compareExactSet(
    errors,
    expected.identifier + " permissions",
    capability.permissions,
    expected.permissions,
  );
}

function compareExactSet(errors, label, actualValue, expectedValue) {
  if (!Array.isArray(actualValue)) {
    errors.push(label + " must be an array.");
    return;
  }

  const actual = new Set(actualValue);
  const expected = new Set(expectedValue);
  const missing = [...expected].filter((value) => !actual.has(value));
  const unexpected = [...actual].filter((value) => !expected.has(value));

  if (actual.size !== actualValue.length) {
    errors.push(label + " must not contain duplicate entries.");
  }
  if (missing.length > 0) {
    errors.push(label + " missing: " + missing.join(", "));
  }
  if (unexpected.length > 0) {
    errors.push(label + " unexpected: " + unexpected.join(", "));
  }
}
