import { describe, expect, it } from "vitest";
import { buildWorkspaceShellHydration } from "./shellHydration";
import { toSnapshot } from "./snapshotTypes";
import { buildMultiExecTargets } from "../multiExec/targets";
import { buildWorkspaceActionContext } from "../../layout/workspaceActionContext";
import { buildOpenSessionEntries } from "../../layout/sessionNavigation";
import { buildTitlebarItems } from "../../layout/titlebarItems";
import { selectWorkspaceItems } from "../sessionTabs/instances";
import { translate } from "../../../shared/i18n";
import { batchWorkspaceHandleState, collectBatchOpenConnectionIds } from "../../connections/batchConnectWorkspaceRuntime";

const tab = { id: "test", source: "xdmcp" as const, profileId: "xdmcp-session", ordinal: 0, title: "XDMCP", sessionId: "private-handle", executable: "private-engine", target: "192.0.2.5", allow_network: true };
const collections = { localTerminalTabs: [tab], terminalTabs: [], rdpSessions: [], vncSessions: [] };
const lookups = { connectionAddress: () => "not a connection", connectionName: () => "not a connection", localProfileName: () => "not a profile" };
describe("XDMCP transient non-PTY privacy", () => {
  it("omits the entire instance and injected handles from persistence and MultiExec", () => {
    const saved = toSnapshot({ activeItemId: "local:test", order: ["local:test"], sidebar: { collapsed: false, view: "sessions" }, files: { directories: {}, followActivePane: true }, splitLayout: null }, collections);
    expect(saved.instances).toEqual([]); expect(saved.order).toEqual([]); expect(saved.activeItemId).toBeNull(); expect(buildWorkspaceShellHydration(saved).active.kind).toBe("home");
    for (const value of [tab.profileId, tab.sessionId, tab.executable, tab.target, "allow_network"]) expect(JSON.stringify(saved)).not.toContain(value);
    expect(buildMultiExecTargets({ localTabs: [tab], sshTabs: [] })).toEqual([]);
    const batch = { ...collections, localTerminalTabs: [{ ...tab, status: "xdmcp:querying" }] };
    expect([...collectBatchOpenConnectionIds(batch)]).toEqual([]);
    expect(batchWorkspaceHandleState({ kind: "character", id: tab.id }, batch).status).toBe("failed");
  });
  it("projects a closable named instance but no saved connection or terminal actions", () => {
    const items = selectWorkspaceItems(collections, [], null), t = (key: Parameters<typeof translate>[1]) => translate("en", key);
    expect(items).toHaveLength(2); expect(buildOpenSessionEntries(items, lookups, t)).toEqual([]);
    const titles = buildTitlebarItems(items, lookups, t); expect(JSON.stringify(titles)).toContain("XDMCP"); expect(JSON.stringify(titles)).not.toContain("not a connection");
    const context = buildWorkspaceActionContext({ ...collections, workspaceVisible: true, activeItemId: "local:test", activePaneId: null, workspaceItems: items, splitPanes: [], terminalSearchByTabId: {}, commandSenderTargetCount: 0, canSplitTerminal: true });
    expect(context.instances.find(item => item.id === "local:test")).toMatchObject({ canCreateTerminal: false, canSearch: false, canSplit: false });
  });
});
