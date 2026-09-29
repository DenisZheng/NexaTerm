// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { ClosePlan, CloseRequest } from "./itemClose";
import { useCloseRequest } from "./useCloseRequest";

// WS-F08：一次关闭操作至多一次确认（未保存编辑的关闭确认不能丢失）；取消不关闭任何项，确认时按当时状态重算后一次执行。

const emptyPlan: ClosePlan = {
  confirmation: null,
  connectionIds: [],
  localTabIds: [],
  rdpSessionIds: [],
  splitGroup: false,
  sshTabIds: [],
  vncSessionIds: [],
};
const plainPlan: ClosePlan = { ...emptyPlan, sshTabIds: ["t1"] };
const confirmPlan: ClosePlan = {
  ...emptyPlan,
  confirmation: { cascadeConnectionCount: 1, dirtyFileNames: ["a.conf"], instanceCount: 2, splitPaneCount: 2 },
  connectionIds: ["a"],
  splitGroup: true,
};
const request: CloseRequest = { instanceIds: ["ssh:t1"], splitGroup: true };

function setup(initialPlan: ClosePlan) {
  let currentPlan = initialPlan;
  const plan = vi.fn((_request: CloseRequest) => currentPlan);
  const execute = vi.fn();
  const hook = renderHook(() => useCloseRequest({ execute, plan }));
  return {
    execute,
    hook,
    plan,
    setPlan: (next: ClosePlan) => {
      currentPlan = next;
    },
  };
}

describe("useCloseRequest", () => {
  it("不需要确认的计划立即执行一次，不进入待确认状态", () => {
    const { execute, hook } = setup(plainPlan);
    act(() => hook.result.current.request(request));
    expect(execute).toHaveBeenCalledTimes(1);
    expect(execute).toHaveBeenCalledWith(plainPlan);
    expect(hook.result.current.pending).toBeNull();
  });

  it("需要确认时只记录待确认项，不执行任何关闭", () => {
    const { execute, hook } = setup(confirmPlan);
    act(() => hook.result.current.request(request));
    expect(execute).not.toHaveBeenCalled();
    expect(hook.result.current.pending).toEqual({ confirmation: confirmPlan.confirmation, request });
  });

  it("取消后不关闭任何项（整次操作原子）", () => {
    const { execute, hook } = setup(confirmPlan);
    act(() => hook.result.current.request(request));
    act(() => hook.result.current.cancel());
    expect(hook.result.current.pending).toBeNull();
    expect(execute).not.toHaveBeenCalled();
  });

  it("确认时按当时状态重算计划，只执行一次", () => {
    const { execute, hook, plan, setPlan } = setup(confirmPlan);
    act(() => hook.result.current.request(request));
    const replanned: ClosePlan = { ...confirmPlan, connectionIds: [], sshTabIds: ["t1"] };
    setPlan(replanned);
    act(() => hook.result.current.confirm());
    expect(plan).toHaveBeenCalledTimes(2);
    expect(plan).toHaveBeenLastCalledWith(request);
    expect(execute).toHaveBeenCalledTimes(1);
    expect(execute).toHaveBeenCalledWith(replanned);
    expect(hook.result.current.pending).toBeNull();
    act(() => hook.result.current.confirm());
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it("确认时实例已全部不存在则不执行", () => {
    const { execute, hook, setPlan } = setup(confirmPlan);
    act(() => hook.result.current.request(request));
    setPlan(emptyPlan);
    act(() => hook.result.current.confirm());
    expect(execute).not.toHaveBeenCalled();
    expect(hook.result.current.pending).toBeNull();
  });

  it("有待确认项时忽略新的关闭请求（模态期间的快捷键等）", () => {
    const { execute, hook, setPlan } = setup(confirmPlan);
    act(() => hook.result.current.request(request));
    setPlan(plainPlan);
    act(() => hook.result.current.request({ instanceIds: ["ssh:t9"], splitGroup: false }));
    expect(execute).not.toHaveBeenCalled();
    expect(hook.result.current.pending?.request).toBe(request);
  });

  it("空计划既不执行也不进入待确认", () => {
    const { execute, hook } = setup(emptyPlan);
    act(() => hook.result.current.request(request));
    expect(execute).not.toHaveBeenCalled();
    expect(hook.result.current.pending).toBeNull();
  });
});
