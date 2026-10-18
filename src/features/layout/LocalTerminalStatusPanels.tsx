import { TerminalStatePanel } from "../../shared/ui/TerminalStatePanel";
import type { CSSProperties } from "react";
import { CircleAlert, Loader2, Play, RefreshCw } from "lucide-react";
import { t as tr, useI18n } from "../../shared/i18n";
import type { LocalTerminalProfile } from "../terminal/localTerminalTypes";
import { LocalTerminalIcon } from "../terminal/LocalTerminalIcons";
import { terminalStatusLabel } from "../terminal/terminalStatusLabel";

export function LocalTerminalEmptyPanel({
  active,
  error,
  loading,
  profileName,
  onOpenDefault,
  onOpenSettings,
}: {
  active: boolean;
  error: string | null;
  loading: boolean;
  profileName: string | null;
  onOpenDefault: () => void;
  onOpenSettings: () => void;
}) {
  return (
    <section
      className={`terminal-direct-status local-terminal-empty ${active ? "" : "is-hidden"}`}
      aria-label={tr("workspace.local.emptyAria")}
      aria-hidden={!active}
    >
      <div>
        {loading ? (
          <Loader2 className="ui-icon spin" aria-hidden="true" />
        ) : error ? (
          <CircleAlert className="ui-icon" aria-hidden="true" />
        ) : (
          <LocalTerminalIcon className="ui-icon" kind={profileName ? "powershell_core" : "custom"} />
        )}
        <strong>{loading ? tr("workspace.local.detecting") : tr("workspace.local.open")}</strong>
        <span>
          {error
            ? error
            : profileName
              ? tr("workspace.local.defaultHint", { name: profileName })
              : tr("workspace.local.noTypeHint")}
        </span>
        <div className="local-terminal-status-actions">
          <button className="primary-button" type="button" disabled={!profileName || loading} onClick={onOpenDefault}>
            <Play className="ui-icon" aria-hidden="true" />
            {tr("workspace.local.openDefault")}
          </button>
          <button type="button" onClick={onOpenSettings}>
            {tr("workspace.local.openSettings")}
          </button>
        </div>
      </div>
    </section>
  );
}

export function LocalTerminalStatusPanel({
  active,
  className,
  error,
  onPaneFocus,
  profile,
  source,
  status,
  style,
  title,
  visible = active,
  onOpenSettings,
  onRetry,
}: {
  active: boolean;
  className?: string;
  error: string | null;
  onPaneFocus?: () => void;
  profile: LocalTerminalProfile | null;
  source: "local" | "telnet" | "serial";
  status: string;
  style?: CSSProperties;
  title: string;
  visible?: boolean;
  onOpenSettings: () => void;
  onRetry?: () => void;
}) {
  const { t } = useI18n();
  const failed = status === "连接失败";
  const subject = source === "telnet" ? tr("workspace.local.telnetSession") : source === "serial" ? tr("workspace.local.serialSession") : tr("workspace.local.subject");
  const description = profile ? `${profile.name} · ${profile.command}` : title;

  return <TerminalStatePanel ariaLabel={`${title} ${tr("workspace.local.state")}`} visible={visible}
    className={`local-terminal-status ${failed ? "is-error" : "is-loading"} ${className || ""}`} style={style} onPaneFocus={onPaneFocus}
    icon={failed ? <CircleAlert className="ui-icon" aria-hidden="true"/> : <Loader2 className="ui-icon spin" aria-hidden="true"/>}
    message={failed ? tr("workspace.local.openFailed", {subject}) : terminalStatusLabel(status,t)} description={description} error={error}
    actions={failed && onRetry ? <div className="local-terminal-status-actions">
      <button className="primary-button" type="button" onClick={onRetry}><RefreshCw className="ui-icon" aria-hidden="true"/>{tr("workspace.rdp.retry")}</button>
      {source === "local" ? <button type="button" onClick={onOpenSettings}>{tr("workspace.local.openSettings")}</button> : null}
    </div> : undefined}/>;

}
