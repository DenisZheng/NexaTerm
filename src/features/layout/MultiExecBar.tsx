import { Check, CircleAlert, Keyboard, Send, X } from "lucide-react";

import { useI18n } from "../../shared/i18n";
import { Tooltip } from "../../shared/ui/Tooltip";
import type { MultiExecMode } from "../workspace/multiExec/actions";
import type { MultiExecTarget } from "../workspace/multiExec/targets";

export interface MultiExecBarProps {
  readonly error: string | null;
  readonly mode: MultiExecMode;
  readonly selectedKeys: ReadonlySet<string>;
  readonly targets: readonly MultiExecTarget[];
  readonly onClose: () => void;
  readonly onOpenCommandSender: () => void;
  readonly onStartLive: () => void;
  readonly onStop: () => void;
  readonly onToggleTarget: (key: string, selected: boolean) => void;
}

/** WF-04C 顶层 MultiExec 底栏：目标勾选 + Live/停止 + 发送入口（纯展示，状态由 Shell 注入）。 */
export function MultiExecBar({
  error, mode, selectedKeys, targets, onClose, onOpenCommandSender, onStartLive, onStop, onToggleTarget,
}: MultiExecBarProps) {
  const { t } = useI18n();
  const live = mode === "live";
  const selectedCount = targets.filter((target) => selectedKeys.has(target.key)).length;
  const canStartLive = selectedCount > 0;

  return (
    <section className="multi-exec-bar" aria-label={t("multiExec.title")}>
      <div className="multi-exec-bar-head">
        <span className="multi-exec-bar-title">{t("multiExec.title")}</span>
        <div className="multi-exec-bar-modes" role="group" aria-label={t("multiExec.title")}>
          <Tooltip label={live || canStartLive ? t("multiExec.live") : t("multiExec.liveHint")}>
            <button
              className={`text-tool-button multi-exec-bar-mode ${live ? "active" : ""}`}
              type="button"
              aria-pressed={live}
              disabled={!live && !canStartLive}
              onClick={() => (live ? onStop() : onStartLive())}
            >
              <Keyboard className="ui-icon" aria-hidden="true" />
              <span>{t("multiExec.live")}</span>
            </button>
          </Tooltip>
          <button className={`text-tool-button multi-exec-bar-mode ${mode === "send" ? "active" : ""}`}
            type="button" disabled={targets.length === 0} aria-pressed={mode === "send"} onClick={onOpenCommandSender}>
            <Send className="ui-icon" aria-hidden="true" />
            <span>{t("multiExec.send")}</span>
          </button>
        </div>
        {live ? (
          <>
            <span className="multi-exec-bar-status" role="status" aria-atomic="true">
              <span className="multi-exec-bar-dot" aria-hidden="true" />
              {t("multiExec.active", { count: selectedCount })}
            </span>
            <button className="text-tool-button multi-exec-bar-stop" type="button" onClick={onStop}>
              {t("multiExec.stop")}
            </button>
          </>
        ) : null}
        <Tooltip label={t("multiExec.close")}>
          <button className="icon-button multi-exec-bar-close" type="button" aria-label={t("multiExec.close")} onClick={onClose}>
            <X className="ui-icon" aria-hidden="true" />
          </button>
        </Tooltip>
      </div>
      <div className="multi-exec-bar-targets" role="group" aria-label={t("multiExec.targets")}>
        {targets.length === 0 ? (
          <span className="multi-exec-bar-empty" role="status">{t("multiExec.empty")}</span>
        ) : (
          targets.map((target) => {
            const selected = selectedKeys.has(target.key);
            return (
              <Tooltip key={target.key} label={target.title}><button
                className={`text-tool-button multi-exec-bar-target ${selected ? "selected" : ""}`}
                type="button"
                aria-pressed={selected}
                onClick={() => onToggleTarget(target.key, !selected)}
              >
                <span className="terminal-split-menu-check" aria-hidden="true">
                  {selected ? <Check className="ui-icon" /> : null}
                </span>
                <span className="multi-exec-bar-target-label">{target.title}</span>
              </button></Tooltip>
            );
          })
        )}
      </div>
      {error ? (
        <div className="multi-exec-bar-error" role="alert">
          <CircleAlert className="ui-icon" aria-hidden="true" />
          <span>{error}</span>
        </div>
      ) : null}
    </section>
  );
}
