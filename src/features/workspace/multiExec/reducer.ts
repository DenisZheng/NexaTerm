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
      // 最后一个目标移除时原子停止 live；调用方的 updater 不得再嵌套 dispatch。
      const mode = state.mode === "live" && targets.size === 0 ? "off" : state.mode;
      return targets === state.targets && mode === state.mode ? state : { ...state, targets, mode };
    }
    case "multiExec/setError":
      return action.error === state.error ? state : { ...state, error: action.error };
    case "multiExec/targetsAvailable": {
      // WS-X04：availability 只允许移除失效实例。focusedKey 绝不能自动加入 targets。
      const next = new Set(Array.from(state.targets).filter((key) => action.availableKeys.has(key)));
      const targets = setsEqual(state.targets, next) ? state.targets : next;
      // 统一 MultiExec 不随 Split/焦点切换关闭；只有全部目标失效时 live 自动回到 off。
      const mode = state.mode === "live" && next.size === 0 ? "off" : state.mode;
      return targets === state.targets && mode === state.mode ? state : { ...state, mode, targets };
    }
    default:
      return state;
  }
}
