import { describe, expect, it } from "vitest";

import { translate } from "../../shared/i18n";
import type { TitlebarItemLookups } from "./titlebarItems";
import {
  buildTitlebarItems,
  filterTitlebarItems,
  pickVisibleTitlebarItems,
  type TitlebarItem,
} from "./titlebarItems";
import type { WorkspaceItem } from "../workspace/sessionTabs/instances";

const zh = (key: Parameters<typeof translate>[1], params?: Parameters<typeof translate>[2]) =>
  translate("zh-CN", key, params);
const en = (key: Parameters<typeof translate>[1], params?: Parameters<typeof translate>[2]) =>
  translate("en", key, params);

const lookups: TitlebarItemLookups = {
  connectionAddress: (id) => ({ a: "root@10.0.0.1:22", r: "10.0.0.9:3389", tel: "10.0.0.5:23" })[id] ?? null,
  connectionName: (id) => ({ a: "prod", r: "win", tel: "switch" })[id] ?? null,
  localProfileName: (id) => ({ p: "Ubuntu" })[id] ?? null,
};

const sshA0: WorkspaceItem = { kind: "ssh", id: "ssh:t1", connectionId: "a", ordinal: 0, tabId: "t1" };
const sshA1: WorkspaceItem = { kind: "ssh", id: "ssh:t2", connectionId: "a", ordinal: 1, tabId: "t2" };

describe("buildTitlebarItems", () => {
  it("按 WS-E11 生成标题：首个实例不带编号，其后显示 ordinal + 1", () => {
    const items = buildTitlebarItems([sshA0, sshA1], lookups, zh);
    expect(items.map((item) => item.label)).toEqual(["prod · 终端", "prod · 终端 2"]);
  });

  it("本地 / telnet / RDP / VNC / 首页的标题与类型角标", () => {
    const items = buildTitlebarItems(
      [
        { kind: "home", id: "home" },
        { kind: "local", id: "local:l1", ordinal: 0, profileId: "p", source: "local", tabId: "l1" },
        { kind: "local", id: "local:l2", ordinal: 2, profileId: "p", source: "local", tabId: "l2" },
        { kind: "local", id: "local:l3", ordinal: 0, profileId: "tel", source: "telnet", tabId: "l3" },
        { kind: "rdp", id: "rdp:r1", connectionId: "r", sessionId: "r1" },
        { kind: "vnc", id: "vnc:v1", connectionId: "gone", sessionId: "v1" },
      ],
      lookups,
      zh,
    );
    expect(items.map((item) => [item.label, item.badge, item.closable])).toEqual([
      ["首页", null, false],
      ["Ubuntu", "本地", true],
      ["Ubuntu · 3", "本地", true],
      ["switch", "Telnet", true],
      ["win · RDP", "RDP", true],
      ["连接已删除 · VNC", "VNC", true],
    ]);
  });

  it("英文目录下同样的结构", () => {
    const [item] = buildTitlebarItems([sshA1], lookups, en);
    expect(item.label).toBe("prod · Terminal 2");
  });

  it("分屏组标题取宿主实例，角标为分屏；detail 取宿主连接地址", () => {
    const [item] = buildTitlebarItems(
      [{ kind: "split", id: "split", host: sshA1 as Extract<WorkspaceItem, { kind: "ssh" }>, memberIds: ["ssh:t2"] }],
      lookups,
      zh,
    );
    expect(item).toMatchObject({ badge: "分屏", detail: "root@10.0.0.1:22", label: "prod · 终端 2" });
  });
});

const tab = (id: string, label = "server"): TitlebarItem => ({
  badge: "SSH",
  closable: id !== "home",
  detail: null,
  id,
  kind: id === "home" ? "home" : "ssh",
  label,
});

describe("pickVisibleTitlebarItems", () => {
  const many = ["home", "a", "b", "c", "d", "e", "f"].map((id) => tab(id));

  it("宽度足够时全部可见", () => {
    expect(pickVisibleTitlebarItems(many.slice(0, 3), "a", 2000)).toHaveLength(3);
  });

  it("溢出时保留能放下的前几项，活动项被钉进可见集合", () => {
    const visible = pickVisibleTitlebarItems(many, "f", 460);
    expect(visible.map((item) => item.id)).toEqual(["home", "a", "f"]);
  });

  it("宽度未知时退回固定前 4 项并钉住活动项", () => {
    expect(pickVisibleTitlebarItems(many, "f", 0).map((item) => item.id)).toEqual(["home", "a", "b", "f"]);
    expect(pickVisibleTitlebarItems(many, "b", 0).map((item) => item.id)).toEqual(["home", "a", "b", "c"]);
  });
});

describe("filterTitlebarItems", () => {
  const items = [
    { ...tab("a", "prod · 终端"), detail: "root@10.0.0.1:22" },
    { ...tab("b", "win · RDP"), badge: "RDP" },
  ];

  it("空查询返回全部；按标题、地址、角标不区分大小写匹配", () => {
    expect(filterTitlebarItems(items, " ")).toHaveLength(2);
    expect(filterTitlebarItems(items, "PROD").map((item) => item.id)).toEqual(["a"]);
    expect(filterTitlebarItems(items, "10.0.0").map((item) => item.id)).toEqual(["a"]);
    expect(filterTitlebarItems(items, "rdp").map((item) => item.id)).toEqual(["b"]);
  });
});
