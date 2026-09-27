import { describe, expect, it } from "vitest";

import {
  closePlanIsEmpty,
  closeRequestFromItems,
  closeScopeItemIds,
  planClose,
  type CloseContext,
} from "./itemClose";
import type { WorkspaceItem } from "./instances";

// 假数据：连接 / 文件名均为占位串，不含真实主机或凭据。

const home: WorkspaceItem = { kind: "home", id: "home" };
const sshItem = (tabId: string, connectionId: string, ordinal = 0): Extract<WorkspaceItem, { kind: "ssh" }> => ({
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
const splitItem = (memberIds: string[]): WorkspaceItem => ({
  kind: "split",
  id: "split",
  host: sshItem("t1", "a"),
  memberIds,
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

describe("closeRequestFromItems", () => {
  it("实例项按 id 关闭；分屏组项表示拆组（成员由计划按当时状态展开）；首页与未知 id 忽略", () => {
    const withSplit = [...items, splitItem(["ssh:t2", "local:l2"])];
    expect(closeRequestFromItems(["home", "ssh:t1", "split", "vnc:v1", "ssh:gone"], withSplit)).toEqual({
      instanceIds: ["ssh:t1", "vnc:v1"],
      splitGroup: true,
    });
  });
});

const baseContext: CloseContext = {
  localTerminalTabs: [{ id: "l1" }, { id: "l2" }],
  rdpSessions: [{ id: "r1" }],
  remoteFileTabs: [],
  splitMemberIds: [],
  terminalTabs: [
    { connectionId: "a", id: "t1" },
    { connectionId: "a", id: "t2" },
    { connectionId: "b", id: "t3" },
  ],
  vncSessions: [{ id: "v1" }],
};
const file = (connectionId: string, name: string, dirty = false) => ({ connectionId, dirty, name });

describe("planClose（WS-E05 连带 / WS-F08 确认）", () => {
  it("按实例类型分组到各自的关闭路径；不需要确认", () => {
    expect(
      planClose({ instanceIds: ["ssh:t3", "local:l1", "rdp:r1", "vnc:v1"], splitGroup: false }, baseContext),
    ).toEqual({
      confirmation: null,
      connectionIds: [],
      localTabIds: ["l1"],
      rdpSessionIds: ["r1"],
      splitGroup: false,
      sshTabIds: ["t3"],
      vncSessionIds: ["v1"],
    });
  });

  it("已不存在的实例被忽略，计划为空（确认时按当时状态重算用得到）", () => {
    const plan = planClose({ instanceIds: ["ssh:gone", "local:gone", "rdp:gone"], splitGroup: false }, baseContext);
    expect(closePlanIsEmpty(plan)).toBe(true);
    expect(plan.confirmation).toBeNull();
  });

  it("连接的终端全部被关且有远程文件：改走连接级关闭，远程文件随之关闭；文件都已保存时不需要确认", () => {
    const context = { ...baseContext, remoteFileTabs: [file("a", "app.yaml")] };
    expect(planClose({ instanceIds: ["ssh:t1", "ssh:t2"], splitGroup: false }, context)).toMatchObject({
      confirmation: null,
      connectionIds: ["a"],
      sshTabIds: [],
    });
  });

  it("同连接还剩终端时只关实例，远程文件留在该连接工作区", () => {
    const context = { ...baseContext, remoteFileTabs: [file("a", "app.yaml", true)] };
    expect(planClose({ instanceIds: ["ssh:t1"], splitGroup: false }, context)).toMatchObject({
      confirmation: null,
      connectionIds: [],
      sshTabIds: ["t1"],
    });
  });

  it("P1：拆分屏组时成员参与连接判断——分屏里是该连接最后的终端时，远程文件一并关闭", () => {
    const context: CloseContext = {
      ...baseContext,
      remoteFileTabs: [file("a", "app.yaml")],
      splitMemberIds: ["ssh:t1", "ssh:t2", "local:l1"],
    };
    expect(planClose({ instanceIds: [], splitGroup: true }, context)).toEqual({
      confirmation: { cascadeConnectionCount: 1, dirtyFileNames: [], instanceCount: 3, splitPaneCount: 3 },
      connectionIds: ["a"],
      localTabIds: ["l1"],
      rdpSessionIds: [],
      splitGroup: true,
      sshTabIds: [],
      vncSessionIds: [],
    });
  });

  it("会丢弃未保存修改时需要确认，列出文件名；只列被连带关闭连接的文件", () => {
    const context = {
      ...baseContext,
      remoteFileTabs: [file("a", "nginx.conf", true), file("a", "notes.md"), file("b", "other.conf", true)],
    };
    expect(planClose({ instanceIds: ["ssh:t1", "ssh:t2"], splitGroup: false }, context).confirmation).toEqual({
      cascadeConnectionCount: 1,
      dirtyFileNames: ["nginx.conf"],
      instanceCount: 2,
      splitPaneCount: 0,
    });
  });

  it("分屏组只剩一个成员、且没有未保存文件时不需要确认", () => {
    const context = { ...baseContext, splitMemberIds: ["local:l1"] };
    expect(planClose({ instanceIds: [], splitGroup: true }, context)).toMatchObject({
      confirmation: null,
      localTabIds: ["l1"],
      splitGroup: true,
    });
  });

  it("全部关闭同时包含分屏组与未保存文件：一次确认汇总两者", () => {
    const withSplit: WorkspaceItem[] = [home, sshItem("t3", "b"), splitItem(["ssh:t1", "ssh:t2"]), localItem("l1")];
    const context: CloseContext = {
      ...baseContext,
      remoteFileTabs: [file("a", "nginx.conf", true), file("b", "readme.md")],
      splitMemberIds: ["ssh:t1", "ssh:t2"],
    };
    const request = closeRequestFromItems(closeScopeItemIds(withSplit, "ssh:t3", "all"), withSplit);
    expect(planClose(request, context)).toEqual({
      confirmation: { cascadeConnectionCount: 2, dirtyFileNames: ["nginx.conf"], instanceCount: 4, splitPaneCount: 2 },
      connectionIds: ["a", "b"],
      localTabIds: ["l1"],
      rdpSessionIds: [],
      splitGroup: true,
      sshTabIds: [],
      vncSessionIds: [],
    });
  });

  it("关闭右侧只含分屏组时，组外同连接的终端保留，远程文件不连带", () => {
    const context: CloseContext = {
      ...baseContext,
      remoteFileTabs: [file("a", "nginx.conf", true)],
      splitMemberIds: ["ssh:t2"],
    };
    expect(planClose({ instanceIds: [], splitGroup: true }, context)).toMatchObject({
      confirmation: null,
      connectionIds: [],
      sshTabIds: ["t2"],
      splitGroup: true,
    });
  });

  it("不修改输入", () => {
    const request = Object.freeze({ instanceIds: Object.freeze(["ssh:t1", "ssh:t2"]), splitGroup: false });
    const context = Object.freeze({ ...baseContext, remoteFileTabs: Object.freeze([file("a", "x")]) });
    expect(() => planClose(request, context)).not.toThrow();
  });
});
