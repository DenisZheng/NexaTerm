import * as Dialog from "@radix-ui/react-dialog";
import { AlertTriangle } from "lucide-react";
import { useState } from "react";

interface ConfirmDialogProps {
  cancelLabel?: string;
  confirmLabel?: string;
  description: string;
  open: boolean;
  title: string;
  onConfirm: () => void | Promise<void>;
  onOpenChange: (open: boolean) => void;
}

export function ConfirmDialog({
  cancelLabel = "取消",
  confirmLabel = "确认",
  description,
  open,
  title,
  onConfirm,
  onOpenChange,
}: ConfirmDialogProps) {
  const [busy, setBusy] = useState(false);

  async function confirm() {
    setBusy(true);

    try {
      await onConfirm();
      onOpenChange(false);
    } catch (error) {
      // [WF-02A 验收修复] onConfirm 抛错时也要关闭 dialog 并暴露错误，
      // 否则 dialog 卡开 + busy 恢复 = 用户看到「按钮没反应」。
      console.error("[ConfirmDialog] confirm failed:", error);
      onOpenChange(false);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(nextOpen) => {
        if (!busy) {
          onOpenChange(nextOpen);
        }
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-backdrop confirm-backdrop" />
        <Dialog.Content
          className="confirm-dialog"
          onInteractOutside={(event) => event.preventDefault()}
          onPointerDownOutside={(event) => event.preventDefault()}
        >
          <div className="confirm-dialog-icon" aria-hidden="true">
            <AlertTriangle className="ui-icon" />
          </div>
          <div className="confirm-dialog-copy">
            <Dialog.Title className="confirm-dialog-title">{title}</Dialog.Title>
            <Dialog.Description className="confirm-dialog-description">
              {description}
            </Dialog.Description>
          </div>
          <footer className="confirm-dialog-actions">
            <Dialog.Close asChild>
              <button disabled={busy} type="button">
                {cancelLabel}
              </button>
            </Dialog.Close>
            <button
              className="danger-button"
              disabled={busy}
              type="button"
              onClick={() => void confirm()}
            >
              {confirmLabel}
            </button>
          </footer>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
