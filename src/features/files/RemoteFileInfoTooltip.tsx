import type { RefObject } from "react";

import { useI18n } from "../../shared/i18n";
import { AnchoredSurfacePortal } from "../../shared/ui/AnchoredSurfacePortal";
import { formatFileSize } from "./remoteFileTransferUtils";
import {
  formatRemoteFileIdentity,
  formatRemoteFileTimestamp,
  remoteFileKindLabel,
  shouldShowRemoteFileSize,
} from "./remoteFileMetadataPresentation";
import type { RemoteFileEntry, RemoteFileEntryMetadata } from "./remoteFileTypes";
import { RemoteFileIcon } from "./RemoteFileIcon";

export type RemoteFileInfoState =
  | { status: "loading" }
  | { error: string; status: "error" }
  | { metadata: RemoteFileEntryMetadata; status: "ready" };

interface RemoteFileInfoTooltipProps {
  anchorRef: RefObject<HTMLElement | null>;
  entry: RemoteFileEntry | null;
  id: string;
  open: boolean;
  state: RemoteFileInfoState | null;
  onOpenChange: (open: boolean) => void;
}

export function RemoteFileInfoTooltip({
  anchorRef,
  entry,
  id,
  open,
  state,
  onOpenChange,
}: RemoteFileInfoTooltipProps) {
  const { t } = useI18n();
  if (!entry) {
    return null;
  }

  const metadata = state?.status === "ready" ? state.metadata : null;
  const kind = metadata?.type || entry.type;

  return (
    <AnchoredSurfacePortal
      align="start"
      anchorRef={anchorRef}
      className="ui-tooltip remote-file-info-tooltip"
      consumeEscape
      desiredHeight={292}
      id={id}
      minHeight={168}
      open={open}
      role="tooltip"
      side="left"
      width={318}
      onOpenChange={onOpenChange}
    >
      <header className="remote-file-info-head">
        <RemoteFileIcon entry={entry} expanded={false} />
        <strong>{entry.name}</strong>
      </header>
      <dl className="remote-file-info-list">
        <RemoteFileInfoRow label={t("files.info.type")} value={remoteFileKindLabel(kind)} />
        {metadata && shouldShowRemoteFileSize(kind) ? (
          <RemoteFileInfoRow label={t("files.info.size")} value={formatFileSize(metadata.size)} />
        ) : null}
        {metadata ? (
          <>
            <RemoteFileInfoRow
              label={t("files.info.user")}
              value={formatRemoteFileIdentity(metadata.owner, metadata.uid, "UID")}
            />
            <RemoteFileInfoRow
              label={t("files.info.group")}
              value={formatRemoteFileIdentity(metadata.group, metadata.gid, "GID")}
            />
            <RemoteFileInfoRow label={t("files.info.permissions")} value={metadata.mode || t("files.info.unknown")} />
            <RemoteFileInfoRow
              label={t("files.info.modified")}
              value={formatRemoteFileTimestamp(metadata.mtime, t("files.info.unknown"))}
            />
            <RemoteFileInfoRow
              label={t("files.info.created")}
              value={formatRemoteFileTimestamp(metadata.birthtime, t("files.info.unsupported"))}
            />
          </>
        ) : null}
        <RemoteFileInfoRow label={t("files.info.path")} value={entry.path} wrap />
      </dl>
      {state?.status === "loading" ? (
        <p className="remote-file-info-status" aria-live="polite">{t("files.info.loading")}</p>
      ) : state?.status === "error" ? (
        <p className="remote-file-info-status is-error" aria-live="polite">{state.error}</p>
      ) : null}
    </AnchoredSurfacePortal>
  );
}

function RemoteFileInfoRow({ label, value, wrap = false }: { label: string; value: string; wrap?: boolean }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd className={wrap ? "is-path" : undefined}>{value}</dd>
    </div>
  );
}
