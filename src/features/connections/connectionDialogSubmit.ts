import { t as tr } from "../../shared/i18n";
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
        primary: { intent: "save", label: tr("connection.submit.save") },
        secondary: { intent: "save-and-connect", label: tr("connection.submit.saveNew") },
      }
    : {
        primary: { intent: "save-and-connect", label: tr("connection.submit.saveConnect") },
        secondary: { intent: "save", label: tr("connection.submit.saveOnly") },
      };
}

export function validateConnectionNetworkPath(
  form: ConnectionProfileInput,
): { detail: string; title: string } | null {
  if (form.jump?.kind !== "ssh_jump" || form.jump.jump_connection_id?.trim()) {
    return null;
  }
  return {
    detail: tr("connection.jump.required.detail"),
    title: tr("connection.jump.required.title"),
  };
}
