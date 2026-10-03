export type MultiExecMode = "off" | "live" | "send";

/**
 * MultiExec 统一状态 action。
 * targets 是 terminal instance key（ssh:<tabId> / local:<tabId>）。
 * WS-X04：targets 只能由显式 setTargets 改变；焦点不属于 target mutation 输入。
 */
export type MultiExecAction =
  | { type: "multiExec/setMode"; mode: MultiExecMode }
  /** Split Sync 的过渡兼容入口；后续调用点迁到 setMode 后删除。 */
  | { type: "multiExec/setLive"; enabled: boolean }
  | {
      type: "multiExec/setTargets";
      targets: ReadonlySet<string> | ((current: ReadonlySet<string>) => ReadonlySet<string>);
    }
  | { type: "multiExec/setError"; error: string | null }
  /**
   * 运行实例可用性变化只能收缩 targets。
   * focusedKey 保留到旧 Split controller 完成迁移，但 reducer 必须忽略它，禁止焦点暗中加入目标。
   * splitActive 只服务旧 live Sync 的临时自动关闭；send 不受 Split 活动状态约束。
   */
  | {
      type: "multiExec/targetsAvailable";
      availableKeys: ReadonlySet<string>;
      focusedKey?: string | null;
      splitActive?: boolean;
    };
