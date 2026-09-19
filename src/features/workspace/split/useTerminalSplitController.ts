import { useEffect, useMemo, useRef, useState } from "react";

import type { LocalTerminalTab } from "../../terminal/localTerminalTypes";
import {
  collectTerminalSplitPanes,
  createTerminalFourPaneLayout,
  removeTerminalSplitBindings,
  terminalPaneBindingKey,
  terminalPaneBindingsEqual,
  terminalSplitMaxPanes,
  type TerminalPaneBinding,
  type TerminalSplitNode,
  type TerminalSplitPane,
} from "../../terminal/terminalSplitLayout";

/**
 * 分屏宿主：分屏 tab 挂在哪个连接（ssh）或本地终端（local）之下。
 * 从 WorkspaceShell 原样迁出，语义未变。
 */
export type TerminalSplitHost =
  | { connectionId: string; kind: "ssh" }
  | { kind: "local" };

/** 打开 pane 选择器的请求；`key` 单调递增用于触发重新打开同一 pane 的选择器。 */
export interface TerminalSplitPickerOpenRequest {
  key: number;
  paneId: string;
}

/**
 * 分屏 controller 需要从外部读取的状态。
 * 只传 hook 真正读到的字段，避免把整个 WorkspaceShell 状态拖进来。
 */
export interface TerminalSplitControllerInputs {
  /** 当前工作区模式下“活动终端”对应的 binding；作为四宫格重建时的兜底 binding。 */
  activeTerminalSplitBinding: TerminalPaneBinding | null;
  /** 本地终端 tab 列表；用于判断 binding 是否仍可用、以及会话是否已连接。 */
  localTerminalTabs: readonly Pick<LocalTerminalTab, "id" | "sessionId" | "status">[];
  /**
   * 分屏收缩到只剩一个 pane 时，把剩余 binding 切回独立 tab。
   * 这是唯一跨 seam 的副作用（写会话 tab 状态），由调用方提供。
   */
  onCollapseToStandalone: (binding: TerminalPaneBinding) => void;
  /** SSH 终端 tab 列表；同上。 */
  terminalTabs: readonly { id: string; sessionId?: string; status: string }[];
}

/**
 * 分屏（Split）状态 controller —— Task 04 第一刀 1a。
 *
 * 本文件把 WorkspaceShell 中 12 个 useState、3 个 ref 与 4 个归一 effect
 * **原样**迁出，逻辑一行未改，只做位置移动；目的是先用 renderHook 锁住现有行为，
 * 再在 1b 把内部实现换成 useReducer 而用例不变。
 *
 * 归一 effect 的顺序与依赖数组均保持原状；不要在本文件“顺手优化”。
 */
export function useTerminalSplitController(inputs: TerminalSplitControllerInputs) {
  const { activeTerminalSplitBinding, localTerminalTabs, onCollapseToStandalone, terminalTabs } =
    inputs;

  const [terminalSplitLayout, setTerminalSplitLayout] = useState<TerminalSplitNode | null>(null);
  const [terminalSplitHost, setTerminalSplitHost] = useState<TerminalSplitHost | null>(null);
  const [terminalSplitAnchorIndex, setTerminalSplitAnchorIndex] = useState(0);
  const [terminalSplitTabActive, setTerminalSplitTabActive] = useState(false);
  const [focusedTerminalPaneId, setFocusedTerminalPaneId] = useState<string | null>(null);
  const [terminalSplitLayoutRevision, setTerminalSplitLayoutRevision] = useState(0);
  const [terminalSplitAutoCreateSameSession, setTerminalSplitAutoCreateSameSession] =
    useState(true);
  const [terminalSplitPickerOpenRequest, setTerminalSplitPickerOpenRequest] =
    useState<TerminalSplitPickerOpenRequest | null>(null);
  const terminalSplitPickerPendingPaneRef = useRef<string | null>(null);
  const terminalSplitPickerRequestRef = useRef(0);
  const [terminalSplitSyncEnabled, setTerminalSplitSyncEnabled] = useState(false);
  const [terminalSplitSyncParticipantKeys, setTerminalSplitSyncParticipantKeys] =
    useState<Set<string>>(() => new Set());
  const [terminalSplitSyncError, setTerminalSplitSyncError] = useState<string | null>(null);
  const [terminalSplitCloseConfirmOpen, setTerminalSplitCloseConfirmOpen] = useState(false);
  const terminalSplitIdRef = useRef(0);

  // 跨 seam 回调走 ref，避免把调用方每次渲染新建的闭包塞进归一 effect 的依赖数组，
  // 从而保持与原 WorkspaceShell 中 effect 完全相同的触发时机。
  const onCollapseToStandaloneRef = useRef(onCollapseToStandalone);
  onCollapseToStandaloneRef.current = onCollapseToStandalone;

  useEffect(() => {
    if (!terminalSplitLayout) {
      return;
    }
    const availableBindings = new Set([
      ...terminalTabs.map((tab) => terminalPaneBindingKey({ kind: "ssh", tabId: tab.id })),
      ...localTerminalTabs.map((tab) => terminalPaneBindingKey({ kind: "local", tabId: tab.id })),
    ]);
    const currentPanes = collectTerminalSplitPanes(terminalSplitLayout);
    const unavailableBindingKeys = new Set(
      currentPanes.flatMap((pane) =>
        pane.binding && !availableBindings.has(terminalPaneBindingKey(pane.binding))
          ? [terminalPaneBindingKey(pane.binding)]
          : [],
      ),
    );
    const nextLayout = removeTerminalSplitBindings(terminalSplitLayout, unavailableBindingKeys);
    if (!nextLayout) {
      setTerminalSplitLayout(null);
      setTerminalSplitHost(null);
      setTerminalSplitTabActive(false);
      setFocusedTerminalPaneId(null);
      setTerminalSplitSyncEnabled(false);
      setTerminalSplitSyncParticipantKeys(new Set());
      setTerminalSplitSyncError(null);
      return;
    }
    const nextPanes = collectTerminalSplitPanes(nextLayout);
    const focusedPaneExists = focusedTerminalPaneId
      ? nextPanes.some((pane) => pane.id === focusedTerminalPaneId)
      : false;
    if (nextLayout !== terminalSplitLayout) {
      setTerminalSplitLayout(nextLayout);
    }
    if (!focusedPaneExists) {
      setFocusedTerminalPaneId(nextPanes[0]?.id || null);
    }
  }, [
    focusedTerminalPaneId,
    localTerminalTabs,
    terminalSplitLayout,
    terminalTabs,
  ]);

  const terminalSplitPanes = useMemo(
    () => (terminalSplitLayout ? collectTerminalSplitPanes(terminalSplitLayout) : []),
    [terminalSplitLayout],
  );
  const terminalSplitPaneByBinding = useMemo(() => {
    const panes = new Map<string, TerminalSplitPane>();
    terminalSplitPanes.forEach((pane) => {
      if (pane.binding) {
        panes.set(terminalPaneBindingKey(pane.binding), pane);
      }
    });
    return panes;
  }, [terminalSplitPanes]);
  const terminalSplitMemberKeys = useMemo(
    () =>
      new Set(
        terminalSplitPanes.flatMap((pane) =>
          pane.binding ? [terminalPaneBindingKey(pane.binding)] : [],
        ),
      ),
    [terminalSplitPanes],
  );
  const focusedTerminalSplitPane = focusedTerminalPaneId
    ? terminalSplitPanes.find((pane) => pane.id === focusedTerminalPaneId) || null
    : null;
  const focusedTerminalSplitBinding = focusedTerminalSplitPane?.binding || null;
  const terminalSplitExists = Boolean(terminalSplitLayout && terminalSplitPanes.length > 1);
  const terminalSplitActive = terminalSplitExists && terminalSplitTabActive;
  const terminalSplitCanAddPane = terminalSplitPanes.length < terminalSplitMaxPanes;

  function nextTerminalSplitId(prefix: string) {
    terminalSplitIdRef.current += 1;
    return `${prefix}-${terminalSplitIdRef.current.toString()}`;
  }

  function terminalSessionIdForBinding(binding: TerminalPaneBinding) {
    const tab =
      binding.kind === "ssh"
        ? terminalTabs.find((item) => item.id === binding.tabId)
        : localTerminalTabs.find((item) => item.id === binding.tabId);
    if (!tab?.sessionId || (tab.status !== "已连接" && tab.status !== "预览")) {
      return null;
    }
    return tab.sessionId;
  }

  function fallbackTerminalSplitBinding(): TerminalPaneBinding | null {
    if (activeTerminalSplitBinding) {
      return activeTerminalSplitBinding;
    }
    const sshTab = terminalTabs[0];
    if (sshTab) {
      return { kind: "ssh", tabId: sshTab.id };
    }
    const localTab = localTerminalTabs[0];
    return localTab ? { kind: "local", tabId: localTab.id } : null;
  }

  function createTerminalFourPane(bindings: readonly TerminalPaneBinding[]) {
    const ids = {
      bottomLeft: nextTerminalSplitId("terminal-pane"),
      bottomRight: nextTerminalSplitId("terminal-pane"),
      leftSplit: nextTerminalSplitId("terminal-split"),
      rightSplit: nextTerminalSplitId("terminal-split"),
      root: nextTerminalSplitId("terminal-split"),
      topLeft: nextTerminalSplitId("terminal-pane"),
      topRight: nextTerminalSplitId("terminal-pane"),
    };
    const layout = createTerminalFourPaneLayout(bindings, ids);
    const panes = collectTerminalSplitPanes(layout);
    const emptyPane = panes.find((pane) => !pane.binding) || null;
    const focusedPane =
      emptyPane ||
      panes.find((pane) => pane.binding && terminalPaneBindingsEqual(pane.binding, bindings[0])) ||
      panes[0] ||
      null;
    return {
      emptyPaneId: emptyPane?.id || null,
      focusedPaneId: focusedPane?.id || ids.topLeft,
      layout,
    };
  }

  useEffect(() => {
    if (!terminalSplitLayout || terminalSplitPanes.length <= terminalSplitMaxPanes) {
      return;
    }
    const binding =
      focusedTerminalSplitBinding ||
      terminalSplitPanes.find((pane) => pane.binding)?.binding ||
      fallbackTerminalSplitBinding();
    if (!binding) {
      return;
    }
    const bindings = [
      binding,
      ...terminalSplitPanes.flatMap((pane) =>
        pane.binding && !terminalPaneBindingsEqual(pane.binding, binding) ? [pane.binding] : [],
      ),
    ].slice(0, terminalSplitMaxPanes);
    const nextLayout = createTerminalFourPane(bindings);
    setTerminalSplitLayout(nextLayout.layout);
    setFocusedTerminalPaneId(nextLayout.focusedPaneId);
  }, [focusedTerminalSplitBinding, terminalSplitLayout, terminalSplitPanes]);

  useEffect(() => {
    if (!terminalSplitLayout || terminalSplitPanes.length !== 1) {
      return;
    }
    const remainingBinding = terminalSplitPanes[0]?.binding || null;
    setTerminalSplitLayout(null);
    setTerminalSplitHost(null);
    setTerminalSplitTabActive(false);
    setFocusedTerminalPaneId(null);
    setTerminalSplitPickerOpenRequest(null);
    terminalSplitPickerPendingPaneRef.current = null;
    setTerminalSplitSyncEnabled(false);
    setTerminalSplitSyncParticipantKeys(new Set());
    setTerminalSplitSyncError(null);
    if (remainingBinding) {
      onCollapseToStandaloneRef.current(remainingBinding);
    }
  }, [terminalSplitLayout, terminalSplitPanes]);

  useEffect(() => {
    const availableKeys = new Set(
      terminalSplitPanes.flatMap((pane) =>
        pane.binding && terminalSessionIdForBinding(pane.binding)
          ? [terminalPaneBindingKey(pane.binding)]
          : [],
      ),
    );
    setTerminalSplitSyncParticipantKeys((current) => {
      const next = new Set(Array.from(current).filter((key) => availableKeys.has(key)));
      if (terminalSplitSyncEnabled && focusedTerminalSplitBinding) {
        const focusedKey = terminalPaneBindingKey(focusedTerminalSplitBinding);
        if (availableKeys.has(focusedKey)) {
          next.add(focusedKey);
        }
      }
      return setsEqual(current, next) ? current : next;
    });
    if (!terminalSplitActive || availableKeys.size < 2) {
      setTerminalSplitSyncEnabled(false);
    }
  }, [
    focusedTerminalSplitBinding,
    localTerminalTabs,
    terminalSplitActive,
    terminalSplitPanes,
    terminalSplitSyncEnabled,
    terminalTabs,
  ]);

  return {
    createTerminalFourPane,
    fallbackTerminalSplitBinding,
    focusedTerminalPaneId,
    focusedTerminalSplitBinding,
    focusedTerminalSplitPane,
    nextTerminalSplitId,
    setFocusedTerminalPaneId,
    setTerminalSplitAnchorIndex,
    setTerminalSplitAutoCreateSameSession,
    setTerminalSplitCloseConfirmOpen,
    setTerminalSplitHost,
    setTerminalSplitLayout,
    setTerminalSplitLayoutRevision,
    setTerminalSplitPickerOpenRequest,
    setTerminalSplitSyncEnabled,
    setTerminalSplitSyncError,
    setTerminalSplitSyncParticipantKeys,
    setTerminalSplitTabActive,
    terminalSessionIdForBinding,
    terminalSplitActive,
    terminalSplitAnchorIndex,
    terminalSplitAutoCreateSameSession,
    terminalSplitCanAddPane,
    terminalSplitCloseConfirmOpen,
    terminalSplitExists,
    terminalSplitHost,
    terminalSplitLayout,
    terminalSplitLayoutRevision,
    terminalSplitMemberKeys,
    terminalSplitPaneByBinding,
    terminalSplitPanes,
    terminalSplitPickerOpenRequest,
    terminalSplitPickerPendingPaneRef,
    terminalSplitPickerRequestRef,
    terminalSplitSyncEnabled,
    terminalSplitSyncError,
    terminalSplitSyncParticipantKeys,
    terminalSplitTabActive,
  };
}

function setsEqual<T>(left: ReadonlySet<T>, right: ReadonlySet<T>) {
  if (left.size !== right.size) {
    return false;
  }
  return Array.from(left).every((value) => right.has(value));
}
