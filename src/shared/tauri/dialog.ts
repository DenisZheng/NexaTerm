import { open, save } from "@tauri-apps/plugin-dialog";
import { t } from "../i18n";

function normalizeSelectedPaths(selected: string | string[] | null) {
  if (!selected) {
    return [];
  }
  return Array.isArray(selected) ? selected : [selected];
}

export async function selectLocalUploadFiles() {
  const selected = await open({
    multiple: true,
    title: t("dialog.uploadFiles"),
  });
  return normalizeSelectedPaths(selected);
}

export async function selectLocalUploadDirectories() {
  const selected = await open({
    directory: true,
    multiple: true,
    recursive: true,
    title: t("dialog.uploadFolders"),
  });
  return normalizeSelectedPaths(selected);
}

export async function selectLocalDownloadDirectory() {
  const selected = await open({
    directory: true,
    multiple: false,
    title: t("dialog.downloadFolder"),
  });
  return normalizeSelectedPaths(selected)[0] || null;
}

export async function selectLocalPrivateKeyFile() {
  const selected = await open({
    multiple: false,
    title: t("dialog.privateKey"),
  });
  return normalizeSelectedPaths(selected)[0] || null;
}

export async function selectDockerLogSavePath(defaultName: string) {
  return save({
    defaultPath: defaultName,
    filters: [
      {
        extensions: ["log", "txt"],
        name: t("dialog.logFile"),
      },
    ],
    title: t("dialog.saveContainerLog"),
  });
}

export async function selectConnectionTransferImportPath() {
  const selected = await open({
    multiple: false,
    filters: [
      {
        extensions: ["json"],
        name: t("dialog.connectionTransferFile"),
      },
    ],
    title: t("dialog.connectionImport"),
  });
  return normalizeSelectedPaths(selected)[0] || null;
}

export async function selectConnectionTransferExportPath() {
  return save({
    defaultPath: `mxterm-connections-${new Date().toISOString().slice(0, 10)}.mxterm-connections.json`,
    filters: [
      {
        extensions: ["json"],
        name: t("dialog.connectionTransferFile"),
      },
    ],
    title: t("dialog.connectionExport"),
  });
}

export async function selectMobaXtermSessionsImportPath() {
  const selected = await open({
    multiple: false,
    filters: [
      {
        extensions: ["mxtsessions"],
        name: t("dialog.mobaxtermExport"),
      },
    ],
    title: t("dialog.mobaxtermImport"),
  });
  return normalizeSelectedPaths(selected)[0] || null;
}
