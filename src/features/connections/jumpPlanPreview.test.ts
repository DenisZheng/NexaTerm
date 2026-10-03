import { describe, expect, it } from "vitest";
import type { ConnectionProfile, ConnectionProfileInput } from "./connectionTypes";
import { defaultAdvancedConfig, defaultProxyConfig } from "./connectionTypes";
import {
  buildJumpPlanPreview,
  jumpCandidateWouldCycle,
  validateJumpPlanSelection,
} from "./jumpPlanPreview";

function saved(id: string, jumpId?: string): ConnectionProfile {
  return {
    id,
    name: id,
    protocol: "ssh",
    host: `${id}.example.com`,
    port: 22,
    username: "root",
    credential_mode: "prompt",
    proxy: defaultProxyConfig,
    jump: jumpId ? { kind: "ssh_jump", jump_connection_id: jumpId } : { kind: "none" },
    advanced: defaultAdvancedConfig,
    rdp: null,
    vnc: null,
    telnet: null,
    serial: null,
    notes: null,
    is_favorite: false,
    created_at: "",
    updated_at: "",
  };
}

function target(jumpId: string): ConnectionProfileInput {
  return {
    id: "target",
    protocol: "ssh",
    name: "Target",
    host: "target.example.com",
    port: 22,
    username: "root",
    credential_mode: "prompt",
    proxy: defaultProxyConfig,
    jump: { kind: "ssh_jump", jump_connection_id: jumpId },
    advanced: defaultAdvancedConfig,
  };
}

describe("WF-06B jump plan preview", () => {
  it("shows the actual outer-to-inner two-hop connect order", () => {
    const preview = buildJumpPlanPreview(
      target("jump-001"),
      [saved("jump-001", "jump-002"), saved("jump-002")],
      "target",
    );
    expect(preview.issue).toBeNull();
    expect(preview.labels).toEqual(["jump-002", "jump-001", "Target"]);
  });

  it("rejects a candidate chain that points back to the edited target", () => {
    const connections = [saved("jump-001", "target"), saved("target")];
    expect(jumpCandidateWouldCycle("jump-001", "target", connections)).toBe(true);
    expect(validateJumpPlanSelection(target("jump-001"), connections, "target")?.code)
      .toBe("connection_jump_cycle");
  });

  it("reports a third jump instead of hiding the invalid saved chain", () => {
    const preview = buildJumpPlanPreview(
      target("jump-001"),
      [saved("jump-001", "jump-002"), saved("jump-002", "jump-003"), saved("jump-003")],
      "target",
    );
    expect(preview.issue?.code).toBe("connection_jump_depth_exceeded");
  });
});
