import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import type { FormEvent } from "react";
import { useI18n } from "../i18n";

interface TextInputDialogProps {
  open: boolean;
  title: string;
  description: string;
  label: string;
  value: string;
  error: string | null;
  busy?: boolean;
  busyLabel?: string;
  onCancel: () => void;
  onChange: (value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}

/** 复用远程命名表单的现有 Radix 与全局样式。 */
export function TextInputDialog({ open, title, description, label, value, error, busy = false, busyLabel, onCancel, onChange, onSubmit }: TextInputDialogProps) {
  const { t } = useI18n();
  return (
    <Dialog.Root open={open} onOpenChange={(next) => { if (!next && !busy) onCancel(); }}>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-backdrop" />
        <Dialog.Content asChild onInteractOutside={(event) => event.preventDefault()} onPointerDownOutside={(event) => event.preventDefault()} onEscapeKeyDown={(event) => { if (busy) event.preventDefault(); }}>
          <form className="remote-file-text-dialog" onSubmit={onSubmit} aria-busy={busy}>
            <header className="dialog-head">
              <div className="dialog-title-group">
                <Dialog.Title asChild><strong>{title}</strong></Dialog.Title>
                <Dialog.Description className="dialog-subtitle">{description}</Dialog.Description>
              </div>
              <button className="icon-button dialog-close-button" type="button" disabled={busy} aria-label={t("workspace.file.close")} onClick={onCancel}>
                <X className="ui-icon" aria-hidden="true" />
              </button>
            </header>
            <div className="dialog-body">
              <label className="remote-file-name-field">
                <span>{label}</span>
                <input autoFocus spellCheck={false} value={value} disabled={busy} onChange={(event) => onChange(event.target.value)} />
              </label>
              {error ? <p className="remote-file-dialog-error" role="alert">{error}</p> : null}
            </div>
            <footer className="dialog-actions remote-file-text-actions">
              <span />
              <button type="button" disabled={busy} onClick={onCancel}>{t("common.cancel")}</button>
              <button className="primary-button" type="submit" disabled={busy}>{busy ? busyLabel : t("common.confirm")}</button>
            </footer>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
