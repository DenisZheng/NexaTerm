import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import type { ReactNode } from "react";
import { useI18n } from "../i18n";

/** 可取消的多步工作流弹窗；生命周期清理由业务 onClose 统一处理。 */
export function WorkflowDialog({ title, description, children, actions, onClose }: {
  title: string; description: string; children: ReactNode; actions: ReactNode; onClose(): void;
}) {
  const { t } = useI18n();
  return <Dialog.Root open onOpenChange={(open) => { if (!open) onClose(); }}>
    <Dialog.Portal>
      <Dialog.Overlay className="dialog-backdrop" />
      <Dialog.Content className="remote-file-text-dialog workflow-dialog" onInteractOutside={(event) => event.preventDefault()} onPointerDownOutside={(event) => event.preventDefault()}>
        <header className="dialog-head">
          <div className="dialog-title-group">
            <Dialog.Title asChild><strong>{title}</strong></Dialog.Title>
            <Dialog.Description className="dialog-subtitle">{description}</Dialog.Description>
          </div>
          <button className="icon-button dialog-close-button" type="button" aria-label={t("workspace.file.close")} onClick={onClose}><X className="ui-icon" aria-hidden="true" /></button>
        </header>
        <div className="dialog-body">{children}</div>
        <footer className="dialog-actions remote-file-text-actions">{actions}</footer>
      </Dialog.Content>
    </Dialog.Portal>
  </Dialog.Root>;
}
