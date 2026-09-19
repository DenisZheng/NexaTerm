/**
 * MultiExec action。第一刀只承载原 split sync 状态；第三刀扩展 `send` 模式与 command sender。
 * `targets` 是 pane binding key（`ssh:<tabId>` / `local:<tabId>`）。
 */
export type MultiExecAction =
  | { type: "multiExec/setLive"; enabled: boolean }
  | {
      type: "multiExec/setTargets";
      targets: ReadonlySet<string> | ((current: ReadonlySet<string>) => ReadonlySet<string>);
    }
  | { type: "multiExec/setError"; error: string | null }
  /** 可参与 key 集合变化：收缩 targets，live 下把焦点 key 加回；split 不活动或可用数 < 2 时自动关闭。 */
  | {
      type: "multiExec/targetsAvailable";
      availableKeys: ReadonlySet<string>;
      focusedKey: string | null;
      splitActive: boolean;
    };
