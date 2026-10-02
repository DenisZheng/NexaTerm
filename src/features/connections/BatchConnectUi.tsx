import * as Dialog from "@radix-ui/react-dialog";
import {
  Check,
  CircleAlert,
  Loader2,
  Play,
  RefreshCw,
  Square,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { useI18n, type Translate } from "../../shared/i18n";
import {
  batchConnectMaxNewSessions,
  buildBatchConnectPreviewPlan,
  type BatchConnectItemStatus,
  type BatchConnectRun,
} from "./batchConnectModel";
import type { ConnectionGroup } from "./connectionGroupModel";
import { ConnectionSystemLogo } from "./ConnectionSystemLogo";
import type { ConnectionProfile } from "./connectionTypes";

export interface ConnectionPaneBatchConnectController {
  active: boolean;
  cancelRemaining(): Promise<void>;
  dismiss(): boolean;
  focus(connectionId: string): void;
  groupId: string | null;
  openConnectionIds: ReadonlySet<string>;
  retryFailed(): boolean;
  run: BatchConnectRun | null;
  start(groupId: string, connectionIds: readonly string[]): boolean;
}

export function BatchConnectPreviewDialog({
  connections,
  controller,
  groups,
  onOpenChange,
  targetGroupId,
}: {
  connections: readonly ConnectionProfile[];
  controller: ConnectionPaneBatchConnectController;
  groups: readonly ConnectionGroup[];
  onOpenChange(open: boolean): void;
  targetGroupId: string | null;
}) {
  const { t } = useI18n();
  const [includeDescendants, setIncludeDescendants] = useState(true);
  const plan = useMemo(
    () =>
      targetGroupId
        ? buildBatchConnectPreviewPlan({
            connections,
            groups,
            includeDescendants,
            openConnectionIds: controller.openConnectionIds,
            rootGroupId: targetGroupId,
          })
        : null,
    [
      connections,
      controller.openConnectionIds,
      groups,
      includeDescendants,
      targetGroupId,
    ],
  );
  const [selected, setSelected] = useState<Set<string>>(new Set());

  useEffect(() => {
    setSelected(new Set(plan?.selectedConnectionIds || []));
  }, [plan]);

  const targetGroup = targetGroupId
    ? groups.find((group) => group.id === targetGroupId) || null
    : null;
  const atLimit = selected.size >= batchConnectMaxNewSessions;

  return (
    <Dialog.Root
      open={Boolean(targetGroupId)}
      onOpenChange={(open) => onOpenChange(open)}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-backdrop" />
        <Dialog.Content className="batch-connect-dialog">
          <header className="dialog-head">
            <div className="dialog-title-group">
              <Dialog.Title>{t("batchConnect.title")}</Dialog.Title>
              <Dialog.Description className="dialog-subtitle">
                {t("batchConnect.subtitle", {
                  group: targetGroup?.name || "",
                  max: batchConnectMaxNewSessions,
                })}
              </Dialog.Description>
            </div>
            <Dialog.Close asChild>
              <button
                className="icon-button dialog-close-button"
                type="button"
                aria-label={t("batchConnect.close")}
              >
                <X className="ui-icon" aria-hidden="true" />
              </button>
            </Dialog.Close>
          </header>

          <div className="batch-connect-options">
            <label className="batch-connect-toggle">
              <input
                checked={includeDescendants}
                type="checkbox"
                onChange={(event) => setIncludeDescendants(event.target.checked)}
              />
              <span>{t("batchConnect.includeDescendants")}</span>
            </label>
            <span className="batch-connect-selection-count">
              {t("batchConnect.selected", {
                count: selected.size,
                max: batchConnectMaxNewSessions,
              })}
            </span>
          </div>

          {plan?.selectionLimitReached || atLimit ? (
            <p className="batch-connect-limit-note" role="status">
              {t("batchConnect.limit", { max: batchConnectMaxNewSessions })}
            </p>
          ) : null}

          <div className="batch-connect-candidates" role="list">
            {plan && plan.candidates.length > 0 ? (
              plan.candidates.map((candidate) => {
                const connection =
                  connections.find((item) => item.id === candidate.connectionId) || null;
                const checked = selected.has(candidate.connectionId);
                const disabled = !checked && atLimit;
                return (
                  <label
                    className={"batch-connect-candidate " + (checked ? "selected" : "")}
                    key={candidate.connectionId}
                  >
                    <input
                      checked={checked}
                      disabled={disabled}
                      type="checkbox"
                      onChange={() => toggleCandidate(candidate.connectionId)}
                    />
                    {connection ? (
                      <ConnectionSystemLogo connection={connection} compact decorative />
                    ) : (
                      <Square className="ui-icon" aria-hidden="true" />
                    )}
                    <span className="batch-connect-candidate-copy">
                      <strong>{candidate.name}</strong>
                      <small>
                        {candidate.protocol.toUpperCase()} · {candidate.groupPath}
                      </small>
                    </span>
                    <span className="batch-connect-candidate-flags">
                      {candidate.alreadyOpen ? (
                        <span>{t("batchConnect.alreadyOpen")}</span>
                      ) : null}
                      {candidate.requiresInteraction ? (
                        <span>{t("batchConnect.interactive")}</span>
                      ) : null}
                    </span>
                  </label>
                );
              })
            ) : (
              <p className="batch-connect-empty">{t("batchConnect.none")}</p>
            )}
          </div>

          <footer className="dialog-actions batch-connect-actions">
            <span className="batch-connect-dialog-hint">
              {controller.active ? t("batchConnect.busy") : ""}
            </span>
            <Dialog.Close asChild>
              <button type="button">
                <X className="ui-icon" aria-hidden="true" />
                <span>{t("common.cancel")}</span>
              </button>
            </Dialog.Close>
            <button
              className="primary-button"
              disabled={controller.active || selected.size === 0}
              type="button"
              onClick={startBatch}
            >
              <Play className="ui-icon" aria-hidden="true" />
              <span>{t("batchConnect.start")}</span>
            </button>
          </footer>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );

  function toggleCandidate(connectionId: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(connectionId)) {
        next.delete(connectionId);
      } else if (next.size < batchConnectMaxNewSessions) {
        next.add(connectionId);
      }
      return next;
    });
  }

  function startBatch() {
    if (!targetGroupId || !plan) return;
    const connectionIds = plan.candidates
      .filter((candidate) => selected.has(candidate.connectionId))
      .map((candidate) => candidate.connectionId);
    if (controller.start(targetGroupId, connectionIds)) onOpenChange(false);
  }
}

export function BatchConnectStatusPanel({
  connections,
  controller,
  groups,
}: {
  connections: readonly ConnectionProfile[];
  controller: ConnectionPaneBatchConnectController;
  groups: readonly ConnectionGroup[];
}) {
  const { t } = useI18n();
  const run = controller.run;
  if (!run) return null;

  const connectionById = new Map(connections.map((connection) => [connection.id, connection]));
  const groupName =
    groups.find((group) => group.id === controller.groupId)?.name ||
    t("batchConnect.unknownGroup");
  const failedCount = run.items.filter((item) => item.status === "failed").length;

  return (
    <section className="batch-connect-status-panel" aria-label={t("batchConnect.panelTitle")}>
      <header className="batch-connect-status-head">
        <div>
          <strong>{t("batchConnect.panelTitle")}</strong>
          <small>{groupName}</small>
        </div>
        <span>
          {t("batchConnect.progress", {
            done: run.items.filter((item) => isTerminalStatus(item.status)).length,
            total: run.items.length,
          })}
        </span>
      </header>

      <div className="batch-connect-status-list">
        {run.items.map((item) => {
          const connection = connectionById.get(item.connectionId) || null;
          return (
            <div
              className="batch-connect-status-row"
              data-status={item.status}
              key={item.connectionId}
            >
              {connection ? (
                <ConnectionSystemLogo connection={connection} compact decorative />
              ) : (
                <CircleAlert className="ui-icon" aria-hidden="true" />
              )}
              <span className="batch-connect-status-copy">
                <strong>{connection?.name || item.connectionId}</strong>
                <small title={item.error || undefined}>
                  {item.error || statusLabel(item.status, t)}
                </small>
              </span>
              {item.status === "waiting-user" ? (
                <button
                  className="mini-action batch-connect-focus"
                  type="button"
                  onClick={() => controller.focus(item.connectionId)}
                >
                  {t("batchConnect.focus")}
                </button>
              ) : item.status === "connecting" ? (
                <Loader2 className="ui-icon spin" aria-hidden="true" />
              ) : item.status === "success" ? (
                <Check className="ui-icon" aria-hidden="true" />
              ) : null}
            </div>
          );
        })}
      </div>

      <footer className="batch-connect-status-actions">
        {controller.active ? (
          <button type="button" onClick={() => void controller.cancelRemaining()}>
            <X className="ui-icon" aria-hidden="true" />
            <span>{t("batchConnect.cancelRemaining")}</span>
          </button>
        ) : null}
        {!controller.active && failedCount > 0 ? (
          <button type="button" onClick={() => controller.retryFailed()}>
            <RefreshCw className="ui-icon" aria-hidden="true" />
            <span>{t("batchConnect.retryFailed")}</span>
          </button>
        ) : null}
        {!controller.active ? (
          <button type="button" onClick={() => controller.dismiss()}>
            <X className="ui-icon" aria-hidden="true" />
            <span>{t("batchConnect.dismiss")}</span>
          </button>
        ) : null}
      </footer>
    </section>
  );
}

function isTerminalStatus(status: BatchConnectItemStatus) {
  return status === "success" || status === "failed" || status === "cancelled";
}

function statusLabel(status: BatchConnectItemStatus, t: Translate) {
  switch (status) {
    case "queued":
      return t("batchConnect.status.queued");
    case "connecting":
      return t("batchConnect.status.connecting");
    case "waiting-user":
      return t("batchConnect.status.waitingUser");
    case "success":
      return t("batchConnect.status.success");
    case "failed":
      return t("batchConnect.status.failed");
    case "cancelled":
      return t("batchConnect.status.cancelled");
  }
}
