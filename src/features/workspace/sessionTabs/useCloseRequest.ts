import { useCallback, useRef, useState } from "react";

import { closePlanIsEmpty, type CloseConfirmation, type ClosePlan, type CloseRequest } from "./itemClose";

export interface PendingClose {
  confirmation: CloseConfirmation;
  request: CloseRequest;
}

export interface CloseRequestOptions {
  /** 执行计划：shell 分派到现有关闭路径。 */
  execute: (plan: ClosePlan) => void;
  /** 按当前状态计算计划；请求时与确认时各算一次。 */
  plan: (request: CloseRequest) => ClosePlan;
}

/**
 * 关闭请求的确认状态（WS-F08 未保存编辑的关闭确认）：一次关闭操作至多一次确认，且整次原子——
 * 需要确认时只记录请求、不执行任何关闭；取消即丢弃；确认时按当时状态重算计划后一次执行。
 * 确认期间界面被模态对话框锁定，状态只可能因后台事件（会话退出、运行器窗口关闭）变化，重算只会缩小范围。
 * 有待确认的请求时忽略新的请求（例如模态期间触发的快捷键）。回调经 ref 读取，调用方无需稳定引用。
 */
export function useCloseRequest(options: CloseRequestOptions) {
  const optionsRef = useRef(options);
  optionsRef.current = options;
  // ref 为准、state 只用于渲染：同一事件内的连续请求也能看到最新的待确认项。
  const pendingRef = useRef<PendingClose | null>(null);
  const [pending, setPendingState] = useState<PendingClose | null>(null);

  const setPending = useCallback((value: PendingClose | null) => {
    pendingRef.current = value;
    setPendingState(value);
  }, []);

  const request = useCallback(
    (closeRequest: CloseRequest) => {
      if (pendingRef.current) {
        return;
      }
      const plan = optionsRef.current.plan(closeRequest);
      if (closePlanIsEmpty(plan)) {
        return;
      }
      if (plan.confirmation) {
        setPending({ confirmation: plan.confirmation, request: closeRequest });
        return;
      }
      optionsRef.current.execute(plan);
    },
    [setPending],
  );

  const confirm = useCallback(() => {
    const current = pendingRef.current;
    if (!current) {
      return;
    }
    setPending(null);
    const plan = optionsRef.current.plan(current.request);
    if (!closePlanIsEmpty(plan)) {
      optionsRef.current.execute(plan);
    }
  }, [setPending]);

  const cancel = useCallback(() => setPending(null), [setPending]);

  return { cancel, confirm, pending, request };
}
