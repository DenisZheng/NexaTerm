import type { DownloadEvent, Update } from "@tauri-apps/plugin-updater";

import {
  getAppRuntimeInfoCommand,
  type AppDistributionMode,
  type AppRuntimeInfo,
} from "./commands";
import { hasTauriRuntime } from "./runtime";

const repositoryUrl = "https://github.com/DenisZheng/NexaTerm";
const fallbackVersion = "0.1.0";

export type AppUpdateCheckStatus = "available" | "latest" | "failed" | "unsupported";

export interface AppUpdateCheckResult {
  message: string;
  runtimeInfo: AppRuntimeInfo;
  status: AppUpdateCheckStatus;
  update?: Update;
  version?: string;
}

export interface AppUpdateCheckOptions {
  locale?: "en" | "zh-CN";
  silent?: boolean;
}

interface UpdateDownloadProgressState {
  downloaded: number;
  total: number;
}

export async function getAppRuntimeInfo(): Promise<AppRuntimeInfo> {
  if (!hasTauriRuntime()) {
    return {
      version: fallbackVersion,
      repositoryUrl,
      distributionMode: "web",
      isTauri: false,
    };
  }

  const runtimeInfo = await getAppRuntimeInfoCommand();
  return normalizeRuntimeInfo(runtimeInfo);
}

export async function checkForAppUpdate(
  options: AppUpdateCheckOptions = {},
): Promise<AppUpdateCheckResult | null> {
  const locale = options.locale ?? "zh-CN";
  let runtimeInfo: AppRuntimeInfo;
  try {
    runtimeInfo = await getAppRuntimeInfo();
  } catch (error) {
    if (options.silent) {
      return null;
    }
    return {
      status: "failed",
      message: formatUnknownError(error, localized(locale, "Could not read runtime information.", "运行时信息读取失败。")),
      runtimeInfo: webRuntimeInfo(),
    };
  }

  const unsupportedMessage = getUnsupportedUpdateMessage(runtimeInfo, locale);
  if (unsupportedMessage) {
    return {
      status: "unsupported",
      message: unsupportedMessage,
      runtimeInfo,
    };
  }

  try {
    const { check } = await import("@tauri-apps/plugin-updater");
    const update = await check({ timeout: 30_000 });
    if (!update) {
      return {
        status: "latest",
        message: localized(locale, "You already have the latest version.", "当前已是最新版本。"),
        runtimeInfo,
      };
    }

    const version = normalizeString(update.version) || undefined;
    return {
      status: "available",
      message:
        normalizeString(update.body) ||
        (version
          ? localized(locale, `New version ${version} is available.`, `发现新版本 ${version}。`)
          : localized(locale, "A new version is available.", "发现新版本。")),
      runtimeInfo,
      update,
      version,
    };
  } catch (error) {
    if (options.silent) {
      return null;
    }
    return {
      status: "failed",
      message: formatUnknownError(error, localized(locale, "Update check failed.", "检查更新失败。")),
      runtimeInfo,
    };
  }
}

export async function installAppUpdate(
  update: Update,
  onProgress?: (message: string) => void,
  locale: "en" | "zh-CN" = "zh-CN",
): Promise<void> {
  const progress: UpdateDownloadProgressState = {
    downloaded: 0,
    total: 0,
  };

  try {
    onProgress?.(localized(locale, "Preparing update…", "正在准备更新..."));
    await update.downloadAndInstall((event) => {
      onProgress?.(formatUpdateDownloadProgress(event, progress, locale));
    });
    onProgress?.(localized(locale, "Update installed. Restarting…", "更新安装完成，正在重启应用..."));
    const { relaunch } = await import("@tauri-apps/plugin-process");
    await relaunch();
  } finally {
    await update.close().catch(() => undefined);
  }
}

export function formatUpdateDownloadProgress(
  event: DownloadEvent,
  state: UpdateDownloadProgressState,
  locale: "en" | "zh-CN" = "zh-CN",
) {
  if (event.event === "Started") {
    state.downloaded = 0;
    state.total = event.data.contentLength ?? 0;
  }
  if (event.event === "Progress") {
    state.downloaded += event.data.chunkLength;
  }
  if (event.event === "Finished") {
    return localized(locale, "Download complete. Installing…", "更新包下载完成，正在安装...");
  }
  if (state.total <= 0) {
    return localized(locale, "Downloading update…", "正在下载更新包...");
  }

  const percent = Math.min(100, Math.round((state.downloaded / state.total) * 100));
  return localized(
    locale,
    `Downloading update… ${percent.toString()}%`,
    `正在下载更新包... ${percent.toString()}%`,
  );
}

export function getUnsupportedUpdateMessage(
  runtimeInfo: AppRuntimeInfo,
  locale: "en" | "zh-CN" = "zh-CN",
) {
  if (!runtimeInfo.isTauri || runtimeInfo.distributionMode === "web") {
    return localized(locale, "In-app updates are unavailable in web preview. Use the desktop app.", "Web 预览不支持应用内更新，请在桌面端使用。");
  }
  if (import.meta.env.DEV) {
    return localized(locale, "Development mode does not check for app updates.", "开发模式不会检查应用更新。");
  }
  if (runtimeInfo.distributionMode === "desktop-portable") {
    return localized(locale, "The Windows portable build must be updated manually from GitHub Releases.", "Windows 绿色版需到 GitHub Release 手动下载新版本。");
  }
  if (runtimeInfo.distributionMode === "desktop-package") {
    return localized(locale, "This Linux package must be updated manually; only AppImage supports in-app updates.", "当前 Linux 安装包需手动下载，AppImage 才支持应用内更新。");
  }
  return null;
}

export function formatAppDistributionMode(
  mode: AppDistributionMode,
  locale: "en" | "zh-CN" = "zh-CN",
) {
  const labels: Record<AppDistributionMode, readonly [string, string]> = {
    "desktop-appimage": ["Linux AppImage", "Linux AppImage"],
    "desktop-installer": ["Desktop installer", "桌面安装版"],
    "desktop-package": ["Linux deb/rpm", "Linux deb/rpm"],
    "desktop-portable": ["Windows portable", "Windows 绿色版"],
    web: ["Web preview", "Web 预览"],
  };
  const [en, zhCN] = labels[mode];
  return localized(locale, en, zhCN);
}

function normalizeRuntimeInfo(value: unknown): AppRuntimeInfo {
  const record = isRecord(value) ? value : {};
  return {
    version: normalizeString(record.version) || fallbackVersion,
    repositoryUrl:
      normalizeString(record.repositoryUrl) || normalizeString(record.repository_url) || repositoryUrl,
    distributionMode: normalizeDistributionMode(
      record.distributionMode || record.distribution_mode,
    ),
    isTauri: record.isTauri !== false && record.is_tauri !== false,
  };
}

function normalizeDistributionMode(value: unknown): AppDistributionMode {
  if (
    value === "desktop-installer" ||
    value === "desktop-portable" ||
    value === "desktop-appimage" ||
    value === "desktop-package" ||
    value === "web"
  ) {
    return value;
  }
  return hasTauriRuntime() ? "desktop-installer" : "web";
}

function webRuntimeInfo(): AppRuntimeInfo {
  return {
    version: fallbackVersion,
    repositoryUrl,
    distributionMode: "web",
    isTauri: false,
  };
}

function formatUnknownError(error: unknown, fallback: string) {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }
  if (typeof error === "string" && error.trim()) {
    return error;
  }
  return fallback;
}

function normalizeString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}


function localized(locale: "en" | "zh-CN", en: string, zhCN: string) {
  return locale === "zh-CN" ? zhCN : en;
}
