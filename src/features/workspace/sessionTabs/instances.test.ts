import { describe, expect, it } from "vitest";

import { terminalPaneBindingKey } from "../../terminal/terminalSplitLayout";

import {
  displayOrdinal,
  instanceItemId,
  itemTitle,
  nextOrdinal,
  selectActiveItemId,
  selectWorkspaceItems,
  unregisteredInstanceIds,
  type ActiveInstanceRefs,
  type InstanceCollections,
  type TerminalInstanceItem,
  type WorkspaceItem,
} from "./instances";

const ssh = (id: string, connectionId: string, ordinal = 0) => ({ connectionId, id, ordinal });
const local = (id: string, profileId: string, ordinal = 0, source?: "local" | "serial" | "telnet") => ({
  id,
  ordinal,
  profileId,
  source,
});
const remote = (id: string, connectionId: string) => ({ connectionId, id });
const noInstances: InstanceCollections = {
  localTerminalTabs: [],
  rdpSessions: [],
  terminalTabs: [],
  vncSessions: [],
};
const ids = (items: readonly WorkspaceItem[]) => items.map((item) => item.id);

describe("实例 id 与编号", () => {
  it("ssh / local 实例 id 与分屏 binding key 同格式，分屏成员可直接对应", () => {
    expect(instanceItemId("ssh", "t1")).toBe(terminalPaneBindingKey({ kind: "ssh", tabId: "t1" }));
    expect(instanceItemId("local", "l1")).toBe(terminalPaneBindingKey({ kind: "local", tabId: "l1" }));
  });

  it("nextOrdinal 取 owner 内最大值 + 1，0 起；关闭中间实例留下的空号不复用", () => {
    expect(nextOrdinal([])).toBe(0);
    expect(nextOrdinal([0, 2])).toBe(3);
  });

  it("displayOrdinal：owner 内首个实例不显示编号，其后显示 ordinal + 1（终端、终端 2…）", () => {
    expect(displayOrdinal(0)).toBeNull();
    expect(displayOrdinal(1)).toBe(2);
    expect(displayOrdinal(4)).toBe(5);
  });
});

describe("unregisteredInstanceIds", () => {
  it("返回集合里有、顺序表里没有的实例 id，按 ssh → local → rdp → vnc 的集合顺序", () => {
    expect(
      unregisteredInstanceIds(
        {
          localTerminalTabs: [{ id: "l1" }],
          rdpSessions: [{ id: "r1" }],
          terminalTabs: [{ id: "t1" }, { id: "t2" }],
          vncSessions: [{ id: "v1" }],
        },
        ["ssh:t1", "rdp:r1"],
      ),
    ).toEqual(["ssh:t2", "local:l1", "vnc:v1"]);
  });

  it("全部已登记时返回空数组", () => {
    expect(
      unregisteredInstanceIds({ ...noInstances, terminalTabs: [ssh("t1", "a")] }, ["ssh:t1"]),
    ).toEqual([]);
  });
});

describe("selectWorkspaceItems", () => {
  it("空工作区只有首页", () => {
    expect(selectWorkspaceItems(noInstances, [], null)).toEqual([{ kind: "home", id: "home" }]);
  });

  it("同一连接的两个终端是两个独立实例项（WS-M02）", () => {
    const items = selectWorkspaceItems(
      { ...noInstances, terminalTabs: [ssh("t1", "a", 0), ssh("t2", "a", 1)] },
      [],
      null,
    );
    expect(items.slice(1)).toEqual([
      { kind: "ssh", id: "ssh:t1", connectionId: "a", ordinal: 0, tabId: "t1" },
      { kind: "ssh", id: "ssh:t2", connectionId: "a", ordinal: 1, tabId: "t2" },
    ]);
  });

  it("本地、RDP、VNC 实例各自成项；本地项带 source，缺省视为 local（WS-E13）", () => {
    const items = selectWorkspaceItems(
      {
        localTerminalTabs: [local("l1", "p"), local("l2", "tel", 0, "telnet")],
        rdpSessions: [remote("r1", "b")],
        terminalTabs: [],
        vncSessions: [remote("v1", "c")],
      },
      [],
      null,
    );
    expect(items.slice(1)).toEqual([
      { kind: "local", id: "local:l1", ordinal: 0, profileId: "p", source: "local", tabId: "l1" },
      { kind: "local", id: "local:l2", ordinal: 0, profileId: "tel", source: "telnet", tabId: "l2" },
      { kind: "rdp", id: "rdp:r1", connectionId: "b", sessionId: "r1" },
      { kind: "vnc", id: "vnc:v1", connectionId: "c", sessionId: "v1" },
    ]);
  });

  const mixed: InstanceCollections = {
    localTerminalTabs: [local("l1", "p")],
    rdpSessions: [remote("r1", "b")],
    terminalTabs: [ssh("t1", "a", 0), ssh("t2", "a", 1)],
    vncSessions: [remote("v1", "c")],
  };

  it("按顺序表跨类型排列，首页恒在最前（WS-M05）", () => {
    expect(ids(selectWorkspaceItems(mixed, ["vnc:v1", "local:l1", "ssh:t2", "rdp:r1", "ssh:t1"], null))).toEqual([
      "home",
      "vnc:v1",
      "local:l1",
      "ssh:t2",
      "rdp:r1",
      "ssh:t1",
    ]);
  });

  it("顺序表缺的实例按 ssh → local → rdp → vnc 补尾，表里已不存在的 id 忽略", () => {
    expect(ids(selectWorkspaceItems(mixed, ["ssh:gone", "rdp:r1"], null))).toEqual([
      "home",
      "rdp:r1",
      "ssh:t1",
      "ssh:t2",
      "local:l1",
      "vnc:v1",
    ]);
  });

  it("不修改输入集合与顺序表", () => {
    const order = Object.freeze(["rdp:r1", "ssh:t1"]);
    const terminalTabs = Object.freeze([ssh("t1", "a")]);
    const rdpSessions = Object.freeze([remote("r1", "b")]);
    expect(() => selectWorkspaceItems({ ...noInstances, rdpSessions, terminalTabs }, order, null)).not.toThrow();
    expect(order).toEqual(["rdp:r1", "ssh:t1"]);
  });

  describe("分屏组（WS-E12）", () => {
    it("成员折叠为一个分屏组项，占成员中最靠前的位置；宿主取 pane 顺序中第一个属于宿主连接的成员", () => {
      const items = selectWorkspaceItems(mixed, ["rdp:r1", "local:l1", "ssh:t1", "vnc:v1", "ssh:t2"], {
        bindings: [
          { kind: "local", tabId: "l1" },
          { kind: "ssh", tabId: "t2" },
          { kind: "ssh", tabId: "t1" },
        ],
        host: { connectionId: "a", kind: "ssh" },
      });
      expect(ids(items)).toEqual(["home", "rdp:r1", "split", "vnc:v1"]);
      expect(items[2]).toEqual({
        kind: "split",
        id: "split",
        host: { kind: "ssh", id: "ssh:t2", connectionId: "a", ordinal: 1, tabId: "t2" },
        memberIds: ["local:l1", "ssh:t2", "ssh:t1"],
      });
    });

    it("本地宿主取第一个本地成员；宿主在成员里找不到时取第一个成员", () => {
      const splitHost = (items: readonly WorkspaceItem[]) => {
        const group = items.find((item) => item.kind === "split");
        return group?.kind === "split" ? group.host.id : null;
      };
      const bindings = [
        { kind: "ssh" as const, tabId: "t2" },
        { kind: "local" as const, tabId: "l1" },
      ];
      expect(splitHost(selectWorkspaceItems(mixed, [], { bindings, host: { kind: "local" } }))).toBe("local:l1");
      expect(splitHost(selectWorkspaceItems(mixed, [], { bindings, host: { connectionId: "zz", kind: "ssh" } }))).toBe(
        "ssh:t2",
      );
    });

    it("指向已不存在实例的 binding 被忽略；没有可用成员时不生成分屏组项", () => {
      const host = { connectionId: "a", kind: "ssh" as const };
      const partial = selectWorkspaceItems(mixed, [], {
        bindings: [
          { kind: "ssh", tabId: "gone" },
          { kind: "ssh", tabId: "t1" },
        ],
        host,
      });
      expect(ids(partial)).toEqual(["home", "split", "ssh:t2", "local:l1", "rdp:r1", "vnc:v1"]);
      expect(partial[1]).toMatchObject({ memberIds: ["ssh:t1"] });
      const empty = selectWorkspaceItems(mixed, [], { bindings: [{ kind: "ssh", tabId: "gone" }], host });
      expect(ids(empty)).toEqual(["home", "ssh:t1", "ssh:t2", "local:l1", "rdp:r1", "vnc:v1"]);
    });
  });
});

const sshT2: TerminalInstanceItem = { kind: "ssh", id: "ssh:t2", connectionId: "a", ordinal: 1, tabId: "t2" };

describe("itemTitle（WS-E11）", () => {
  const names: Record<string, string> = { a: "server-A", b: "server-B", tel: "router" };
  const profiles: Record<string, string> = { p: "Ubuntu" };
  const lookups = {
    connectionName: (id: string) => names[id] ?? null,
    localProfileName: (id: string) => profiles[id] ?? null,
  };

  it("SSH 为配置名 + 每连接 ordinal", () => {
    expect(itemTitle(sshT2, lookups)).toEqual({ kind: "ssh", name: "server-A", ordinal: 1 });
  });

  it("本地终端取 profile 名；telnet / serial 取连接名（其 profileId 即连接 id）", () => {
    expect(
      itemTitle({ kind: "local", id: "local:l1", ordinal: 0, profileId: "p", source: "local", tabId: "l1" }, lookups),
    ).toEqual({ kind: "local", name: "Ubuntu", ordinal: 0 });
    expect(
      itemTitle({ kind: "local", id: "local:l2", ordinal: 2, profileId: "tel", source: "telnet", tabId: "l2" }, lookups),
    ).toEqual({ kind: "local", name: "router", ordinal: 2 });
  });

  it("RDP / VNC 为配置名 + 协议", () => {
    expect(itemTitle({ kind: "rdp", id: "rdp:r1", connectionId: "b", sessionId: "r1" }, lookups)).toEqual({
      kind: "rdp",
      name: "server-B",
    });
    expect(itemTitle({ kind: "vnc", id: "vnc:v1", connectionId: "b", sessionId: "v1" }, lookups)).toEqual({
      kind: "vnc",
      name: "server-B",
    });
  });

  it("分屏组取宿主实例的标题；首页没有名称", () => {
    expect(itemTitle({ kind: "split", id: "split", host: sshT2, memberIds: ["ssh:t2"] }, lookups)).toEqual({
      kind: "ssh",
      name: "server-A",
      ordinal: 1,
    });
    expect(itemTitle({ kind: "home", id: "home" }, lookups)).toEqual({ kind: "home" });
  });

  it("查不到名称时 name 为 null，回退文案由 UI 决定", () => {
    expect(
      itemTitle({ kind: "ssh", id: "ssh:t9", connectionId: "deleted", ordinal: 0, tabId: "t9" }, lookups),
    ).toEqual({ kind: "ssh", name: null, ordinal: 0 });
  });
});

describe("selectActiveItemId（WS-M03）", () => {
  const items: WorkspaceItem[] = [
    { kind: "home", id: "home" },
    { kind: "ssh", id: "ssh:t1", connectionId: "a", ordinal: 0, tabId: "t1" },
    { kind: "split", id: "split", host: sshT2, memberIds: ["ssh:t2", "local:l1"] },
    { kind: "local", id: "local:l2", ordinal: 1, profileId: "p", source: "local", tabId: "l2" },
    { kind: "rdp", id: "rdp:r1", connectionId: "b", sessionId: "r1" },
    { kind: "vnc", id: "vnc:v1", connectionId: "c", sessionId: "v1" },
  ];
  const idle: ActiveInstanceRefs = {
    localTerminalTabId: null,
    mode: "home",
    rdpSessionId: null,
    showingHome: false,
    splitActive: false,
    terminalTabId: null,
    vncSessionId: null,
  };

  it("显示首页时活动项是首页，即使指针仍指向某个实例", () => {
    expect(selectActiveItemId({ ...idle, mode: "ssh", showingHome: true, terminalTabId: "t1" }, items)).toBe("home");
  });

  it("按 mode 取对应类型的活动实例", () => {
    expect(selectActiveItemId({ ...idle, mode: "ssh", terminalTabId: "t1" }, items)).toBe("ssh:t1");
    expect(selectActiveItemId({ ...idle, localTerminalTabId: "l2", mode: "local", terminalTabId: "t1" }, items)).toBe(
      "local:l2",
    );
    expect(selectActiveItemId({ ...idle, mode: "rdp", rdpSessionId: "r1", terminalTabId: "t1" }, items)).toBe("rdp:r1");
    expect(selectActiveItemId({ ...idle, mode: "vnc", rdpSessionId: "r1", vncSessionId: "v1" }, items)).toBe("vnc:v1");
  });

  it("终端模式下分屏面正在显示时，活动项是分屏组", () => {
    expect(selectActiveItemId({ ...idle, mode: "ssh", splitActive: true, terminalTabId: "t1" }, items)).toBe("split");
  });

  it("活动实例是分屏成员时归到分屏组（pane 内实例不单独成项）", () => {
    expect(selectActiveItemId({ ...idle, localTerminalTabId: "l1", mode: "local" }, items)).toBe("split");
  });

  it("远程桌面模式不受分屏状态影响", () => {
    expect(selectActiveItemId({ ...idle, mode: "rdp", rdpSessionId: "r1", splitActive: true }, items)).toBe("rdp:r1");
  });

  it("活动实例不存在或为空时没有活动项", () => {
    expect(selectActiveItemId({ ...idle, mode: "ssh", terminalTabId: "gone" }, items)).toBeNull();
    expect(selectActiveItemId({ ...idle, mode: "ssh" }, items)).toBeNull();
  });
});
