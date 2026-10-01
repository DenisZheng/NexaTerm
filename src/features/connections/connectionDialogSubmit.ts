import type { ConnectionProfileInput } from "./connectionTypes";

export type ConnectionSaveIntent = "save" | "save-and-connect";

export interface ConnectionDialogSubmitAction {
  intent: ConnectionSaveIntent;
  label: string;
}

export interface ConnectionDialogSubmitPolicy {
  primary: ConnectionDialogSubmitAction;
  secondary: ConnectionDialogSubmitAction;
}

export function connectionDialogSubmitPolicy(
  editingExisting: boolean,
): ConnectionDialogSubmitPolicy {
  return editingExisting
    ? {
        primary: { intent: "save", label: "保存连接" },
        secondary: { intent: "save-and-connect", label: "保存并新建连接" },
      }
    : {
        primary: { intent: "save-and-connect", label: "保存并连接" },
        secondary: { intent: "save", label: "仅保存" },
      };
}

export function validateConnectionNetworkPath(
  form: ConnectionProfileInput,
): { detail: string; title: string } | null {
  if (form.jump?.kind !== "ssh_jump" || form.jump.jump_connection_id?.trim()) {
    return null;
  }
  return {
    detail: "SSH 跳板机模式需要选择一条已保存连接。",
    title: "请选择跳板机连接",
  };
}
