import type { MultiExecAction, MultiExecMode } from "./actions";

export interface MultiExecState {
  error: string | null;
  mode: MultiExecMode;
  targets: ReadonlySet<string>;
}

export const initialMultiExecState: MultiExecState = {
  error: null,
  mode: "off",
  targets: new Set(),
};

function setsEqual(left: ReadonlySet<string>, right: ReadonlySet<string>) {
  if (left.size !== right.size) return false;
  return Array.from(left).every((value) => right.has(value));
}

export function multiExecReducer(state: MultiExecState, action: MultiExecAction): MultiExecState {
  switch (action.type) {
    case "multiExec/setMode":
      return action.mode === state.mode ? state : { ...state, mode: action.mode };
    case "multiExec/setLive": {
      const mode: MultiExecMode = action.enabled ? "live" : "off";
      return mode === state.mode ? state : { ...state, mode };
    }
    case "multiExec/setTargets": {
      const next =
        typeof action.targets === "function" ? action.targets(state.targets) : action.targets;
      const targets = setsEqual(state.targets, next) ? state.targets : new Set(next);
      return targets === state.targets ? state : { ...state, targets };
    }
    case "multiExec/setError":
      return action.error === state.error ? state : { ...state, error: action.error };
    case "multiExec/targetsAvailable": {
      // WS-X04：availability 只允许移除失效实例。focusedKey 绝不能自动加入 targets。
      const next = new Set(Array.from(state.targets).filter((key) => action.availableKeys.has(key)));
      const targets = setsEqual(state.targets, next) ? state.targets : next;
      // 旧 Split Sync 过渡期仍在离开 Split / 不足两个 pane 时关闭 live；
      // send 已是全局模式，不受 Split 是否活动影响。后续统一 controller 后删除此兼容条件。
      const mode =
        state.mode === "live" &&
        (action.splitActive === false || next.size < 2)
          ? "off"
          : state.mode;
      return targets === state.targets && mode === state.mode ? state : { ...state, mode, targets };
    }
    default:
      return state;
  }
}
