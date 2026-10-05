import assert from "node:assert/strict";
import test from "node:test";

import {
  canonicalSidecarName,
  legacyCargoBinName,
  sidecarBuildPlan,
  sidecarExtension,
} from "./prepare-mcp-sidecar.mjs";

test("canonical sidecar bundle name is NexaTerm while Cargo target stays compatible", () => {
  assert.equal(canonicalSidecarName, "nexaterm-mcp");
  assert.equal(legacyCargoBinName, "mxterm-mcp");
});

test("Windows sidecar plan uses target-triple suffixed exe", () => {
  const plan = sidecarBuildPlan({
    rootDir: "/repo",
    targetTriple: "x86_64-pc-windows-msvc",
    debug: false,
  });
  assert.equal(sidecarExtension(plan.targetTriple), ".exe");
  assert.match(plan.source.replaceAll("\\", "/"), /src-tauri\/target\/x86_64-pc-windows-msvc\/release\/mxterm-mcp\.exe$/);
  assert.match(plan.destination.replaceAll("\\", "/"), /src-tauri\/binaries\/nexaterm-mcp-x86_64-pc-windows-msvc\.exe$/);
  assert.deepEqual(plan.cargoArgs.slice(-3), ["--target", "x86_64-pc-windows-msvc", "--release"]);
  assert.ok(plan.cargoArgs.includes("mxterm-mcp"));
});

test("macOS debug sidecar plan keeps executable extensionless", () => {
  const plan = sidecarBuildPlan({
    rootDir: "/repo",
    targetTriple: "aarch64-apple-darwin",
    debug: true,
  });
  assert.equal(sidecarExtension(plan.targetTriple), "");
  assert.match(plan.source.replaceAll("\\", "/"), /target\/aarch64-apple-darwin\/debug\/mxterm-mcp$/);
  assert.match(plan.destination.replaceAll("\\", "/"), /binaries\/nexaterm-mcp-aarch64-apple-darwin$/);
  assert.ok(!plan.cargoArgs.includes("--release"));
});
