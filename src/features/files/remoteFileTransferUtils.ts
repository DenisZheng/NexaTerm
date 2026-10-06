import { getLocale, t } from "../../shared/i18n";
import type {
  RemoteFileTransferItem,
  TransferDirection,
  TransferKind,
  TransferStatus,
} from "./remoteFileTransferTypes";

export function clampTransferProgress(progress: number) {
  if (!Number.isFinite(progress)) {
    return 0;
  }
  return Math.max(0, Math.min(100, progress));
}

export function transferProgressPercent(loadedBytes: number, totalBytes: number) {
  if (totalBytes <= 0) {
    return 0;
  }
  return (Math.max(0, loadedBytes) / totalBytes) * 100;
}

export function interpolateTransferProgress(
  start: number,
  end: number,
  loadedBytes: number,
  totalBytes: number,
) {
  if (totalBytes <= 0) {
    return end;
  }
  const ratio = Math.max(0, Math.min(1, loadedBytes / totalBytes));
  return start + (end - start) * ratio;
}

export function formatTransferProgressBytes(loadedBytes: number, totalBytes: number) {
  if (totalBytes <= 0) {
    return formatFileSize(loadedBytes);
  }
  return `${formatFileSize(loadedBytes)} / ${formatFileSize(totalBytes)}`;
}

export function createTransferSpeedTracker() {
  const startedAt = performance.now();
  let lastSampleAt = startedAt;
  let lastLoadedBytes = 0;
  let lastSpeedBytesPerSecond: number | null = null;

  return {
    sample(loadedBytes: number) {
      const now = performance.now();
      const elapsedMs = now - lastSampleAt;
      const totalElapsedMs = now - startedAt;
      if (elapsedMs >= 250 || loadedBytes === 0 || lastSpeedBytesPerSecond === null) {
        const deltaBytes = Math.max(0, loadedBytes - lastLoadedBytes);
        lastSpeedBytesPerSecond =
          elapsedMs > 0
            ? (deltaBytes / elapsedMs) * 1000
            : totalElapsedMs > 0
              ? (loadedBytes / totalElapsedMs) * 1000
              : 0;
        lastLoadedBytes = loadedBytes;
        lastSampleAt = now;
      }
      return formatTransferSpeed(
        lastSpeedBytesPerSecond ??
          (totalElapsedMs > 0 ? (loadedBytes / totalElapsedMs) * 1000 : 0),
      );
    },
  };
}

export function calculateTransferAverageSpeed(loadedBytes: number, startedAt: number) {
  const elapsedSeconds = Math.max(0.001, (Date.now() - startedAt) / 1000);
  return Math.max(0, loadedBytes / elapsedSeconds);
}

export function formatTransferSpeed(bytesPerSecond: number) {
  if (!Number.isFinite(bytesPerSecond) || bytesPerSecond <= 0) {
    return null;
  }
  return `${formatFileSize(bytesPerSecond)}/s`;
}

export function transferFileTypeClass(item: RemoteFileTransferItem) {
  if (item.kind === "directory") {
    return "directory";
  }
  const name = item.name.toLowerCase();
  if (
    name.endsWith(".tar.gz") ||
    name.endsWith(".tgz") ||
    name.endsWith(".zip") ||
    name.endsWith(".gz") ||
    name.endsWith(".7z") ||
    name.endsWith(".rar")
  ) {
    return "archive";
  }
  if (name.endsWith(".log")) {
    return "log";
  }
  return "file";
}

export function transferFileTypeLabel(item: RemoteFileTransferItem) {
  if (item.kind === "directory") {
    return null;
  }
  const name = item.name.toLowerCase();
  if (name.endsWith(".tar.gz") || name.endsWith(".tgz")) return "TGZ";
  if (name.endsWith(".zip")) return "ZIP";
  if (name.endsWith(".gz")) return "GZ";
  if (name.endsWith(".7z")) return "7Z";
  if (name.endsWith(".rar")) return "RAR";
  if (name.endsWith(".log")) return "LOG";
  const extension = item.name.includes(".") ? item.name.split(".").pop() || "" : "";
  return extension.length > 0 && extension.length <= 4 ? extension.toUpperCase() : null;
}

export function transferItemSizeText(item: RemoteFileTransferItem) {
  const detail = item.progressDetail || "";
  const legacyArchivePrefix = "压缩包 ";
  const normalizedDetail = detail.startsWith(legacyArchivePrefix)
    ? t("files.transfer.archiveSize", { size: detail.slice(legacyArchivePrefix.length) })
    : detail;
  if (item.kind === "directory") {
    return normalizedDetail.includes(" / ") || normalizedDetail
      ? normalizedDetail || t("files.transfer.kind.directory")
      : t("files.transfer.kind.directory");
  }
  if (normalizedDetail.includes(" / ") || normalizedDetail) {
    return normalizedDetail;
  }
  return t("files.transfer.kind.file");
}

export function transferStageLabel(stage: string) {
  const value = stage.trim();
  if (!value) return value;
  const labels: Record<string, string> = {
    "已取消": t("files.transfer.status.canceled"),
    "等待远端确认": t("files.transfer.stage.waitingRemote"),
    "压缩中": t("files.transfer.stage.compressing"),
    "上传中": t("files.transfer.stage.uploading"),
    "下载中": t("files.transfer.stage.downloading"),
  };
  return labels[value] || value;
}

export function transferDirectionLabel(direction: TransferDirection) {
  return direction === "upload" ? t("files.transfer.direction.upload") : t("files.transfer.direction.download");
}

export function transferKindLabel(kind: TransferKind) {
  return kind === "directory" ? t("files.transfer.kind.directory") : t("files.transfer.kind.file");
}

export function transferSourcePath(item: RemoteFileTransferItem) {
  if (item.direction === "upload") {
    return item.localPath || t("files.transfer.localSelected");
  }
  return item.remotePath;
}

export function transferTargetPath(item: RemoteFileTransferItem) {
  if (item.direction === "upload") {
    return item.remotePath;
  }
  return item.localPath || t("files.transfer.localDownloadDir");
}

export function formatTransferDetailTime(timestamp: number) {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) {
    return "--";
  }
  return date.toLocaleString(getLocale() === "zh-CN" ? "zh-CN" : "en-US", {
    hour: "2-digit",
    hour12: false,
    minute: "2-digit",
    month: "2-digit",
    day: "2-digit",
  });
}

export function transferStatusLabel(status: TransferStatus) {
  const labels: Record<TransferStatus, string> = {
    canceled: t("files.transfer.status.canceled"),
    error: t("files.transfer.status.error"),
    queued: t("files.transfer.status.queued"),
    running: t("files.transfer.status.running"),
    skipped: t("files.transfer.status.skipped"),
    success: t("files.transfer.status.success"),
  };
  return labels[status];
}

export function transferInlineErrorText(error: string) {
  return error
    .split(/\r?\n/)
    .map((line) => normalizeErrorText(line))
    .filter(Boolean)
    .join(getLocale() === "zh-CN" ? "；" : "; ");
}

export function transferDisplayStatusLabel(item: RemoteFileTransferItem) {
  if (item.status !== "running" && item.status !== "queued") {
    return transferStatusLabel(item.status);
  }

  const stage = item.stage.trim();
  if (!stage) {
    return transferStatusLabel(item.status);
  }
  if (stage.includes("等待") || /wait/i.test(stage)) {
    return t("files.transfer.stage.waiting");
  }
  if (stage.includes("压缩") || stage.includes("打包") || /compress|pack|tar\.gz/i.test(stage)) {
    return t("files.transfer.stage.compressing");
  }
  if (stage.includes("扫描") || /scan/i.test(stage)) {
    return t("files.transfer.stage.scanning");
  }
  if (stage.includes("检查") || stage.includes("准备") || /check|prepare/i.test(stage)) {
    return t("files.transfer.stage.preparing");
  }
  if (stage.includes("下载") || /download/i.test(stage)) {
    return t("files.transfer.stage.downloading");
  }
  if (stage.includes("上传") || /upload/i.test(stage)) {
    return t("files.transfer.stage.uploading");
  }
  if (stage.includes("解压") || /extract/i.test(stage)) {
    return t("files.transfer.stage.extracting");
  }
  return transferStatusLabel(item.status);
}

export function formatFileSize(size: number) {
  if (size < 1024) return `${size.toString()} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  if (size < 1024 * 1024 * 1024) return `${(size / 1024 / 1024).toFixed(1)} MB`;
  return `${(size / 1024 / 1024 / 1024).toFixed(1)} GB`;
}

function normalizeErrorText(message: string) {
  return message.replace(/^Error:\s*/i, "").trim();
}
