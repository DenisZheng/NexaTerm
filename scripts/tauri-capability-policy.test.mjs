import assert from "node:assert/strict";
import { test } from "node:test";

import {
  readTauriCapabilities,
  validateTauriCapabilities,
} from "./tauri-capability-policy.mjs";

function cloneCapabilities(capabilities) {
  return structuredClone(capabilities);
}

function capabilityById(capabilities, identifier) {
  return capabilities.find((capability) => capability.identifier === identifier);
}

const currentCapabilities = readTauriCapabilities();

test("current Tauri capabilities isolate the VNC runner host", () => {
  assert.deepEqual(validateTauriCapabilities(currentCapabilities), []);
});

test("rejects granting updater access to the VNC runner host", () => {
  const capabilities = cloneCapabilities(currentCapabilities);
  capabilityById(capabilities, "vnc-runner-host").permissions.push("updater:default");

  assert.match(
    validateTauriCapabilities(capabilities).join("\n"),
    /vnc-runner-host permissions unexpected: updater:default/,
  );
});

test("rejects a capability shared by main and the VNC runner host", () => {
  const capabilities = cloneCapabilities(currentCapabilities);
  capabilityById(capabilities, "default").windows.push("vnc-runner-host");

  const errors = validateTauriCapabilities(capabilities).join("\n");
  assert.match(errors, /default windows unexpected: vnc-runner-host/);
  assert.match(errors, /must not cover both main and vnc-runner-host/);
});

test("rejects removing the runner event emission permission", () => {
  const capabilities = cloneCapabilities(currentCapabilities);
  const runner = capabilityById(capabilities, "vnc-runner-host");
  runner.permissions = runner.permissions.filter(
    (permission) => permission !== "core:event:allow-emit",
  );

  assert.match(
    validateTauriCapabilities(capabilities).join("\n"),
    /vnc-runner-host permissions missing: core:event:allow-emit/,
  );
});

test("rejects removing main-window focus permission used when reusing the runner", () => {
  const capabilities = cloneCapabilities(currentCapabilities);
  const main = capabilityById(capabilities, "default");
  main.permissions = main.permissions.filter(
    (permission) => permission !== "core:window:allow-set-focus",
  );

  assert.match(
    validateTauriCapabilities(capabilities).join("\n"),
    /default permissions missing: core:window:allow-set-focus/,
  );
});
