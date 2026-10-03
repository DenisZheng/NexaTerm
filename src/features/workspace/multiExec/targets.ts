import {
  terminalPaneBindingKey,
  type TerminalPaneBinding,
} from "../../terminal/terminalSplitLayout";

export type MultiExecTargetKind = "ssh" | "local" | "telnet" | "serial";

export interface MultiExecTarget {
  binding: TerminalPaneBinding;
  key: string;
  kind: MultiExecTargetKind;
  ownerId: string;
  sessionId: string;
  tabId: string;
  title: string;
}

interface MultiExecSshTab {
  connectionId: string;
  id: string;
  sessionId?: string | null;
  title: string;
  type: "connecting" | "terminal";
}

interface MultiExecCharacterTab {
  id: string;
  profileId: string;
  sessionId?: string | null;
  source?: "local" | "serial" | "telnet";
  title: string;
}

export function buildMultiExecTargets(input: {
  localTabs: readonly MultiExecCharacterTab[];
  sshTabs: readonly MultiExecSshTab[];
}): MultiExecTarget[] {
  const sshTargets = input.sshTabs.flatMap((tab): MultiExecTarget[] => {
    if (tab.type !== "terminal" || !tab.sessionId) return [];
    const binding: TerminalPaneBinding = { kind: "ssh", tabId: tab.id };
    return [{
      binding,
      key: terminalPaneBindingKey(binding),
      kind: "ssh",
      ownerId: tab.connectionId,
      sessionId: tab.sessionId,
      tabId: tab.id,
      title: tab.title,
    }];
  });

  const characterTargets = input.localTabs.flatMap((tab): MultiExecTarget[] => {
    if (!tab.sessionId) return [];
    const binding: TerminalPaneBinding = { kind: "local", tabId: tab.id };
    return [{
      binding,
      key: terminalPaneBindingKey(binding),
      kind: tab.source === "telnet" ? "telnet" : tab.source === "serial" ? "serial" : "local",
      ownerId: tab.profileId,
      sessionId: tab.sessionId,
      tabId: tab.id,
      title: tab.title,
    }];
  });

  return [...sshTargets, ...characterTargets];
}

export function selectExplicitMultiExecTargets(
  targets: readonly MultiExecTarget[],
  selectedKeys: ReadonlySet<string>,
) {
  return targets.filter((target) => selectedKeys.has(target.key));
}

export function selectLiveFanoutTargets(
  targets: readonly MultiExecTarget[],
  selectedKeys: ReadonlySet<string>,
  sourceKey: string | null,
) {
  return selectExplicitMultiExecTargets(targets, selectedKeys).filter(
    (target) => target.key !== sourceKey,
  );
}

export function multiExecAvailableKeys(targets: readonly MultiExecTarget[]) {
  return new Set(targets.map((target) => target.key));
}
