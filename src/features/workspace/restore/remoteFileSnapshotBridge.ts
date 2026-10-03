type WorkspaceRemoteFileNavigation = { path: string };

const navigationByStateKey = new Map<string, WorkspaceRemoteFileNavigation>();
const listeners = new Set<() => void>();
let revision = 0;

export function workspaceRemoteFileStateKey(tabId: string) {
  return `ssh-file-panel:${tabId}`;
}

export function getWorkspaceRemoteFileNavigation(stateKey: string) {
  return navigationByStateKey.get(stateKey) || null;
}

export function publishWorkspaceRemoteFileNavigation(stateKey: string, path: string) {
  if (!stateKey || !path) return;
  const current = navigationByStateKey.get(stateKey);
  if (current?.path === path) return;
  navigationByStateKey.set(stateKey, { path });
  revision += 1;
  listeners.forEach((listener) => listener());
}

export function seedWorkspaceRemoteFileDirectories(directories: Readonly<Record<string, string>>) {
  let changed = false;
  for (const [instanceId, path] of Object.entries(directories)) {
    if (!instanceId.startsWith("ssh:") || !path) continue;
    const stateKey = workspaceRemoteFileStateKey(instanceId.slice("ssh:".length));
    if (navigationByStateKey.get(stateKey)?.path === path) continue;
    navigationByStateKey.set(stateKey, { path });
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

export function subscribeWorkspaceRemoteFileNavigation(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getWorkspaceRemoteFileRevision() {
  return revision;
}
