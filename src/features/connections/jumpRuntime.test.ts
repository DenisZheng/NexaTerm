import { describe, expect, it } from "vitest";

import {
  buildRuntimeCredentialRequest,
  parseCredentialPromptTarget,
  parseSshNodeFailure,
  upsertRuntimeCredential,
} from "./jumpRuntime";

describe("WF-06B jump runtime credentials", () => {
  it("parses the exact saved connection that needs a runtime credential", () => {
    expect(
      parseCredentialPromptTarget({
        code: "credential_prompt_required",
        details: {
          kind: "credential_prompt_required",
          connection_id: "jump-002",
          auth_kind: "private_key",
          host: "jump-002.example.com",
          port: 22,
          username: "ops",
        },
      }),
    ).toEqual({
      authKind: "private_key",
      connectionId: "jump-002",
      host: "jump-002.example.com",
      port: 22,
      username: "ops",
    });
  });

  it("keeps credentials for earlier hops while prompting a later hop", () => {
    let runtime = upsertRuntimeCredential({}, "jump-002", "password", "outer", "", "");
    runtime = upsertRuntimeCredential(runtime, "jump-001", "password", "inner", "", "");
    runtime = upsertRuntimeCredential(runtime, "target", "password", "target-secret", "", "");

    expect(buildRuntimeCredentialRequest("target", runtime)).toEqual({
      auth_kind: "password",
      connection_id: "target",
      password: "target-secret",
      runtime_credentials: {
        "jump-002": { auth_kind: "password", password: "outer" },
        "jump-001": { auth_kind: "password", password: "inner" },
        target: { auth_kind: "password", password: "target-secret" },
      },
    });
  });

  it("parses node context without relying on raw error text", () => {
    expect(
      parseSshNodeFailure({
        code: "jump_auth_rejected",
        details: {
          kind: "ssh_node_failure",
          connection_id: "jump-001",
          host: "jump-001.example.com",
          port: 22,
          stage: "auth",
        },
      }),
    ).toEqual({
      connectionId: "jump-001",
      host: "jump-001.example.com",
      port: 22,
      stage: "auth",
    });
  });
});
