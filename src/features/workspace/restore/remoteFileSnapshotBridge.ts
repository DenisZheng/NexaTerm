type WorkspaceRemoteFileNavigation = { path: string; followTerminalDirectory: boolean };

const navigationByStateKey = new Map<string, WorkspaceRemoteFileNavigation>();
const listeners = new Set<() => void>();
let revision = 0;

export function workspaceRemoteFileStateKey(tabId: string) {
  return `ssh-file-panel:${tabId}`;
}

export function getWorkspaceRemoteFileNavigation(stateKey: string) {
  return navigationByStateKey.get(stateKey) || null;
}

export function publishWorkspaceRemoteFileNavigation(stateKey: string, path: string, followTerminalDirectory = false) {
  if (!stateKey || !path) return;
  const current = navigationByStateKey.get(stateKey);
  if (current?.path === path && current.followTerminalDirectory === followTerminalDirectory) return;
  navigationByStateKey.set(stateKey, { path, followTerminalDirectory });
  revision += 1;
  listeners.forEach((listener) => listener());
}

export function seedWorkspaceRemoteFileDirectories(
  directories: Readonly<Record<string, string>>,
  followTerminalDirectories: Readonly<Record<string, boolean>> = {},
) {
  let changed = false;
  for (const [instanceId, path] of Object.entries(directories)) {
    if (!instanceId.startsWith("ssh:") || !path) continue;
    const stateKey = workspaceRemoteFileStateKey(instanceId.slice("ssh:".length));
    // 旧 V1 快照未保存实例跟随开关，沿用 WS-F03 已确认的默认关闭。
    const followTerminalDirectory = followTerminalDirectories[instanceId] ?? false;
    const current = navigationByStateKey.get(stateKey);
    if (current?.path === path && current.followTerminalDirectory === followTerminalDirectory) continue;
    navigationByStateKey.set(stateKey, { path, followTerminalDirectory });
    changed = true;
  }
  if (changed) {
    revision += 1;
    listeners.forEach((listener) => listener());
  }
}

export function workspaceRemoteFileDirectories(tabIds: readonly string[]) {
  const directories: Record<string, string> = {};
  for (const tabId of tabIds) {
    const path = navigationByStateKey.get(workspaceRemoteFileStateKey(tabId))?.path;
    if (path) directories[`ssh:${tabId}`] = path;
  }
  return directories;
}

export function workspaceRemoteFileFollowStates(tabIds: readonly string[]) {
  const states: Record<string, boolean> = {};
  for (const tabId of tabIds) {
    const navigation = navigationByStateKey.get(workspaceRemoteFileStateKey(tabId));
    if (navigation) states[`ssh:${tabId}`] = navigation.followTerminalDirectory;
  }
  return states;
}

export function subscribeWorkspaceRemoteFileNavigation(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getWorkspaceRemoteFileRevision() {
  return revision;
}
