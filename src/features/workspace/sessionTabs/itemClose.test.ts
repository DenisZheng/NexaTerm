import { describe, expect, it } from "vitest";

import { closeScopeItemIds, planItemClose, type ItemCloseContext } from "./itemClose";
import type { WorkspaceItem } from "./instances";

const home: WorkspaceItem = { kind: "home", id: "home" };
const sshItem = (tabId: string, connectionId: string, ordinal = 0): WorkspaceItem => ({
  kind: "ssh",
  id: `ssh:${tabId}`,
  connectionId,
  ordinal,
  tabId,
});
const localItem = (tabId: string): WorkspaceItem => ({
  kind: "local",
  id: `local:${tabId}`,
  ordinal: 0,
  profileId: "p",
  source: "local",
  tabId,
});
const rdpItem = (sessionId: string): WorkspaceItem => ({
  kind: "rdp",
  id: `rdp:${sessionId}`,
  connectionId: "r",
  sessionId,
});
const vncItem = (sessionId: string): WorkspaceItem => ({
  kind: "vnc",
  id: `vnc:${sessionId}`,
  connectionId: "v",
  sessionId,
});

const items: WorkspaceItem[] = [home, sshItem("t1", "a"), localItem("l1"), rdpItem("r1"), vncItem("v1")];

describe("closeScopeItemIds", () => {
  it("首页不可关闭：任何范围都不包含首页", () => {
    expect(closeScopeItemIds(items, "home", "self")).toEqual([]);
    expect(closeScopeItemIds(items, "ssh:t1", "all")).toEqual(["ssh:t1", "local:l1", "rdp:r1", "vnc:v1"]);
  });

  it("self / others / right 按顶栏顺序计算", () => {
    expect(closeScopeItemIds(items, "local:l1", "self")).toEqual(["local:l1"]);
    expect(closeScopeItemIds(items, "local:l1", "others")).toEqual(["ssh:t1", "rdp:r1", "vnc:v1"]);
    expect(closeScopeItemIds(items, "local:l1", "right")).toEqual(["rdp:r1", "vnc:v1"]);
  });

  it("目标不存在时 self / right 为空", () => {
    expect(closeScopeItemIds(items, "ssh:gone", "self")).toEqual([]);
    expect(closeScopeItemIds(items, "ssh:gone", "right")).toEqual([]);
  });
});

describe("planItemClose", () => {
  const context: ItemCloseContext = {
    remoteFileConnectionIds: new Set(),
    terminalTabs: [
      { connectionId: "a", id: "t1" },
      { connectionId: "a", id: "t2" },
    ],
  };

  it("按实例类型分组到各自的关闭路径", () => {
    expect(planItemClose(["ssh:t1", "local:l1", "rdp:r1", "vnc:v1"], items, context)).toEqual({
      connectionIds: [],
      localTabIds: ["l1"],
      rdpSessionIds: ["r1"],
      splitGroup: false,
      sshTabIds: ["t1"],
      vncSessionIds: ["v1"],
    });
  });

  it("首页与未知 id 被忽略", () => {
    expect(planItemClose(["home", "ssh:gone"], items, context)).toEqual({
      connectionIds: [],
      localTabIds: [],
      rdpSessionIds: [],
      splitGroup: false,
      sshTabIds: [],
      vncSessionIds: [],
    });
  });

  it("关闭连接的最后一个 SSH 实例且该连接有远程文件 tab 时，改走连接级关闭（WS-E05，脏文件确认在连接级路径内）", () => {
    const withFiles: ItemCloseContext = {
      remoteFileConnectionIds: new Set(["a"]),
      terminalTabs: [{ connectionId: "a", id: "t1" }],
    };
    expect(planItemClose(["ssh:t1"], items, withFiles)).toMatchObject({
      connectionIds: ["a"],
      sshTabIds: [],
    });
  });

  it("同连接还剩其它终端时只关这个实例，远程文件留在该连接工作区", () => {
    const withFiles: ItemCloseContext = { ...context, remoteFileConnectionIds: new Set(["a"]) };
    expect(planItemClose(["ssh:t1"], items, withFiles)).toMatchObject({
      connectionIds: [],
      sshTabIds: ["t1"],
    });
  });

  it("没有远程文件 tab 时，关最后一个终端仍走实例级关闭", () => {
    const single: ItemCloseContext = { ...context, terminalTabs: [{ connectionId: "a", id: "t1" }] };
    expect(planItemClose(["ssh:t1"], items, single)).toMatchObject({ connectionIds: [], sshTabIds: ["t1"] });
  });

  it("分屏组项只标记 splitGroup；其 SSH 成员计入该连接是否全部关闭", () => {
    const split: WorkspaceItem = {
      kind: "split",
      id: "split",
      host: sshItem("t2", "a", 1) as Extract<WorkspaceItem, { kind: "ssh" }>,
      memberIds: ["ssh:t2"],
    };
    const withSplit = [home, sshItem("t1", "a"), split];
    const withFiles: ItemCloseContext = { ...context, remoteFileConnectionIds: new Set(["a"]) };
    expect(planItemClose(["ssh:t1", "split"], withSplit, withFiles)).toEqual({
      connectionIds: ["a"],
      localTabIds: [],
      rdpSessionIds: [],
      splitGroup: true,
      sshTabIds: [],
      vncSessionIds: [],
    });
  });
});
