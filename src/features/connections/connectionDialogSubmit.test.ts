import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getLocale, setLocalePreference, type Locale } from "../../shared/i18n";

import {
  connectionDialogSubmitPolicy,
  validateConnectionNetworkPath,
} from "./connectionDialogSubmit";
import { defaultAdvancedConfig, defaultProxyConfig } from "./connectionTypes";

// 本文件断言英文文案：固定 locale，避免随宿主机系统语言（如 zh-CN）变化而失败。
let previousLocale: Locale;
beforeEach(() => { previousLocale = getLocale(); setLocalePreference("en"); });
afterEach(() => { setLocalePreference(previousLocale); });

describe("WF-02A connection dialog submit policy", () => {
  it("makes save-and-connect the primary action for a new or duplicated profile", () => {
    expect(connectionDialogSubmitPolicy(false)).toStrictEqual({
      primary: { intent: "save-and-connect", label: "Save and connect" },
      secondary: { intent: "save", label: "Save only" },
    });
  });

  it("keeps edit-save non-disruptive and makes a new connection explicit", () => {
    expect(connectionDialogSubmitPolicy(true)).toStrictEqual({
      primary: { intent: "save", label: "Save connection" },
      secondary: { intent: "save-and-connect", label: "Save and open new connection" },
    });
  });

  it("keeps SSH jump validation shared by both submit intents", () => {
    const input = {
      protocol: "ssh" as const,
      host: "target.example",
      port: 22,
      username: "ops",
      credential_mode: "prompt" as const,
      proxy: defaultProxyConfig,
      jump: { kind: "ssh_jump" as const, jump_connection_id: "" },
      advanced: defaultAdvancedConfig,
    };
    expect(validateConnectionNetworkPath(input)).toStrictEqual({
      detail: "SSH jump-host mode requires a saved connection.",
      title: "Choose a jump-host connection",
    });
    expect(
      validateConnectionNetworkPath({
        ...input,
        jump: { kind: "ssh_jump", jump_connection_id: "jump-profile" },
      }),
    ).toBeNull();
  });
});
