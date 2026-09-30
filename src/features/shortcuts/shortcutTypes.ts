export type ShortcutActionId = string;
export type ShortcutCategoryId = "general" | "terminal" | "search" | "tools";
export type ShortcutScope = "global" | "workspace" | "terminal" | "terminal-search";

export interface ShortcutCategory {
  id: ShortcutCategoryId;
  label: string;
}

export interface ShortcutAction {
  allowInTerminal: boolean;
  category: ShortcutCategoryId;
  defaultBinding: string | null;
  description: string;
  id: ShortcutActionId;
  label: string;
  scope: ShortcutScope;
}

/** 消费范围与 scope 的键盘上下文规则独立；局部动作不进入全局监听。 */
export type ShortcutDispatch = "global" | "local";

/** 注册表必须显式声明消费范围，保留旧 ShortcutAction 调用契约。 */
export interface RegisteredShortcutAction extends ShortcutAction {
  dispatch: ShortcutDispatch;
}

export interface ParsedShortcutBinding {
  alt: boolean;
  ctrl: boolean;
  key: string;
  meta: boolean;
  shift: boolean;
}

export interface ShortcutConflict {
  actionIds: ShortcutActionId[];
  binding: string;
}
