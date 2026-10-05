// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ load: vi.fn(), save: vi.fn(), list: vi.fn(), report: vi.fn() }));
vi.mock('../../../shared/tauri/runtime', () => ({ hasTauriRuntime: () => true }));
vi.mock('../../../shared/tauri/commands', () => ({
  workspaceSnapshotLoad: mocks.load,
  workspaceSnapshotSave: mocks.save,
  connectionList: mocks.list,
  connectionDelete: vi.fn(), connectionMarkConnected: vi.fn(),
  connectionProbeSystem: vi.fn(), connectionSetFavorite: vi.fn(), connectionUpsert: vi.fn(),
}));

import { useConnections } from '../../connections/useConnections';
import { useWorkspaceSnapshotLifecycle, type WorkspaceSnapshotRuntime } from './useWorkspaceSnapshotLifecycle';
import type { WorkspaceSnapshotV1 } from './snapshotTypes';

const runtime: WorkspaceSnapshotRuntime = {
  load: mocks.load,
  save: mocks.save,
  reportError: mocks.report,
  schedule(callback, delayMs) {
    const timer = window.setTimeout(callback, delayMs);
    return () => window.clearTimeout(timer);
  },
};

const empty: WorkspaceSnapshotV1 = {
  version: 1, activeItemId: 'home', instances: [], order: [], panes: null,
  files: { directories: {}, followActivePane: true },
  sidebar: { collapsed: false, view: 'sessions' },
};
const saved: WorkspaceSnapshotV1 = {
  ...empty,
  activeItemId: 'ssh:a',
  instances: [{ id: 'ssh:a', kind: 'ssh', ordinal: 0, target: { kind: 'profile', profileId: 'p' } }],
  order: ['ssh:a'],
};
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}
beforeEach(() => { vi.useFakeTimers(); mocks.save.mockResolvedValue(undefined); });
afterEach(() => { cleanup(); vi.useRealTimers(); vi.resetAllMocks(); });

describe('WF-07 review: real lifecycle hooks', () => {
  it('control: restores when readiness and snapshot stay stable during load', async () => {
    mocks.load.mockResolvedValue({ current: saved, backup: null });
    const restored = vi.fn();
    renderHook(() => useWorkspaceSnapshotLifecycle({ runtime,
      enabled: true, restoreOnLaunch: true, snapshot: empty, onRestore: restored,
    }));
    await act(async () => {});
    expect(restored).toHaveBeenCalledOnce();
  });

  it('control: saves after 500 ms without parent rerenders', async () => {
    mocks.load.mockResolvedValue({ current: null, backup: null });
    const hook = renderHook(({ value }) => useWorkspaceSnapshotLifecycle({ runtime,
      enabled: true, restoreOnLaunch: true, snapshot: value, onRestore: vi.fn(),
    }), { initialProps: { value: empty } });
    await act(async () => {});
    hook.rerender({ value: saved });
    await act(async () => { await vi.advanceTimersByTimeAsync(500); });
    expect(mocks.save).toHaveBeenCalledOnce();
  });

  it('restores after vault readiness causes useConnections to reload', async () => {
    const profiles = deferred<never[]>();
    const snapshot = deferred<{ current: WorkspaceSnapshotV1; backup: null }>();
    mocks.list.mockReturnValue(profiles.promise);
    mocks.load.mockReturnValue(snapshot.promise);
    const restored = vi.fn();
    const hook = renderHook(({ storageReady }) => {
      const { loading } = useConnections({ enabled: storageReady });
      useWorkspaceSnapshotLifecycle({ runtime,
        enabled: storageReady && !loading,
        restoreOnLaunch: true, snapshot: empty, onRestore: restored,
      });
    }, { initialProps: { storageReady: false } });
    hook.rerender({ storageReady: true });
    await act(async () => { profiles.resolve([]); });
    await act(async () => { snapshot.resolve({ current: saved, backup: null }); });
    expect(restored, 'snapshot must restore after the profile list becomes ready').toHaveBeenCalledOnce();
  });

  it('does not discard a pending restore when sidebar state changes', async () => {
    const snapshot = deferred<{ current: WorkspaceSnapshotV1; backup: null }>();
    mocks.load.mockReturnValue(snapshot.promise);
    const restored = vi.fn();
    const hook = renderHook(({ value }) => useWorkspaceSnapshotLifecycle({ runtime,
      enabled: true, restoreOnLaunch: true, snapshot: value, onRestore: restored,
    }), { initialProps: { value: empty } });
    hook.rerender({ value: { ...empty, sidebar: { ...empty.sidebar, view: 'files' } } });
    await act(async () => { snapshot.resolve({ current: saved, backup: null }); });
    expect(restored, 'an ordinary rerender must not permanently disable restoration').toHaveBeenCalledOnce();
  });

  it('persists a stable snapshot despite unrelated parent rerenders', async () => {
    mocks.load.mockResolvedValue({ current: null, backup: null });
    const hook = renderHook(({ value }) => useWorkspaceSnapshotLifecycle({ runtime,
      enabled: true, restoreOnLaunch: true, snapshot: value, onRestore: vi.fn(),
    }), { initialProps: { value: empty } });
    await act(async () => {});
    hook.rerender({ value: saved });
    for (let index = 0; index < 10; index++) {
      await act(async () => { await vi.advanceTimersByTimeAsync(100); });
      hook.rerender({ value: structuredClone(saved) });
    }
    expect(mocks.save, 'stable workspace data should save after 500 ms').toHaveBeenCalledOnce();
  });

  it('waits for the previous save before writing a newer layout', async () => {
    mocks.load.mockResolvedValue({ current: null, backup: null });
    const firstSave = deferred<void>();
    mocks.save.mockReturnValueOnce(firstSave.promise);
    const hook = renderHook(({ value }) => useWorkspaceSnapshotLifecycle({
      runtime, enabled: true, restoreOnLaunch: true, snapshot: value, onRestore: vi.fn(),
    }), { initialProps: { value: empty } });
    await act(async () => {});
    hook.rerender({ value: saved });
    await act(async () => { await vi.advanceTimersByTimeAsync(500); });
    const latest = { ...saved, sidebar: { ...saved.sidebar, collapsed: true } };
    hook.rerender({ value: latest });
    await act(async () => { await vi.advanceTimersByTimeAsync(500); });
    expect(mocks.save).toHaveBeenCalledTimes(1);
    await act(async () => { firstSave.resolve(); });
    expect(mocks.save.mock.calls.map(([value]) => value)).toEqual([saved, latest]);
  });

  it('does not restore or save after unmount', async () => {
    const snapshot = deferred<{ current: WorkspaceSnapshotV1; backup: null }>();
    mocks.load.mockReturnValue(snapshot.promise);
    const restored = vi.fn();
    const hook = renderHook(() => useWorkspaceSnapshotLifecycle({
      runtime, enabled: true, restoreOnLaunch: true, snapshot: empty, onRestore: restored,
    }));
    hook.unmount();
    await act(async () => { snapshot.resolve({ current: saved, backup: null }); });
    expect(restored).not.toHaveBeenCalled();
    expect(mocks.save).not.toHaveBeenCalled();
  });

  it('reports a failed save and still saves a subsequent layout', async () => {
    mocks.load.mockResolvedValue({ current: null, backup: null });
    const error = new Error('storage unavailable');
    mocks.save.mockRejectedValueOnce(error);
    const hook = renderHook(({ value }) => useWorkspaceSnapshotLifecycle({
      runtime, enabled: true, restoreOnLaunch: true, snapshot: value, onRestore: vi.fn(),
    }), { initialProps: { value: empty } });
    await act(async () => {});
    hook.rerender({ value: saved });
    await act(async () => { await vi.advanceTimersByTimeAsync(500); });
    expect(mocks.report).toHaveBeenCalledWith('save', error);
    hook.rerender({ value: { ...saved, activeItemId: 'home' } });
    await act(async () => { await vi.advanceTimersByTimeAsync(500); });
    expect(mocks.save).toHaveBeenCalledTimes(2);
  });
});
