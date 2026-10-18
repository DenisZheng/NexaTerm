import { useI18n } from "../../shared/i18n";
import { AppSelect } from "../../shared/ui/AppSelect";
import { usernameInputAttributes } from "../../shared/ui/inputAttributes";
import { defaultRloginConfig, normalizeTerminalEncoding, terminalEncodingOptions } from "./connectionTypes";
import type { ConnectionProfileInput, RloginConnectionConfig } from "./connectionTypes";

interface Props {
  form: ConnectionProfileInput;
  groupOptions: Array<{ label: string; value: string }>;
  onChange: (form: ConnectionProfileInput) => void;
}

export function RloginConnectionFields({ form, groupOptions, onChange }: Props) {
  const { t } = useI18n();
  const config = { ...defaultRloginConfig, ...form.rlogin };
  const update = (patch: Partial<RloginConnectionConfig>) => onChange({ ...form, rlogin: { ...config, ...patch } });
  return (
    <div className="connection-dialog-fields">
      <p className="connection-dialog-note">{t("connectionDialog.rlogin.description")}</p>
      <div className="form-grid">
        <label><span>{t("connectionDialog.field.nameOptional")}</span><input value={form.name || ""} onChange={(e) => onChange({ ...form, name: e.target.value })} /></label>
        <label><span>{t("connectionDialog.field.group")}</span><AppSelect ariaLabel={t("connectionDialog.field.group")} value={form.group_id || ""} options={[{ label: t("connectionDialog.group.none"), value: "" }, ...groupOptions]} onChange={(group_id) => onChange({ ...form, group: undefined, group_id })} /></label>
        <label><span>{t("connectionDialog.rlogin.remoteAddress")}</span><input required autoComplete="off" spellCheck={false} value={form.host} onChange={(e) => onChange({ ...form, host: e.target.value })} /></label>
        <label><span>{t("connectionDialog.field.port")}</span><input required type="number" min={1} max={65535} value={form.port || ""} onChange={(e) => onChange({ ...form, port: Number(e.target.value) })} /></label>
        <label><span>{t("connectionDialog.rlogin.remoteUser")}</span><input {...usernameInputAttributes} required value={form.username} onChange={(e) => onChange({ ...form, username: e.target.value })} /></label>
        <label><span>{t("connectionDialog.rlogin.localUser")}</span><input {...usernameInputAttributes} required value={config.local_user} onChange={(e) => update({ local_user: e.target.value })} /></label>
        <label><span>{t("connectionDialog.rlogin.localAddress")}</span><input required autoComplete="off" spellCheck={false} value={config.local_address} onChange={(e) => update({ local_address: e.target.value })} /></label>
        <label><span>{t("connectionDialog.advanced.encoding")}</span><AppSelect ariaLabel={t("connectionDialog.advanced.encoding")} value={normalizeTerminalEncoding(form.advanced.terminal_encoding)} options={terminalEncodingOptions} onChange={(value) => onChange({ ...form, advanced: { ...form.advanced, terminal_encoding: normalizeTerminalEncoding(value) } })} /></label>
        <label><span>{t("connectionDialog.rlogin.terminal")}</span><input required autoComplete="off" spellCheck={false} value={config.terminal} onChange={(e) => update({ terminal: e.target.value })} /></label>
        <label><span>{t("connectionDialog.rlogin.speed")}</span><input required type="number" min={1} max={4294967295} value={config.speed || ""} onChange={(e) => update({ speed: Number(e.target.value) })} /></label>
      </div>
      <p className="connection-dialog-note">{t("connectionDialog.rlogin.permissionHint")}</p>
      <label><span>{t("connectionDialog.field.notes")}</span><textarea rows={3} value={form.notes || ""} onChange={(e) => onChange({ ...form, notes: e.target.value })} /></label>
    </div>
  );
}
