import type { MultiExecAction } from "./actions";

export interface MultiExecState {
  error: string | null;
  mode: "off" | "live";
  targets: ReadonlySet<string>;
}

export const initialMultiExecState: MultiExecState = {
  error: null,
  mode: "off",
  targets: new Set(),
};

function setsEqual(left: ReadonlySet<string>, right: ReadonlySet<string>) {
  if (left.size !== right.size) {
    return false;
  }
  return Array.from(left).every((value) => right.has(value));
}

export function multiExecReducer(state: MultiExecState, action: MultiExecAction): MultiExecState {
  switch (action.type) {
    case "multiExec/setLive": {
      const mode = action.enabled ? "live" : "off";
      return mode === state.mode ? state : { ...state, mode };
    }
    case "multiExec/setTargets": {
      const targets =
        typeof action.targets === "function" ? action.targets(state.targets) : action.targets;
      return targets === state.targets ? state : { ...state, targets };
    }
    case "multiExec/setError":
      return action.error === state.error ? state : { ...state, error: action.error };
    case "multiExec/targetsAvailable": {
      // 对应原 WorkspaceShell 的 sync 参与者归一 effect：先收缩参与者，再判断是否自动关闭。
      const next = new Set(Array.from(state.targets).filter((key) => action.availableKeys.has(key)));
      if (state.mode === "live" && action.focusedKey && action.availableKeys.has(action.focusedKey)) {
        next.add(action.focusedKey);
      }
      const targets = setsEqual(state.targets, next) ? state.targets : next;
      const mode = !action.splitActive || action.availableKeys.size < 2 ? "off" : state.mode;
      return targets === state.targets && mode === state.mode ? state : { ...state, mode, targets };
    }
    default:
      return state;
  }
}
