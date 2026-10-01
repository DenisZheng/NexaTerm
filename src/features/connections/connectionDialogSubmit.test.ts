import { describe, expect, it } from "vitest";

import {
  connectionDialogSubmitPolicy,
  validateConnectionNetworkPath,
} from "./connectionDialogSubmit";

describe("WF-02A connection dialog submit policy", () => {
  it("makes save-and-connect the primary action for a new or duplicated profile", () => {
    expect(connectionDialogSubmitPolicy(false)).toStrictEqual({
      primary: { intent: "save-and-connect", label: "保存并连接" },
      secondary: { intent: "save", label: "仅保存" },
    });
  });

  it("keeps edit-save non-disruptive and makes a new connection explicit", () => {
    expect(connectionDialogSubmitPolicy(true)).toStrictEqual({
      primary: { intent: "save", label: "保存连接" },
      secondary: { intent: "save-and-connect", label: "保存并新建连接" },
    });
  });

  it("keeps SSH jump validation shared by both submit intents", () => {
    const input = {
      protocol: "ssh" as const,
      host: "target.example",
      port: 22,
      username: "ops",
      jump: { kind: "ssh_jump" as const, jump_connection_id: "" },
    };
    expect(validateConnectionNetworkPath(input)).toStrictEqual({
      detail: "SSH 跳板机模式需要选择一条已保存连接。",
      title: "请选择跳板机连接",
    });
    expect(
      validateConnectionNetworkPath({
        ...input,
        jump: { kind: "ssh_jump", jump_connection_id: "jump-profile" },
      }),
    ).toBeNull();
  });
});
