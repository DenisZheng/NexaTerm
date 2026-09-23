import { describe, expect, it } from "vitest";

import {
  decideConnectionClose,
  decideLocalClose,
  decideRdpRemove,
  decideTerminalClose,
  decideVncRemove,
  type CloseSnapshot,
} from "./closeDecision";
import { initialSessionPointerState } from "./reducer";

// 场景表照 WorkspaceShell @ 45418f3 六条关闭路径逐分支写成；假数据只有占位 id，不含真实主机或凭据。

const ref = (id: string, connectionId: string) => ({ connectionId, id });
const empty: CloseSnapshot = {
  localTerminalTabs: [],
  rdpSessions: [],
  remoteFileTabs: [],
  terminalTabs: [],
  vncSessions: [],
};
const snap = (partial: Partial<CloseSnapshot>): CloseSnapshot => ({ ...empty, ...partial });
const pointers = (partial: Partial<typeof initialSessionPointerState>) => ({
  ...initialSessionPointerState,
  ...partial,
});

describe("decideTerminalClose", () => {
  it("关闭非活动 tab 且活动连接仍有终端：不动指针", () => {
    const d = decideTerminalClose(
      pointers({ activeTabId: "t1", activeConnectionId: "a", mode: "ssh" }),
      [ref("t2", "a")],
      snap({ terminalTabs: [ref("t1", "a")] }),
    );
    expect(d).toEqual({ followUp: null, forget: undefined, patch: {}, remember: undefined });
  });

  it("关闭活动 tab，同连接还有终端：切到同连接下一个并记忆", () => {
    const d = decideTerminalClose(
      pointers({ activeTabId: "t1", activeConnectionId: "a", mode: "ssh" }),
      [ref("t1", "a")],
      snap({ terminalTabs: [ref("t9", "b"), ref("t2", "a")] }),
    );
    expect(d.patch).toEqual({ activeTabId: "t2", activeConnectionId: "a" });
    expect(d.remember).toEqual({ connectionId: "a", tabId: "t2" });
    expect(d.followUp).toBeNull();
  });

  it("关闭活动 tab，同连接无终端但别的连接有：切到第一个终端（连接跟着变）", () => {
    const d = decideTerminalClose(
      pointers({ activeTabId: "t1", activeConnectionId: "a", mode: "ssh" }),
      [ref("t1", "a")],
      snap({ terminalTabs: [ref("t9", "b")] }),
    );
    expect(d.patch).toEqual({ activeTabId: "t9", activeConnectionId: "b" });
    expect(d.remember).toEqual({ connectionId: "b", tabId: "t9" });
  });

  it("关闭活动 tab，无终端但同连接有文件 tab：转到文件并忘记该连接记忆", () => {
    const d = decideTerminalClose(
      pointers({ activeTabId: "t1", activeConnectionId: "a", mode: "ssh" }),
      [ref("t1", "a")],
      snap({ remoteFileTabs: [ref("f0", "z"), ref("f1", "a")] }),
    );
    expect(d.patch).toEqual({ activeTabId: null, activeConnectionId: "a", activeRemoteFileTabId: "f1" });
    expect(d.forget).toEqual(["a"]);
    expect(d.followUp).toBeNull();
  });

  it("关闭活动 tab，无终端无文件：回退顺序 rdp → vnc → local", () => {
    const base = pointers({ activeTabId: "t1", activeConnectionId: "a", mode: "ssh" });
    const closing = [ref("t1", "a")];
    const all = snap({
      localTerminalTabs: [{ id: "l1" }],
      rdpSessions: [ref("r1", "b")],
      vncSessions: [ref("v1", "c")],
    });
    expect(decideTerminalClose(base, closing, all).followUp).toEqual({ kind: "rdp", connectionId: "b", sessionId: "r1" });
    expect(decideTerminalClose(base, closing, { ...all, rdpSessions: [] }).followUp).toEqual({
      kind: "vnc",
      connectionId: "c",
      sessionId: "v1",
    });
    expect(decideTerminalClose(base, closing, { ...all, rdpSessions: [], vncSessions: [] }).followUp).toEqual({
      kind: "local",
      tabId: "l1",
    });
    expect(decideTerminalClose(base, closing, all).patch).toEqual({ activeTabId: null, activeConnectionId: null });
    expect(decideTerminalClose(base, closing, all).forget).toEqual(["a"]);
  });

  it("关闭最后一个 tab 且工作区全空：回首页", () => {
    const d = decideTerminalClose(
      pointers({ activeTabId: "t1", activeConnectionId: "a", mode: "ssh" }),
      [ref("t1", "a")],
      empty,
    );
    expect(d.patch).toEqual({ activeTabId: null, activeConnectionId: null, homeActive: true, mode: "home" });
    expect(d.forget).toEqual(["a"]);
    expect(d.followUp).toBeNull();
  });

  it("活动 tab 不在关闭集合，但活动连接的全部终端被关：只换连接并忘记记忆", () => {
    const d = decideTerminalClose(
      pointers({ activeTabId: "f-or-connecting", activeConnectionId: "a", mode: "ssh" }),
      [ref("t1", "a"), ref("t2", "a")],
      snap({ terminalTabs: [ref("t9", "b")] }),
    );
    expect(d.patch).toEqual({ activeConnectionId: "b" });
    expect(d.forget).toEqual(["a"]);
    expect(d.remember).toBeUndefined();
  });

  it("同连接多实例只关一个非活动实例：兄弟实例不受影响", () => {
    const d = decideTerminalClose(
      pointers({ activeTabId: "t1", activeConnectionId: "a", mode: "ssh" }),
      [ref("t2", "a")],
      snap({ terminalTabs: [ref("t1", "a")] }),
    );
    expect(d.patch).toEqual({});
    expect(d.followUp).toBeNull();
  });

  it("连接中（connecting）tab 与已连接 tab 走同一决策：只看 id 与连接", () => {
    const d = decideTerminalClose(
      pointers({ activeTabId: "c1", activeConnectionId: "a", mode: "ssh" }),
      [ref("c1", "a")],
      snap({ terminalTabs: [ref("t1", "a")] }),
    );
    expect(d.patch).toEqual({ activeTabId: "t1", activeConnectionId: "a" });
  });
});

describe("decideConnectionClose", () => {
  const active = pointers({ activeTabId: "t1", activeConnectionId: "a", mode: "ssh" });

  it("关闭非活动连接：不动指针（sessions 与 delete 一致）", () => {
    const s = snap({ terminalTabs: [ref("t1", "a")] });
    expect(decideConnectionClose(active, ["b"], s, "sessions").patch).toEqual({});
    expect(decideConnectionClose(active, ["b"], s, "delete").patch).toEqual({});
  });

  it("关闭活动连接，还有其它终端：切到第一个终端", () => {
    const s = snap({ terminalTabs: [ref("t9", "b")] });
    const d = decideConnectionClose(active, ["a"], s, "sessions");
    expect(d.patch).toEqual({ activeTabId: "t9", activeConnectionId: "b" });
    expect(d.followUp).toBeNull();
  });

  it("sessions：有终端也有文件时仍写 activeRemoteFileTabId，且文件优先非关闭连接", () => {
    const s = snap({ terminalTabs: [ref("t9", "b")], remoteFileTabs: [ref("fa", "a"), ref("fb", "b")] });
    const d = decideConnectionClose(active, ["a"], s, "sessions");
    expect(d.patch).toEqual({ activeTabId: "t9", activeConnectionId: "b", activeRemoteFileTabId: "fb" });
  });

  it("delete：有终端时不写文件指针；无终端时取第一个文件", () => {
    const withTerminal = snap({ terminalTabs: [ref("t9", "b")], remoteFileTabs: [ref("fb", "b")] });
    expect(decideConnectionClose(active, ["a"], withTerminal, "delete").patch).toEqual({
      activeTabId: "t9",
      activeConnectionId: "b",
    });
    const onlyFiles = snap({ remoteFileTabs: [ref("fb", "b")] });
    expect(decideConnectionClose(active, ["a"], onlyFiles, "delete").patch).toEqual({
      activeTabId: null,
      activeConnectionId: "b",
      activeRemoteFileTabId: "fb",
    });
  });

  it("无终端无文件：回退 rdp → vnc → local，且跳过被关闭连接的 rdp/vnc", () => {
    const s = snap({
      localTerminalTabs: [{ id: "l1" }],
      rdpSessions: [ref("ra", "a"), ref("rb", "b")],
      vncSessions: [ref("vc", "c")],
    });
    expect(decideConnectionClose(active, ["a"], s, "sessions").followUp).toEqual({
      kind: "rdp",
      connectionId: "b",
      sessionId: "rb",
    });
    expect(decideConnectionClose(active, ["a", "b"], s, "sessions").followUp).toEqual({
      kind: "vnc",
      connectionId: "c",
      sessionId: "vc",
    });
    expect(decideConnectionClose(active, ["a", "b", "c"], s, "delete").followUp).toEqual({ kind: "local", tabId: "l1" });
  });

  it("全空回首页；delete 变体在活动连接未被删但 activeTabId 失效时补第一个 tab", () => {
    expect(decideConnectionClose(active, ["a"], empty, "sessions").patch).toEqual({
      activeTabId: null,
      activeConnectionId: null,
      homeActive: true,
      mode: "home",
    });
    const d = decideConnectionClose(
      pointers({ activeTabId: "gone", activeConnectionId: "a", mode: "ssh" }),
      ["b"],
      snap({ terminalTabs: [ref("t1", "a")] }),
      "delete",
    );
    expect(d.patch).toEqual({ activeTabId: "t1" });
  });
});

describe("decideLocalClose", () => {
  it("关闭非活动本地 tab：不动", () => {
    expect(
      decideLocalClose(pointers({ activeLocalTerminalTabId: "l1", mode: "local" }), ["l2"], snap({ localTerminalTabs: [{ id: "l1" }] })),
    ).toEqual({ followUp: null, patch: {} });
  });

  it("关闭活动本地 tab：切到剩余第一个", () => {
    const d = decideLocalClose(pointers({ activeLocalTerminalTabId: "l1", mode: "local" }), ["l1"], snap({ localTerminalTabs: [{ id: "l2" }] }));
    expect(d.patch).toEqual({ activeLocalTerminalTabId: "l2" });
  });

  it("关闭最后一个本地 tab：全空回首页；有 ssh 只切 mode；否则 rdp → vnc", () => {
    const p = pointers({ activeLocalTerminalTabId: "l1", mode: "local" });
    expect(decideLocalClose(p, ["l1"], empty).patch).toEqual({ activeLocalTerminalTabId: null, homeActive: true, mode: "home" });
    expect(decideLocalClose(p, ["l1"], snap({ terminalTabs: [ref("t1", "a")] })).patch).toEqual({
      activeLocalTerminalTabId: null,
      mode: "ssh",
    });
    expect(decideLocalClose(p, ["l1"], snap({ rdpSessions: [ref("r1", "a")], vncSessions: [ref("v1", "b")] })).followUp).toEqual({
      kind: "rdp",
      connectionId: "a",
      sessionId: "r1",
    });
    expect(decideLocalClose(p, ["l1"], snap({ vncSessions: [ref("v1", "b")] })).followUp).toEqual({
      kind: "vnc",
      connectionId: "b",
      sessionId: "v1",
    });
    // 只剩文件 tab：不是全空，也没有 ssh/rdp/vnc → 只清本地指针
    expect(decideLocalClose(p, ["l1"], snap({ remoteFileTabs: [ref("f1", "a")] })).patch).toEqual({ activeLocalTerminalTabId: null });
  });
});

describe("decideRdpRemove / decideVncRemove", () => {
  it("关闭非活动 rdp：不动；活动 id 为空但 mode 为 rdp 视为活动被关", () => {
    expect(decideRdpRemove(pointers({ activeRdpSessionId: "r1", mode: "rdp" }), ["r2"], snap({ rdpSessions: [ref("r1", "a")] }))).toEqual({
      followUp: null,
      patch: {},
    });
    const d = decideRdpRemove(pointers({ activeRdpSessionId: null, mode: "rdp" }), ["r2"], snap({ rdpSessions: [ref("r1", "a")] }));
    expect(d.patch).toEqual({ activeRdpSessionId: "r1", activeConnectionId: "a", homeActive: false, mode: "rdp" });
  });

  it("关闭活动 rdp：优先同连接的 rdp，否则第一个", () => {
    const p = pointers({ activeRdpSessionId: "r1", activeConnectionId: "a", mode: "rdp" });
    const d = decideRdpRemove(p, ["r1"], snap({ rdpSessions: [ref("rb", "b"), ref("ra2", "a")] }));
    expect(d.patch).toEqual({ activeRdpSessionId: "ra2", activeConnectionId: "a", homeActive: false, mode: "rdp" });
    const d2 = decideRdpRemove(p, ["r1"], snap({ rdpSessions: [ref("rb", "b")] }));
    expect(d2.patch.activeRdpSessionId).toBe("rb");
  });

  it("rdp 无剩余：回退 vnc → terminal → local → 回首页（清五个指针）", () => {
    const p = pointers({ activeRdpSessionId: "r1", activeConnectionId: "a", mode: "rdp", activeTabId: "t0", activeLocalTerminalTabId: "l0" });
    const full = snap({ localTerminalTabs: [{ id: "l1" }], terminalTabs: [ref("t1", "b")], vncSessions: [ref("v1", "c")] });
    expect(decideRdpRemove(p, ["r1"], full)).toEqual({
      followUp: { kind: "vnc", connectionId: "c", sessionId: "v1" },
      patch: { activeRdpSessionId: null },
    });
    expect(decideRdpRemove(p, ["r1"], { ...full, vncSessions: [] }).followUp).toEqual({ kind: "terminal", connectionId: "b", tabId: "t1" });
    expect(decideRdpRemove(p, ["r1"], { ...full, vncSessions: [], terminalTabs: [] }).followUp).toEqual({ kind: "local", tabId: "l1" });
    expect(decideRdpRemove(p, ["r1"], empty)).toEqual({
      followUp: null,
      patch: {
        activeConnectionId: null,
        activeLocalTerminalTabId: null,
        activeRdpSessionId: null,
        activeTabId: null,
        activeVncSessionId: null,
        homeActive: true,
        mode: "home",
      },
    });
  });

  it("vnc 与 rdp 对称：先找 rdp，再终端、本地", () => {
    const p = pointers({ activeVncSessionId: "v1", activeConnectionId: "a", mode: "vnc" });
    expect(decideVncRemove(p, ["v1"], snap({ rdpSessions: [ref("r1", "b")], terminalTabs: [ref("t1", "c")] })).followUp).toEqual({
      kind: "rdp",
      connectionId: "b",
      sessionId: "r1",
    });
    expect(decideVncRemove(p, ["v1"], snap({ vncSessions: [ref("v2", "z")] })).patch).toEqual({
      activeVncSessionId: "v2",
      activeConnectionId: "z",
      homeActive: false,
      mode: "vnc",
    });
    expect(decideVncRemove(p, ["v1"], empty).patch.activeVncSessionId).toBeNull();
    expect(decideVncRemove(p, ["v1"], empty).patch.mode).toBe("home");
  });
});
