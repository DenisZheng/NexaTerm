Warning: truncated output (original token count: 126019)
Total output lines: 13791

import { useConnectionGroups } from "../connections/useConnectionGroups";
import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type FormEvent,
  type ReactNode,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { openPath, revealItemInDir } from "@tauri-apps/plugin-opener";
import { getCurrentWebview, type DragDropEvent } from "@tauri-apps/api/webview";
import { getCurrentWindow } from "@tauri-apps/api/window";
import type { IWindowsPty } from "@xterm/xterm";
import {
  AlertTriangle,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Clipboard,
  CheckCircle2,
  CircleAlert,
  CornerDownLeft,
  Download,
  Eraser,
  KeyRound,
  ExternalLink,
  FileText,
  List,
  Loader2,
  LockKeyhole,
  MonitorPlay,
  PanelsTopLeft,
  PanelRightClose,
  PanelRightOpen,
  Pencil,
  Play,
  Plus,
  RefreshCw,
  Search,
  Send,
  LayoutGrid,
  SquareTerminal,
  Star,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { ConnectionOpenSessions } from "../connections/ConnectionOpenSessions";
import { HomeSessionStart } from "./HomeSessionStart";
import { buildOpenSessionEntries } from "./sessionNavigation";
import { ConnectionPane } from "../connections/ConnectionPane";
import { useBatchConnectController } from "../connections/useBatchConnectController";
import { batchWorkspaceClosePlan, batchWorkspaceItemId, collectBatchOpenConnectionIds, waitForBatchWorkspaceHandle, type BatchWorkspaceHandle } from "../connections/batchConnectWorkspaceRuntime";
import {
  WorkspaceSidebar,
  readStoredWorkspaceSidebarView,
  writeStoredWorkspaceSidebarView,
  type WorkspaceSidebarView,
} from "./WorkspaceSidebar";
import { describeWorkspaceSidebarFiles, resolveWorkspaceSidebarFileContext } from "./workspaceSidebarContext";
import { ConnectionSystemLogo } from "../connections/ConnectionSystemLogo";
import type {
  ConnectionAuthKind,
  ConnectionProtocol,
  ConnectionProfile,
  ConnectionProfileInput,
  ConnectionRuntimeCredentialRequest,
  CredentialProfile,
  CredentialProfileInput,
  RdpEmbeddedBounds,
  HostKeyInfo,
  RdpCertificatePolicy,
  RdpLaunchPreview,
  RdpRunnerKind,
  RdpRunnerProbeResult,
  VncLaunchPreview,
  VncLaunchResult,
  VncRunnerWindowPayload,
  VncRunnerKind,
  VncRunnerProbeResult,
} from "../connections/connectionTypes";
import type { ConnectionTransferMode } from "../connections/connectionTransferTypes";
import type { ConnectionSaveIntent } from "../connections/connectionDialogSubmit";
import {
  defaultRdpExternalRunnerForPlatform,
  defaultVncConfig,
  formatRdpRunnerKind,
  formatVncRunnerKind,
} from "../connections/connectionTypes";
import { connectionTimestampOf, sortConnectionsByRecent } from "../connections/connectionSearch";
import { formatRelativeTime } from "../connections/relativeTime";
import { terminalStatusLabel } from "../terminal/terminalStatusLabel";
import { isQuickConnectCredentialError, type QuickConnectTarget } from "../connections/quickConnect";
import { connectTemporaryQuickTerminal, createTemporaryQuickConnectProfile, prepareTemporaryQuickConnectCredentials, releaseTemporaryQuickConnectRefs, saveTemporaryQuickConnectProfile } from "../connections/quickConnectRuntime";
import { finalTemporaryContextRefs, rebindConnectionItems, rebindTemporaryTerminalTab } from "../connections/quickConnectSession";
import { buildRuntimeCredentialRequest, credentialPromptTargetFromConnection, parseCredentialPromptTarget, parseSshNodeFailure, upsertRuntimeCredential, type CredentialPromptTarget } from "../connections/jumpRuntime";
import { connectionInfoFromVncProfile } from "../connections/vncConnectionInfo";
import {
  projectRemoteDesktopEntryCapabilities,
  unknownRemoteDesktopEntryCapabilities,
  type RemoteDesktopEntryCapabilities,
} from "./newSessionRemoteDesktopEntries";
import { createMiddleClickCloseHandler } from "../../shared/ui/tabEvents";
// RemoteFileEditor 内部静态 import 了 monaco-editor（主体约 4MB）及其 5 个 worker
// （合计约 10MB）。用 React.lazy 延迟到真正打开远程文件编辑标签时才加载，
// 避免在应用启动时解析 monaco 导致 release 构建下首屏卡顿和全局卡顿。
const loadRemoteFileEditor = () => import("../editor/RemoteFileEditor");
const loadConnectionDialog = () => import("../connections/ConnectionDialog");
const loadConnectionSearchDialog = () => import("../connections/ConnectionSearchDialog");
const loadConnectionTransferDialog = () => import("../connections/ConnectionTransferDialog");
const loadRemoteFilePanel = () => import("../files/RemoteFilePanel");
const loadMonitorPanel = () => import("../monitor/MonitorPanel");
const loadTunnelPanel = () => import("../tunnels/TunnelPanel");
const loadSettingsView = () => import("../settings/SettingsView");
const loadDockerToolPanel = () => import("../tools/DockerToolPanel");
const loadCommandLibraryPanel = () => import("../commands/CommandLibraryPanel");
const loadAiAssistantPanel = () => import("../ai/AiAssistantPanel");
const loadVncViewerSurface = () => import("./VncViewerSurface");
const loadTerminalPanel = () => import("../terminal/TerminalPanel");
type ConnectionDialogModule = typeof import("../connections/ConnectionDialog");
type LoadedConnectionDialogComponent = ConnectionDialogModule["ConnectionDialog"];
type SettingsViewModule = typeof import("../settings/SettingsView");
type LoadedSettingsViewComponent = SettingsViewModule["SettingsView"];
let connectionDialogModulePromise: Promise<ConnectionDialogModule> | null = null;
let loadedConnectionDialogComponent: LoadedConnectionDialogComponent | null = null;
let settingsViewModulePromise: Promise<SettingsViewModule> | null = null;
let loadedSettingsViewComponent: LoadedSettingsViewComponent | null = null;
function preloadConnectionDialogModule() {
  connectionDialogModulePromise ??= loadConnectionDialog();
  return connectionDialogModulePromise;
}
async function preloadConnectionDialogComponent() {
  if (loadedConnectionDialogComponent) {
    return loadedConnectionDialogComponent;
  }
  const module = await preloadConnectionDialogModule();
  loadedConnectionDialogComponent = module.ConnectionDialog;
  return loadedConnectionDialogComponent;
}
function preloadSettingsViewModule() {
  settingsViewModulePromise ??= loadSettingsView();
  return settingsViewModulePromise;
}
async function preloadSettingsViewComponent() {
  if (loadedSettingsViewComponent) {
    return loadedSettingsViewComponent;
  }
  const module = await preloadSettingsViewModule();
  loadedSettingsViewComponent = module.SettingsView;
  return loadedSettingsViewComponent;
}
const RemoteFileEditor = lazy(async () => {
  const module = await loadRemoteFileEditor();
  return { default: module.RemoteFileEditor };
});
const ConnectionDialog = lazy(async () => {
  const module = await preloadConnectionDialogModule();
  return { default: module.ConnectionDialog };
});
const ConnectionSearchDialog = lazy(async () => {
  const module = await loadConnectionSearchDialog();
  return { default: module.ConnectionSearchDialog };
});
const ConnectionTransferDialog = lazy(async () => {
  const module = await loadConnectionTransferDialog();
  return { default: module.ConnectionTransferDialog };
});
const RemoteFilePanel = lazy(async () => {
  const module = await loadRemoteFilePanel();
  return { default: module.RemoteFilePanel };
});
const RemoteFilesView = lazy(async () => ({ default: (await loadRemoteFilePanel()).RemoteFilesView }));
const MonitorPanel = lazy(async () => {
  const module = await loadMonitorPanel();
  return { default: module.MonitorPanel };
});
const TunnelPanel = lazy(async () => {
  const module = await loadTunnelPanel();
  return { default: module.TunnelPanel };
});
const SettingsView = lazy(async () => {
  const module = await preloadSettingsViewModule();
  return { default: module.SettingsView };
});
const DockerToolPanel = lazy(async () => {
  const module = await loadDockerToolPanel();
  return { default: module.DockerToolPanel };
});
const CommandLibraryPanel = lazy(async () => {
  const module = await loadCommandLibraryPanel();
  return { default: module.CommandLibraryPanel };
});
const AiAssistantPanel = lazy(async () => {
  const module = await loadAiAssistantPanel();
  return { default: module.AiAssistantPanel };
});
const VncViewerSurface = lazy(async () => {
  const module = await loadVncViewerSurface();
  return { default: module.VncViewerSurface };
});
const TerminalPanel = lazy(async () => {
  const module = await loadTerminalPanel();
  return { default: module.TerminalPanel };
});
type LazyModuleLoader = () => Promise<unknown>;
const WORKSPACE_IDLE_PREWARM_BATCHES: Array<{
  timeoutMs: number;
  loaders: LazyModuleLoader[];
}> = [
  {
    timeoutMs: 350,
    loaders: [preloadConnectionDialogComponent],
  },
  {
    timeoutMs: 1500,
    loaders: [
      preloadSettingsViewComponent,
      loadConnectionSearchDialog,
      loadRemoteFilePanel,
    ],
  },
  {
    timeoutMs: 5000,
    loaders: [
      loadCommandLibraryPanel,
      loadAiAssistantPanel,
      loadMonitorPanel,
      loadDockerToolPanel,
    ],
  },
];
import type { RemoteFileEditorTab } from "../editor/remoteFileEditorTypes";
import { LocalFilePanel } from "../files/LocalFilePanel";
import { RemoteFileIcon } from "../files/RemoteFileIcon";
import type { RemoteFileTool, RemoteFileUploadItem } from "../files/RemoteFilePanel";
import { RemoteFileTransferPanel } from "../files/RemoteFileTransferPanel";
import {
  addRemoteFileTransfer,
  getRemoteFileTransfer,
  getRemoteFileTransfers,
  markTransferCanceled,
  prepareTransferRetry,
  rebindRemoteFileTransferConnection,
  setTransferProgress,
  updateRemoteFileTransfer,
} from "../files/remoteFileTransferStore";
import { useRemoteFileTransferController } from "../files/useRemoteFileTransferController";
import {
  createTransferSpeedTracker,
  formatFileSize,
  formatTransferProgressBytes,
  interpolateTransferProgress,
} from "../files/remoteFileTransferUtils";
import {
  formatRemoteFileIdentity,
  formatRemoteFileTimestamp,
  remoteFileKindLabel,
  shouldShowRemoteFileSize,
} from "../files/remoteFileMetadataPresentation";
import type { AiContextBlock } from "../ai/aiTypes";
import {
  isRemotePathStrictDescendant,
  normalizeRemotePath,
  remotePathParent,
} from "../files/remoteFilePaths";
import type {
  RemoteFileArchiveUploadResult,
  RemoteFileDownloadToLocalInput,
  RemoteFileDownloadToLocalResult,
  RemoteFileEntry,
  RemoteFileEntryMetadata,
  RemoteFileMetadata,
  RemoteFileReadResult,
  RemoteFileTransferConflictPolicy,
  RemoteFileUploadResult,
} from "../files/remoteFileTypes";
import type { DockerContainerSummary } from "../tools/dockerTypes";
import {
  getTerminalColorScheme,
  getTerminalColorSchemeTone,
  loadTerminalColorSchemes,
  onTerminalColorSchemesReady,
} from "../settings/terminalColorSchemes";
import {
  resolveSettingsStyle,
  resolveTerminalFontFamily,
  type FileTransferTimestampFormat,
  type RemoteFileOpenMode,
  type SettingsSectionId,
  type WindowMaterialMode,
} from "../settings/settingsTypes";
import { useSettings } from "../settings/useSettings";
import { useAppUpdate } from "../settings/useAppUpdate";
import { SecretVaultGate } from "../security/SecretVaultGate";
import { useSecretVault } from "../security/useSecretVault";
import { useConnections } from "../connections/useConnections";
import { useCredentials } from "../connections/useCredentials";
import { copyTextToClipboard } from "../../shared/clipboard";
import type {
  CommandHistoryEntry,
  CommandHistoryScope,
  CommandSnippet,
} from "../commands/commandLibraryTypes";
import type { CommandHistoryScopeOption } from "../commands/CommandLibraryPanel";
import { compareCommandLibraryTimestampsDesc } from "../commands/commandLibraryTime";
import {
  parseHostKeyError,
  type HostKeyDecision,
} from "../connections/hostKeyErrors";
import {
  connectionNetworkKind,
  errorDiagnosticId,
  isConnectionStageError,
  isConnectTimeoutCode,
} from "../connections/connectionErrorCodes";
import type {
  TerminalPromptDirectorySnapshotReader,
  TerminalSearchNavigationRequest,
} from "../terminal/TerminalPanel";
import {
  aiSendMessageShortcutActionId,
  resolveShortcutBindingById,
} from "../shortcuts/shortcutRegistry";
import { useWorkspaceActionShortcuts } from "../shortcuts/useWorkspaceActionShortcuts";
import type { TerminalOutputEvent } from "../terminal/terminalTypes";
import {
  buildTerminalSubtabActions,
  type TerminalSubtabMenuContext,
} from "../terminal/tabContextMenuActions";
import { ConfirmDialog } from "../../shared/ui/ConfirmDialog";
import { AnchoredSurfacePortal } from "../../shared/ui/AnchoredSurfacePortal";
import { AppSelect } from "../../shared/ui/AppSelect";
import { TabContextMenu } from "../../shared/ui/TabContextMenu";
import {
  commandHistoryClear,
  commandHistoryDelete,
  commandHistoryList,
  commandHistoryRecord,
  commandSnippetDelete,
  commandSnippetList,
  commandSnippetMarkUsed,
  commandSnippetUpsert,
  connectionTest,
  connectionTestProfile,
  getWindowsPtyInfo,
  knownHostTrust,
  connectionProbeLatency,
  localTerminalListProfiles,
  localTerminalOpen,
  localTerminalWslCapability,
  remoteFileCheckPath,
  localPathMetadata,
  remoteFileCheckDownloadTarget,
  remoteFileCreateDirectory,
  remoteFileCreateFile,
  remoteFileDelete,
  remoteFileDownloadToLocal,
  remoteFileMetadata,
  remoteFileAppendUploadTemp,
  remoteFileDeleteUploadTemp,
  remoteFilePrepareUploadTemp,
  remoteFileRead,
  remoteFileRename,
  remoteFileUploadLocalArchive,
  remoteFileUploadLocalFile,
  remoteFileWrite,
  dockerExecInvalidateConnection,
  rdpCloseSession,
  rdpLaunchConnection,
  rdpPreviewLaunch,
  rdpRevealSession,
  rdpResizeEmbeddedSession,
  rdpTestRunner,
  vncCloseSession,
  vncLaunchConnection,
  vncPreviewLaunch,
  vncTestRunner,
  terminalClose,
  terminalConnect,
  terminalWrite,
  serialTerminalOpen,
  telnetTerminalOpen,
  tunnelAutostart,
  tunnelStopConnection,
} from "../../shared/tauri/commands";
import { selectLocalUploadDirectories, selectLocalUploadFiles } from "../../shared/tauri/dialog";
import {
  emitVncRunnerWindowCloseRequest,
  emitVncRunnerWindowPayload,
  listenRdpSessionClosed,
  listenTerminalOutput,
  listenVncRunnerWindowClosed,
  listenVncRunnerWindowError,
  listenVncRunnerWindowMessage,
  listenVncRunnerWindowReady,
} from "../../shared/tauri/events";
import { hasTauriRuntime } from "../../shared/tauri/runtime";
import {
  type DesktopPlatform,
  getPlatformCapabilities,
  resolveDesktopPlatform,
} from "../../shared/tauri/platformCapabilities";
import {
  getSupportedWindowMaterials,
  normalizeWindowMaterial,
  setWindowMaterial,
} from "../../shared/tauri/windowMaterial";
import { useDocumentAppearance } from "../settings/useDocumentAppearance";
import { initializeWindowStatePersistence } from "../../shared/tauri/windowState";
import { Tooltip } from "../../shared/ui/Tooltip";
import { AppActionBar } from "./AppActionBar";
import { AppTitlebar } from "./AppTitlebar";
import { buildTitlebarItems } from "./titlebarItems";
import { useWorkspaceActionRuntime } from "./useWorkspaceActionRuntime";
import { t as tr, useI18n } from "../../shared/i18n";
import { buildSshRemoteFilePanelStack } from "./remoteFilePanelStrategy";
import { closeConfirmationCopy } from "./closeConfirmationText";
import { useCloseRequest } from "../workspace/sessionTabs/useCloseRequest";
import {
  LocalTerminalIcon,
  localTerminalTitle,
} from "../terminal/LocalTerminalIcons";
import {
  TerminalSplitLayout,
  terminalSplitContentStyle,
  type TerminalSplitSessionOption,
} from "../terminal/TerminalSplitSurface";
import {
  TerminalSplitMenu,
  TerminalSplitSyncMenu,
} from "../terminal/TerminalSplitMenu";
import { MultiExecBar } from "./MultiExecBar";
import { buildTerminalSplitSyncPaneOptions } from "./terminalSplitSyncOptions";
import {
  closeTerminalSplitPane as closeTerminalSplitLayoutPane,
  collectTerminalSplitPanes,
  createTerminalSplitLayout,
  equalizeTerminalSplitLayout,
  findTerminalSplitPaneByBinding,
  moveTerminalSplitBinding,
  splitTerminalPane,
  terminalPaneBindingKey,
  terminalPaneBindingsEqual,
  terminalSplitMaxPanes,
  type TerminalPaneBinding,
  type TerminalSplitBranch,
  updateTerminalSplitRatio as updateTerminalSplitLayoutRatio,
} from "../terminal/terminalSplitLayout";
import {
  useTerminalSplitController,
  type TerminalSplitHost,
} from "../workspace/split/useTerminalSplitController";
import { splitGroupInsertionIndex } from "../workspace/split/anchor";
import {
  buildMultiExecTargets,
  type MultiExecTarget,
} from "../workspace/multiExec/targets";
import { writeMultiExecLiveInput } from "../workspace/multiExec/live";
import {
  writeMultiExecCommand,
  type MultiExecSendDeliveryStatus,
} from "../workspace/multiExec/send";
import {
  displayOrdinal,
  HOME_ITEM_ID,
  SPLIT_ITEM_ID,
  instanceItemId,
  nextOrdinal,
  selectActiveItemId,
  selectWorkspaceItems,
} from "../workspace/sessionTabs/instances";
import {
  buildCloseContext,
  closeRequestFromItems,
  closeScopeItemIds,
  planClose,
  type ClosePlan,
  type CloseScope,
} from "../workspace/sessionTabs/itemClose";
import {
  groupByConnection,
  selectActiveConnectedTerminalTab,
  selectActiveSession,
  selectActiveTerminalSplitBinding,
  selectActiveTerminalTab,
} from "../workspace/sessionTabs/selectors";
import type {
  RdpSessionStatus,
  RdpSessionTab,
  TerminalTab as SessionTerminalTab,
  UnifiedWorkbenchTab,
  VncSessionStatus,
  VncSessionTab,
  WorkbenchTabKind,
  WorkspaceMode,
} from "../workspace/sessionTabs/types";
import { useSessionTabsController } from "../workspace/sessionTabs/useSessionTabsController";
import type { CloseSnapshot, SessionRef } from "../workspace/sessionTabs/closeDecision";
import { applyWorkspaceRestorePlanToHydration, buildWorkspaceShellHydration } from "../workspace/restore/shellHydration";
import { buildWorkspaceRestorePlan } from "../workspace/restore/restorePlan";
import { seedWorkspaceRemoteFileDirectories, workspaceRemoteFileDirectories, workspaceRemoteFileFollowStates } from "../workspace/restore/remoteFileSnapshotBridge";
import { snapshotTargetRefs, toSnapshot, type WorkspaceSnapshotV1 } from "../workspace/restore/snapshotTypes";
import { useWorkspaceSnapshotLifecycle } from "../workspace/restore/useWorkspaceSnapshotLifecycle";
import { workspaceSnapshotRuntime } from "./workspaceSnapshotRuntime";
import type {
  LocalTerminalProfile,
  LocalTerminalProfileInput,
  LocalTerminalTab,
  WindowsPtyInfo,
  WslProviderStatus,
} from "../terminal/localTerminalTypes";
type RdpConnectionProfile = ConnectionProfile & { protocol: "rdp" };
type VncConnectionProfile = ConnectionProfile & { protocol: "vnc" };
type TelnetConnectionProfile = ConnectionProfile & { protocol: "telnet" };
type SerialConnectionProfile = ConnectionProfile & { protocol: "serial" };
type SshConnectionProfile = ConnectionProfile & {
  protocol?: "ssh" | null | undefined;
};
const VNC_RUNNER_HOST_WINDOW_LABEL = "vnc-runner-host";
type WorkbenchTabDropZone = WorkbenchTabKind | "split-file" | "split-terminal";
interface WorkbenchTabDragPayload extends UnifiedWorkbenchTab {
  connectionId: string;
}
interface WorkbenchTabMouseDrag {
  active: boolean;
  currentX: number;
  currentY: number;
  grabOffsetX: number;
  grabOffsetY: number;
  payload: WorkbenchTabDragPayload;
  previewWidth: number;
  startX: number;
  startY: number;
}
interface TerminalClearRequest {
  id: number;
  tabId: string;
}
type CommandSenderDeliveryStatus = "idle" | MultiExecSendDeliveryStatus;
type CommandSenderTargetKind = "ssh" | "local";
interface CommandSenderTarget {
  deliveryMessage?: string;
  deliveryStatus: CommandSenderDeliveryStatus;
  description: string;
  key: string;
  kind: CommandSenderTargetKind;
  label: string;
  historyScope: CommandHistoryScope | null;
  sessionId: string;
  tabId: string;
  tabTitle: string;
}
interface CommandSnippetDraft {
  command: string;
  description: string;
  favorite: boolean;
  group: string;
  id?: string;
  tagsText: string;
  title: string;
}
interface CommandSnippetGroupDialogState {
  error?: string | null;
  mode: "create" | "rename";
  originalName?: string;
  selectAfterSave?: boolean;
  value: string;
}
interface TerminalSearchState {
  caseSensitive: boolean;
  open: boolean;
  query: string;
}
type ConnectionStepMode = "test" | "terminal";
type ConnectionStepStatus = "idle" | "running" | "waiting_host_key" | "prompt" | "success" | "error";
type TerminalTab = SessionTerminalTab<ConnectionStepState>;
interface ConnectionStepState {
  activeStepIndex?: number | null;
  authKind: ConnectionAuthKind;
  connection: ConnectionProfile;
  errorDetail?: ConnectionStepErrorDetail | null; error?: string | null;
  hostKey?: HostKeyInfo | null;
  hostKeyDecision?: HostKeyDecision | null; oldHostKeyFingerprint?: string | null;
  id: number;
  logs: string[];
  mode: ConnectionStepMode;
  password: string;
  privateKeyPassphrase: string;
  privateKeyPath: string;
  promptTarget?: CredentialPromptTarget | null; runtimeCredentials: NonNullable<ConnectionRuntimeCredentialRequest["runtime_credentials"]>;
  temporary?: boolean; temporaryContextRef?: string | null;
  temporaryCredentialsReady?: boolean;
  sessionId?: string | null; status: ConnectionStepStatus;
}
interface ConnectionStepErrorDetail {
  code: string;
  message: string;
  rawMessage: string;
  recoverable: boolean;
  stage: string;
  suggestion: string;
}
interface ConnectionGroupInfo {
  color: string;
  id: string;
  name: string;
  parentId?: string | null;
}
interface ConnectionGroupCatalog {
  assignments: Record<string, string>;
  groups: ConnectionGroupInfo[];
}
interface RemoteFileRefreshRequest {
  connectionId: string;
  id: number;
  path: string;
}
interface RemoteFileLocateRequest {
  connectionId: string;
  id: number;
  path: string;
}
type RemoteFileTextAction =
  | { action: "create-directory"; connectionId: string; parentPath: string }
  | { action: "create-file"; connectionId: string; parentPath: string }
  | { action: "rename"; connectionId: string; entry: RemoteFileEntry };
interface RemoteFileDeleteTarget {
  connectionId: string;
  entries: RemoteFileEntry[];
}
type ConnectionFilter = "recent" | "all" | "favorites";
type LatencyProbeState =
  | { status: "checking" }
  | { latencyMs: number; status: "ok" }
  | { status: "failed" };
type ResizablePaneSide = "left" | "right";
type ResizingPane = ResizablePaneSide | "editor-terminal";
interface RemoteFilePropertiesState {
  entry: RemoteFileEntry;
  error?: string | null;
  loading: boolean;
  metadata?: RemoteFileEntryMetadata | null;
}
interface TransferConflictPromptState {
  description: string;
  id: string;
  name: string;
  resolve: (policy: RemoteFileTransferConflictPolicy | null) => void;
}
interface ArchiveBuildProgress {
  archiveBytes: number;
  loadedBytes: number;
  phase: "read" | "compress";
  totalBytes: number;
}
interface TransferRunOptions {
  connection?: ConnectionProfile;
  conflictPolicy?: RemoteFileTransferConflictPolicy;
  transferId?: string;
}
interface DirectoryTransferRunOptions extends TransferRunOptions {
  compress?: boolean;
  keepArchive?: boolean;
}
interface DownloadTransferRunOptions {
  input?: Omit<RemoteFileDownloadToLocalInput, "transferId">;
  transferId?: string;
}
const defaultLeftPaneWidth = 336;
const minLeftPaneWidth = 248;
const maxLeftPaneWidth = 520;
const defaultRightPaneWidth = 360;
const minRightPaneWidth = 300;
const maxRightPaneWidth = 560;
const minCenterPaneWidth = 520;
const paneKeyboardResizeStep = 16;
const defaultEditorTerminalSplitPercent = 44;
const commandSnippetRootGroup = "", commandSnippetRootGroupLabel = () => tr("workspace.snippet.root");
const legacyCommandSnippetGroup = "未分组";
const commandHistoryAllScopeKey = "all", commandHistorySshScopePrefix = "ssh:", commandHistoryLocalScopePrefix = "local:";
function connectionPromptAuthKindOptions(): Array<{ label: string; value: ConnectionAuthKind }> {
  return [{ label: tr("workspace.connection.auth.password"), value: "password" }, { label: tr("workspace.connection.auth.privateKey"), value: "private_key" }];
}
const minEditorTerminalSplitPercent = 24;
const maxEditorTerminalSplitPercent = 72;
const editorTerminalKeyboardResizeStep = 3;
const fileReadChunkBytes = 4 * 1024 * 1024;
const uploadTempAppendChunkBytes = fileReadChunkBytes;
const remoteFileDropTargetAttribute = "data-remote-file-drop-target";
const tabScrollTolerancePx = 1;
const tabScrollStateRefreshMs = 180;
interface WorkbenchTabScrollState {
  canScrollLeft: boolean;
  canScrollRight: boolean;
  hasOverflow: boolean;
}
const defaultWorkbenchTabScrollState: WorkbenchTabScrollState = {
  canScrollLeft: false,
  canScrollRight: false,
  hasOverflow: false,
};
function useWorkbenchTabScroller({
  activeKey,
  enabled,
  itemCount,
}: {
  activeKey: string | null;
  enabled: boolean;
  itemCount: number;
}) {
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const [scrollState, setScrollState] = useState<WorkbenchTabScrollState>(
    defaultWorkbenchTabScrollState,
  );
  const updateScrollState = useCallback(() => {
    const scroller = scrollerRef.current;
    if (!scroller || !enabled) {
      setScrollState((current) =>
        current.canScrollLeft || current.canScrollRight || current.hasOverflow
          ? defaultWorkbenchTabScrollState
          : current,
      );
      return;
    }
    const maxScrollLeft = Math.max(0, scroller.scrollWidth - scroller.clientWidth);
    const nextState = {
      canScrollLeft: scroller.scrollLeft > tabScrollTolerancePx,
      canScrollRight: scroller.scrollLeft < maxScrollLeft - tabScrollTolerancePx,
      hasOverflow: maxScrollLeft > tabScrollTolerancePx,
    };
    setScrollState((current) =>
      current.canScrollLeft === nextState.canScrollLeft &&
      current.canScrollRight === nextState.canScrollRight &&
      current.hasOverflow === nextState.hasOverflow
        ? current
        : nextState,
    );
  }, [enabled]);
  useLayoutEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller || !enabled) {
      updateScrollState();
      return;
    }
    let animationFrame = window.requestAnimationFrame(updateScrollState);
    const scheduleScrollStateUpdate = () => {
      window.cancelAnimationFrame(animationFrame);
      animationFrame = window.requestAnimationFrame(updateScrollState);
    };
    const resizeObserver =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(scheduleScrollStateUpdate);
    resizeObserver?.observe(scroller);
    scroller.addEventListener("scroll", scheduleScrollStateUpdate, { passive: true });
    window.addEventListener("resize", scheduleScrollStateUpdate);
    return () => {
      window.cancelAnimationFrame(animationFrame);
      resizeObserver?.disconnect();
      scroller.removeEventListener("scroll", scheduleScrollStateUpdate);
      window.removeEventListener("resize", scheduleScrollStateUpdate);
    };
  }, [enabled, itemCount, updateScrollState]);
  useLayoutEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller || !enabled || itemCount === 0) {
      updateScrollState();
      return;
    }
    const activeTab = scroller.querySelector<HTMLElement>(
      '[data-workbench-tab-active="true"]',
    );
    activeTab?.scrollIntoView({ block: "nearest", inline: "nearest" });
    const animationFrame = window.requestAnimationFrame(updateScrollState);
    return () => window.cancelAnimationFrame(animationFrame);
  }, [activeKey, enabled, itemCount, updateScrollState]);
  const scrollTabs = useCallback(
    (direction: "left" | "right") => {
      const scroller = scrollerRef.current;
      if (!scroller) {
        return;
      }
      const distance = Math.max(128, Math.floor(scroller.clientWidth * 0.58));
      scroller.scrollBy({
        behavior: "smooth",
        left: direction === "left" ? -distance : distance,
      });
      window.setTimeout(updateScrollState, tabScrollStateRefreshMs);
    },
    [updateScrollState],
  );
  return {
    canScrollLeft: scrollState.canScrollLeft,
    canScrollRight: scrollState.canScrollRight,
    hasOverflow: scrollState.hasOverflow,
    ref: scrollerRef,
    scrollLeft: () => scrollTabs("left"),
    scrollRight: () => scrollTabs("right"),
  };
}
type WorkbenchTabScrollController = ReturnType<typeof useWorkbenchTabScroller>;
type NativeFileDropPosition = Extract<DragDropEvent, { type: "enter" | "over" | "drop" }>["position"];

export function WorkspaceShell() {
  const { t } = useI18n();
  const {
    reset,
    settings,
    updateAppearance,
    updateBasic,
    updateCommand,
    updateFileTransfer,
    updateLocalTerminal,
    updateSecurity,
    updateShortcuts,
    updateTerminalTheme,
  } = useSettings();
  const appUpdate = useAppUpdate({
    autoCheckEnabled: settings.basic.autoCheckAppUpdate,
  });
  const secretVault = useSecretVault({
    autoLockMinutes: settings.security.autoLockMinutes,
    masterPasswordEnabled: settings.security.masterPasswordEnabled,
  });
  const storageReady = secretVault.ready;
  const effectiveAllowPasswordReveal =
    !settings.security.masterPasswordEnabled || settings.security.allowPasswordReveal;
  const {
    connections,
    error,
    loading,
    markConnected,
    probeSystem,
    reload,
    remove,
    setFavorite,
    upsert,
  } = useConnections({ enabled: storageReady });
  const {
    credentials,
    error: credentialError,
    loading: credentialLoading,
    reload: reloadCredentials,
    remove: removeCredential,
    upsert: upsertCredential,
  } = useCredentials({ enabled: storageReady });
  // Task 04 第二刀 2b：会话集合、当前项指针、模式与按连接记忆已原样迁入 useSessionTabsController；
  // 四个 *Ref 及其在 updater 内的同步写入仍留在本组件（见 controller 文档）。
  // WF-00B：关闭/删除路径改为"外部清理 → ref 计算集合 → 值式 set → 一次 dispatch"，下一个活动项由
  // reducer 经 closeDecision 决定；需要跨 seam 激活的分支经 onFollowUp 在 reducer 之外执行。
  const {
    activeConnectionId,
    activeLocalTerminalTabId,
    activeRdpSessionId,
    activeRemoteFileTabId,
    activeTabByConnectionId,
    activeTabId,
    activeUnifiedTabByConnectionId,
    activeView,
    activeVncSessionId,
    activeWorkspaceMode,
    dispatchTabs,
    homeActive,
    localTerminalTabs,
    order: workspaceItemOrder,
    rdpSessions,
    remoteFileTabs,
    setActiveRemoteFileTabId,
    setLocalTerminalTabs,
    setRdpSessions,
    setRemoteFileTabs,
    setTerminalFileLayoutByConnectionId,
    setTerminalTabs,
    setVncSessions,
    terminalFileLayoutByConnectionId,
    terminalTabs,
    vncSessions,
  } = useSessionTabsController<TerminalTab>({
    defaultRemoteFileOpenMode: settings.basic.remoteFileOpenMode,
    onFollowUp: (followUp) => {
      // 原关闭路径 updater 内的 activate* 调用；实体已不存在（同一事件里又被关掉）则忽略。
      switch (followUp.kind) {
        case "terminal": {
          const tab = terminalTabsRef.current.find((item) => item.id === followUp.tabId);
          if (tab) {
            activateTerminalTab(tab);
          }
          return;
        }
        case "local": {
          const tab = localTerminalTabsRef.current.find((item) => item.id === followUp.tabId);
          if (tab) {
            activateLocalTerminalTab(tab);
          }
          return;
        }
        case "rdp": {
          const session = rdpSessionsRef.current.find((item) => item.id === followUp.sessionId);
          if (session) {
            activateRdpSession(session);
          }
          return;
        }
        case "vnc": {
          const session = vncSessionsRef.current.find((item) => item.id === followUp.sessionId);
          if (session) {
            activateVncSession(session);
          }
          return;
        }
        default:
          return;
      }
    },
  });
  const [settingsSectionRequest, setSettingsSectionRequest] =
    useState<SettingsSectionId | undefined>();
  const [settingsSectionRequestKey, setSettingsSectionRequestKey] = useState(0);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [pendingConnectionProtocol, setPendingConnectionProtocol] =
    useState<ConnectionProtocol | null>(null);
  const [connectionTransferMode, setConnectionTransferMode] =
    useState<ConnectionTransferMode | null>(null);
  const [LoadedConnectionDialog, setLoadedConnectionDialog] =
    useState<LoadedConnectionDialogComponent | null>(null);
  const [connectionSearchOpen, setConnectionSearchOpen] = useState(false);
  const [connectionSearchQuery, setConnectionSearchQuery] = useState("");
  const [temporaryConnections, setTemporaryConnections] = useState<ConnectionProfile[]>([]);
  const [editingConnection, setEditingConnection] = useState<ConnectionProfile | null>(null);
  const [duplicatingConnection, setDuplicatingConnection] = useState(false);
  const [selectedConnectionId, setSelectedConnectionId] = useState<string | null>(null);
  const terminalTabsRef = useRef<TerminalTab[]>([]);
  const workspaceRestoreTargetRefsRef = useRef(snapshotTargetRefs({ activeItemId: null, files: { directories: {}, followActivePane: true }, instances: [], order: [], panes: null, sidebar: { collapsed: false, view: "sessions" }, version: 1 }));
  const rdpSessionsRef = useRef<RdpSessionTab[]>([]);
  const vncSessionsRef = useRef<VncSessionTab[]>([]);
  const pendingVncRunnerWindowPayloadsRef = useRef(new Map<string, VncRunnerWindowPayload>());
  const vncRunnerWindowReadyRef = useRef(false);
  const rdpEmbeddedViewportRefs = useRef(new Map<string, HTMLDivElement>());
  const rdpEmbeddedHostSuppressedRef = useRef(false);
  const setRdpEmbeddedViewportRef = useCallback(
    (sessionId: string, node: HTMLDivElement | null) => {
      if (node) {
        rdpEmbeddedViewportRefs.current.set(sessionId, node);
      } else {
        rdpEmbeddedViewportRefs.current.delete(sessionId);
      }
    },
    [],
  );
  const measureRdpEmbeddedBounds = useCallback((sessionId: string) => {
    return measureRdpEmbeddedViewport(rdpEmbeddedViewportRefs.current.get(sessionId) || null);
  }, []);
  const syncRdpEmbeddedBounds = useCallback(
    (session: RdpSessionTab, bounds: RdpEmbeddedBounds | null, active: boolean) => {
      if (!hasTauriRuntime() || !session.result?.embedded || !session.result.session_id) {
        return;
      }
      const nextBounds = active && bounds ? bounds : hiddenRdpEmbeddedBounds();
      void rdpResizeEmbeddedSession(session.result.session_id, nextBounds).catch(() => undefined);
    },
    [],
  );
  const syncActiveRdpEmbeddedBounds = useCallback(() => {
    if (!hasTauriRuntime() || !activeRdpSessionId) {
      return;
    }
    const session = rdpSessionsRef.current.find((item) => item.id === activeRdpSessionId);
    if (!session?.result?.embedded) {
      return;
    }
    if (rdpEmbeddedHostSuppressedRef.current) {
      syncRdpEmbeddedBounds(session, null, false);
      return;
    }
    const bounds = measureRdpEmbeddedBounds(session.id);
    syncRdpEmbeddedBounds(session, bounds, true);
  }, [activeRdpSessionId, measureRdpEmbeddedBounds, syncRdpEmbeddedBounds]);
  const terminalWarmupCaptureStopsRef = useRef(new Map<string, () => void>());
  const [commandSenderOpen, setCommandSenderOpen] = useState(false);
  const [multiExecBarOpen, setMultiExecBarOpen] = useState(false);
  const [commandSenderInput, setCommandSenderInput] = useState("");
  const [commandSnippets, setCommandSnippets] = useState<CommandSnippet[]>([]);
  const [commandHistoryEntries, setCommandHistoryEntries] = useState<CommandHistoryEntry[]>([]);
  const [commandLibraryLoading, setCommandLibraryLoading] = useState(false);
  const [commandLibraryError, setCommandLibraryError] = useState<string | null>(null);
  const [commandLibraryUnavailableReason, setCommandLibraryUnavailableReason] =
    useState<string | null>(null);
  const [selectedCommandSnippetId, setSelectedCommandSnippetId] = useState<string | null>(null);
  const [selectedCommandHistoryId, setSelectedCommandHistoryId] = useState<string | null>(null);
  const [commandHistoryScopeKey, setCommandHistoryScopeKey] =
    useState(commandHistoryAllScopeKey);
  const [commandSnippetLocalGroups, setCommandSnippetLocalGroups] = useState<string[]>([]);
  const [commandSnippetDialogOpen, setCommandSnippetDialogOpen] = useState(false);
  const [commandSnippetDraft, setCommandSnippetDraft] = useState<CommandSnippetDraft>(
    () => buildCommandSnippetDraft(""),
  );
  const [commandSnippetGroupDialog, setCommandSnippetGroupDialog] =
    useState<CommandSnippetGroupDialogState | null>(null);
  const [commandSnippetFormError, setCommandSnippetFormError] = useState<string | null>(null);
  const [pendingCommandSnippetDelete, setPendingCommandSnippetDelete] =
    useState<CommandSnippet | null>(null);
  const [pendingCommandSnippetGroupDelete, setPendingCommandSnippetGroupDelete] =
    useState<string | null>(null);
  const [pendingCommandHistoryDelete, setPendingCommandHistoryDelete] =
    useState<CommandHistoryEntry | null>(null);
  const [commandHistoryClearOpen, setCommandHistoryClearOpen] = useState(false);
  const [commandSenderLastSentLabel, setCommandSenderLastSentLabel] =
    useState(tr("workspace.command.last.none"));
  const [commandSenderDeliveryByKey, setCommandSenderDeliveryByKey] =
    useState<Record<string, { message?: string; status: CommandSenderDeliveryStatus }>>({});
  const [terminalSearchByTabId, setTerminalSearchByTabId] =
    useState<Record<string, TerminalSearchState>>({});
  const [terminalSearchNavigationRequest, setTerminalSearchNavigationRequest] =
    useState<TerminalSearchNavigationRequest | null>(null);
  const [terminalRecentOutputByTabId, setTerminalRecentOutputByTabId] =
    useState<Record<string, string>>({});
  const [aiContextRequestKey, setAiContextRequestKey] = useState(0);
  const [aiInitialContexts, setAiInitialContexts] = useState<AiContextBlock[]>([]);
  const localTerminalTabsRef = useRef<LocalTerminalTab[]>([]);
  const [localTerminalProfiles, setLocalTerminalProfiles] = useState<LocalTerminalProfile[]>([]);
  const localTerminalProfilesRef = useRef<LocalTerminalProfile[]>([]);
  const [localTerminalProfilesLoading, setLocalTerminalProfilesLoading] = useState(false);
  const [localTerminalProfilesError, setLocalTerminalProfilesError] = useState<string | null>(null);
  const [wslProviderStatus, setWslProviderStatus] = useState<WslProviderStatus | null>(null);
  const [remoteDesktopEntryCapabilities, setRemoteDesktopEntryCapabilities] =
    useState<RemoteDesktopEntryCapabilities>(unknownRemoteDesktopEntryCapabilities);
  const [terminalClearRequest, setTerminalClearRequest] = useState<TerminalClearRequest | null>(null);
  const terminalClearRequestRef = useRef(0);
  const [terminalDirectories, setTerminalDirectories] = useState<Record<string, string>>({});
  const terminalDirectoriesRef = useRef<Record<string, string>>({});
  const terminalPromptDirectorySnapshotReadersRef = useRef(
    new Map<string, TerminalPromptDirectorySnapshotReader>(),
  );
  const [workbenchTabMouseDrag, setWorkbenchTabMouseDrag] =
    useState<WorkbenchTabMouseDrag | null>(null);
  const [workbenchTabDropZone, setWorkbenchTabDropZone] = useState<WorkbenchTabDropZone | null>(null);
  const suppressNextWorkbenchTabClickRef = useRef(false);
  const [remoteFileLocateRequest, setRemoteFileLocateRequest] =
    useState<RemoteFileLocateRequest | null>(null);
  const [remoteFileRefreshRequest, setRemoteFileRefreshRequest] =
    useState<RemoteFileRefreshRequest | null>(null);
  const [pendingRemoteFileCloseId, setPendingRemoteFileCloseId] = useState<string | null>(null);
  // 顶栏关闭请求的统一确认状态（WS-F08 未保存编辑的关闭确认）：整次操作至多一次确认，确认后按当时状态重算一次执行。
  const closeRequestController = useCloseRequest({
    execute: executeClosePlan,
    plan: (request) =>
      planClose(request, buildCloseContext(localTerminalTabsRef.current, rdpSessionsRef.current, remoteFileTabs, terminalSplitPanes, terminalTabsRef.current, vncSessionsRef.current, getRemoteFileTransfers())),
  });
  const [pendingRemoteFileConflictId, setPendingRemoteFileConflictId] = useState<string | null>(null);
  const [remoteFileDeleteTarget, setRemoteFileDeleteTarget] =
    useState<RemoteFileDeleteTarget | null>(null);
  const [remoteFileTextAction, setRemoteFileTextAction] = useState<RemoteFileTextAction | null>(null);
  const [remoteFileTextValue, setRemoteFileTextValue] = useState("");
  const [remoteFileTextError, setRemoteFileTextError] = useState<string | null>(null);
  const [rightTool, setRightTool] = useState<RemoteFileTool>("commands");
  const [aiAssistantPanelLoaded, setAiAssistantPanelLoaded] = useState(false);
  const [settingsViewLoaded, setSettingsViewLoaded] = useState(false);
  const [LoadedSettingsView, setLoadedSettingsView] =
    useState<LoadedSettingsViewComponent | null>(() => loadedSettingsViewComponent);
  const [nativeFileDropTargetPath, setNativeFileDropTargetPath] = useState<string | null>(null);
  const [remoteFileProperties, setRemoteFileProperties] =
    useState<RemoteFilePropertiesState | null>(null);
  const handleTransferTaskError = useCallback((transferId: string, error: unknown) => {
    failTransfer(transferId, tr("workspace.transfer.failed"), error);
  }, []);
  const {
    enqueueRemoteFileTransfer,
    isTransferNoLongerActive,
    removeTransfer: removeRemoteFileTransfer,
    requestCancelTransfer,
  } = useRemoteFileTransferController({
    concurrentTransfers: settings.fileTransfer.concurrentTransfers,
    onTaskError: handleTransferTaskError,
  });
  const [transferConflictPrompt, setTransferConflictPrompt] =
    useState<TransferConflictPromptState | null>(null);
  const [leftPaneCollapsed, setLeftPaneCollapsed] = useState(false);
  const [workspaceSidebarView, setWorkspaceSidebarView] =
    useState<WorkspaceSidebarView>(readStoredWorkspaceSidebarView);
  const [rightPaneCollapsed, setRightPaneCollapsed] = useState(false);
  const [leftPaneWidth, setLeftPaneWidth] = useState(defaultLeftPaneWidth);
  const [rightPaneWidth, setRightPaneWidth] = useState(defaultRightPaneWidth);
  const [editorTerminalSplitPercent, setEditorTerminalSplitPercent] = useState(
    defaultEditorTerminalSplitPercent,
  );
  const [resizingPane, setResizingPane] = useState<ResizingPane | null>(null);
  const [pendingConnectionGroupId, setPendingConnectionGroupId] = useState<string | null>(null);
  const connectionGroupCatalog = useConnectionGroups(storageReady, connections, reload);
  const desktopPlatform = useMemo(() => resolveDesktopPlatform(), []);
  const platformCapabilities = useMemo(
    () => getPlatformCapabilities(desktopPlatform),
    [desktopPlatform],
  );
  const [windowsPtyInfo, setWindowsPtyInfo] = useState<IWindowsPty | undefined>(() =>
    toWindowsPtyOption(null, desktopPlatform),
  );
  const [supportedWindowMaterials, setSupportedWindowMaterials] = useState<WindowMaterialMode[]>(
    () => platformCapabilities.windowMaterials,
  );
  const workspaceShellRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    writeStoredWorkspaceSidebarView(workspaceSidebarView);
  }, [workspaceSidebarView]);

  const loadCommandLibrary = useCallback(async () => {
    if (!storageReady || !hasTauriRuntime()) {
      setCommandSnippets([]);
      setCommandHistoryEntries([]);
      setCommandLibraryError(null);
      setCommandLibraryUnavailableReason(null);
      setCommandLibraryLoading(false);
      return;
    }

    setCommandLibraryLoading(true);
    setCommandLibraryError(null);
    setCommandLibraryUnavailableReason(null);
    try {
      const [snippets, history] = await Promise.all([
        commandSnippetList(),
        commandHistoryList(50, commandHistoryScopeFromKey(commandHistoryScopeKey)),
      ]);
      setCommandSnippets(snippets);
      setCommandHistoryEntries(history);
      setCommandLibraryUnavailableReason(null);
    } catch (error) {
      if (isCommandLibraryCommandMissingError(error)) {
        setCommandSnippets([]);
        setCommandHistoryEntries([]);
        setCommandLibraryUnavailableReason(commandLibraryRestartMessage());
        return;
      }
      setCommandLibraryError(formatError(error));
    } finally {
      setCommandLibraryLoading(false);
    }
  }, [commandHistoryScopeKey, storageReady]);

  useEffect(() => {
    terminalTabsRef.current = terminalTabs;
  }, [terminalTabs]);

  useEffect(() => {
    terminalDirectoriesRef.current = terminalDirectories;
  }, [terminalDirectories]);

  useEffect(() => {
    rdpSessionsRef.current = rdpSessions;
  }, [rdpSessions]);

  useEffect(() => {
    vncSessionsRef.current = vncSessions;
  }, [vncSessions]);

  useEffect(() => {
    if (activeView === "settings") {
      setSettingsViewLoaded(true);
    }
  }, [activeView]);

  useEffect(() => initializeWindowStatePersistence(), []);

  const ensureConnectionDialogLoaded = useCallback(async () => {
    if (LoadedConnectionDialog) {
      return LoadedConnectionDialog;
    }
    const DialogComponent = await preloadConnectionDialogComponent();
    setLoadedConnectionDialog(() => DialogComponent);
    return DialogComponent;
  }, [LoadedConnectionDialog]);

  const preloadCreateConnectionDialog = useCallback(() => {
    void ensureConnectionDialogLoaded();
  }, [ensureConnectionDialogLoaded]);

  useEffect(() => {
    let active = true;
    void preloadConnectionDialogComponent()
      .then((DialogComponent) => {
        if (active) {
          setLoadedConnectionDialog(() => DialogComponent);
        }
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);

  // 配色方案数据（约 280KB / 531 项）被拆成独立 chunk。启动阶段只注册就绪
  // 监听，并把预热放到浏览器空闲时段，避免 release 首屏后马上解析大数组。
  const [terminalColorSchemesReady, setTerminalColorSchemesReady] = useState(false);
  useEffect(() => {
    let active = true;
    const unsubscribe = onTerminalColorSchemesReady(() => {
      if (active) {
        setTerminalColorSchemesReady(true);
      }
    });
    const cancelIdleLoad = scheduleIdleTask(() => {
      void loadTerminalColorSchemes().catch(() => undefined);
    }, 3500);
    return () => {
      active = false;
      cancelIdleLoad();
      unsubscribe();
    };
  }, []);

  useEffect(() => scheduleWorkspaceModulePrewarm(), []);

  useEffect(() => {
    let disposed = false;
    if (!hasTauriRuntime()) {
      setRemoteDesktopEntryCapabilities(unknownRemoteDesktopEntryCapabilities);
      return () => {
        disposed = true;
      };
    }

    setRemoteDesktopEntryCapabilities(
      projectRemoteDesktopEntryCapabilities({
        rdp: { state: "probing" },
        vnc: { state: "probing" },
      }),
    );
    void Promise.allSettled([rdpTestRunner(), vncTestRunner()]).then(([rdpProbe, vncProbe]) => {
      if (disposed) return;
      setRemoteDesktopEntryCapabilities(
        projectRemoteDesktopEntryCapabilities({
          rdp:
            rdpProbe.status === "fulfilled"
              ? { state: "ready", result: rdpProbe.value as RdpRunnerProbeResult }
              : { state: "failed" },
          vnc:
            vncProbe.status === "fulfilled"
              ? { state: "ready", result: vncProbe.value as VncRunnerProbeResult }
              : { state: "failed" },
        }),
      );
    });

    return () => {
      disposed = true;
    };
  }, [desktopPlatform]);

  useEffect(() => {
    if (!hasTauriRuntime() || !storageReady) {
      return;
    }
    void tunnelAutostart().catch(() => undefined);
  }, [storageReady]);

  useEffect(() => {
    void loadCommandLibrary();
  }, [loadCommandLibrary]);

  useEffect(() => {
    localTerminalTabsRef.current = localTerminalTabs;
  }, [localTerminalTabs]);

  useEffect(() => {
    localTerminalProfilesRef.current = localTerminalProfiles;
  }, [localTerminalProfiles]);

  useEffect(() => {
    let disposed = false;

    async function loadProfiles() {
      setLocalTerminalProfilesLoading(true);
      setLocalTerminalProfilesError(null);
      setWslProviderStatus(null);
      try {
        const detected = hasTauriRuntime()
          ? await localTerminalListProfiles({
              hiddenProfileIds: settings.localTerminal.hiddenProfileIds,
              platform: desktopPlatform,
            })
          : previewLocalTerminalProfiles(desktopPlatform);
        if (disposed) {
          return;
        }
        const merged = mergeLocalTerminalProfiles(
          detected,
          settings.localTerminal.customProfiles,
          settings.localTerminal.hiddenProfileIds,
        );
        setLocalTerminalProfiles(merged);

        if (desktopPlatform === "windows") {
          if (merged.some((profile) => profile.kind === "wsl")) {
            setWslProviderStatus("available");
          } else if (hasTauriRuntime()) {
            try {
              const capability = await localTerminalWslCapability();
              if (!disposed) {
                setWslProviderStatus(capability.status);
              }
            } catch {
              if (!disposed) {
                setWslProviderStatus("probe_failed");
              }
            }
          }
        }
      } catch (error) {
        if (!disposed) {
          setLocalTerminalProfilesError(formatError(error));
          setWslProviderStatus(null);
          setLocalTerminalProfiles(
            mergeLocalTerminalProfiles(
              previewLocalTerminalProfiles(desktopPlatform),
              settings.localTerminal.customProfiles,
              settings.localTerminal.hiddenProfileIds,
            ),
          );
        }
      } finally {
        if (!disposed) {
          setLocalTerminalProfilesLoading(false);
        }
      }
    }

    void loadProfiles();

    return () => {
      disposed = true;
    };
  }, [
    desktopPlatform,
    settings.localTerminal.customProfiles,
    settings.localTerminal.hiddenProfileIds,
  ]);

  const connectionById = useMemo(() => new Map([...connections, ...temporaryConnections].map((connection) => [connection.id, connection])), [connections, temporaryConnections]);
  const batchOpenConnectionIds = useMemo(() => collectBatchOpenConnectionIds({ localTerminalTabs, rdpSessions, terminalTabs, vncSessions }), [localTerminalTabs, rdpSessions, terminalTabs, vncSessions]);
  const batchConnect = useBatchConnectController<BatchWorkspaceHandle>({
    cancel: (handle) => executeClosePlan(batchWorkspaceClosePlan(handle)),
    focus: (handle) => selectWorkspaceItem(batchWorkspaceItemId(handle)),
    start: (connectionId) => {
      const connection = connections.find((item) => item.id === connectionId);
      const handle = connection ? openNewConnectionSessionWithActivation(connection, false) : null;
      if (!handle) throw new Error(tr("workspace.batch.connectionMissing"));
      return handle;
    },
    wait: (handle, reportStatus) => waitForBatchWorkspaceHandle(handle, () => ({ localTerminalTabs: localTerminalTabsRef.current, rdpSessions: rdpSessionsRef.current, terminalTabs: terminalTabsRef.current, vncSessions: vncSessionsRef.current }), reportStatus),
  });

  const activeConnection = activeConnectionId
    ? connectionById.get(activeConnectionId) || null
    : null;
  // Task 04 第二刀 2a：会话派生值改走 sessionTabs/selectors 纯函数；分组结果需 useMemo 保持引用稳定。
  const terminalTabsByConnection = useMemo(() => groupByConnection(terminalTabs), [terminalTabs]);
  const rdpSessionsByConnection = useMemo(() => groupByConnection(rdpSessions), [rdpSessions]);
  const vncSessionsByConnection = useMemo(() => groupByConnection(vncSessions), [vncSessions]);
  const activeConnectionTabs = activeConnectionId
    ? terminalTabsByConnection.get(activeConnectionId) || []
    : [];
  const activeRdpSessions = activeConnectionId
    ? rdpSessionsByConnection.get(activeConnectionId) || []
    : [];
  const activeRdpSession = selectActiveSession(
    rdpSessions,
    rdpSessionsByConnection,
    activeRdpSessionId,
    activeConnectionId,
  );
  const activeVncSessions = activeConnectionId
    ? vncSessionsByConnection.get(activeConnectionId) || []
    : [];
  const activeVncSession = selectActiveSession(
    vncSessions,
    vncSessionsByConnection,
    activeVncSessionId,
    activeConnectionId,
  );
  const activeTerminalTab = selectActiveTerminalTab(terminalTabs, activeTabId);
  const activeConnectedTerminalTab = selectActiveConnectedTerminalTab(activeTerminalTab);
  const activeLocalTerminalTab = selectActiveTerminalTab(localTerminalTabs, activeLocalTerminalTabId);
  const activeTerminalSplitBinding = selectActiveTerminalSplitBinding(
    activeWorkspaceMode,
    activeTerminalTab,
    activeLocalTerminalTab,
  );
  // Task 04 第一刀 1a：分屏状态与归一 effect 已原样迁入 useTerminalSplitController，
  // 这里只做解构接线；行为与迁出前一致。
  const {
    createTerminalFourPane,
    fallbackTerminalSplitBinding,
    focusedTerminalPaneId,
    focusedTerminalSplitBinding,
    focusedTerminalSplitPane,
    multiExecMode,
    multiExecTargets,
    nextTerminalSplitId,
    setFocusedTerminalPaneId,
    setMultiExecMode,
    setMultiExecTargets,
    setTerminalSplitAutoCreateSameSession,
    setTerminalSplitHost,
    setTerminalSplitLayout,
    setTerminalSplitLayoutRevision,
    setTerminalSplitPickerOpenRequest,
    setTerminalSplitSyncError,
    setTerminalSplitTabActive,
    terminalSessionIdForBinding,
    terminalSplitActive,
    terminalSplitAutoCreateSameSession,
    terminalSplitCanAddPane,
    terminalSplitExists,
    terminalSplitHost,
    terminalSplitLayout,
    terminalSplitLayoutRevision,
    terminalSplitMemberKeys,
    terminalSplitPaneByBinding,
    terminalSplitPanes,
    terminalSplitPickerOpenRequest,
    terminalSplitPickerPendingPaneRef,
    terminalSplitPickerRequestRef,
    terminalSplitSyncEnabled,
    terminalSplitSyncError,
    terminalSplitSyncParticipantKeys,
  } = useTerminalSplitController({
    activeTerminalSplitBinding,
    localTerminalTabs,
    onCollapseToStandalone: activateTerminalBindingAsStandalone,
    terminalTabs,
  });
  const defaultCommandHistoryScopeKey = useMemo(
    () =>
      commandHistoryDefaultScopeKey({
        activeConnectionId,
        activeLocalTerminalTab,
        activeWorkspaceMode,
      }),
    [activeConnectionId, activeLocalTerminalTab, activeWorkspaceMode],
  );
  const commandHistoryScopeOptions = useMemo(
    () =>
      buildCommandHistoryScopeOptions({
        activeConnection,
        activeLocalTerminalTab,
        activeWorkspaceMode,
        connections,
        defaultScopeKey: defaultCommandHistoryScopeKey,
        localTerminalProfiles,
      }),
    [
      activeConnection,
      activeLocalTerminalTab,
      activeWorkspaceMode,
      connections,
      defaultCommandHistoryScopeKey,
      localTerminalProfiles,
    ],
  );
  useEffect(() => {
    setCommandHistoryScopeKey(defaultCommandHistoryScopeKey);
  }, [defaultCommandHistoryScopeKey]);

  useEffect(() => {
    if (
      commandHistoryScopeOptions.length > 0 &&
      !commandHistoryScopeOptions.some((option) => option.value === commandHistoryScopeKey)
    ) {
      setCommandHistoryScopeKey(defaultCommandHistoryScopeKey);
    }
  }, [commandHistoryScopeKey, commandHistoryScopeOptions, defaultCommandHistoryScopeKey]);

  const commandSnippetGroups = useMemo(
    () => buildCommandSnippetGroupCatalog(commandSnippets, commandSnippetLocalGroups),
    [commandSnippetLocalGroups, commandSnippets],
  );
  const commandSnippetGroupOptions = useMemo(
    () => [
      { label: commandSnippetRootGroupLabel(), value: commandSnippetRootGroup },
      ...commandSnippetGroups.map((group) => ({ label: group, value: group })),
    ],
    [commandSnippetGroups],
  );
  const multiExecRuntimeTargets = useMemo(
    () =>
      buildMultiExecTargets({
        localTabs: localTerminalTabs,
        sshTabs: terminalTabs,
      }),
    [localTerminalTabs, terminalTabs],
  );
  const commandSenderTargets = useMemo(
    () =>
      buildCommandSenderTargets({
        connectionById,
        deliveryByKey: commandSenderDeliveryByKey,
        instanceTargets: multiExecRuntimeTargets,
        localTerminalProfiles,
        localTerminalTabs,
      }),
    [
      commandSenderDeliveryByKey,
      connectionById,
      localTerminalProfiles,
      localTerminalTabs,
      multiExecRuntimeTargets,
    ],
  );
  const selectedCommandTargetKeySet = multiExecTargets;
  const selectedCommandTargets = commandSenderTargets.filter((target) =>
    selectedCommandTargetKeySet.has(target.key),
  );
  const commandSenderSelectedCount = selectedCommandTargets.length;
  const commandSenderAllSelected =
    commandSenderTargets.length > 0 &&
    commandSenderSelectedCount === commandSenderTargets.length;
  const commandSenderPartiallySelected =
    commandSenderSelectedCount > 0 && !commandSenderAllSelected;
  const commandSenderCanSend =
    commandSenderInput.trim().length > 0 && selectedCommandTargets.length > 0;
  const commandSenderRisky = useMemo(
    () => isCommandSenderRisky(commandSenderInput),
    [commandSenderInput],
  );
  useEffect(() => {
    const availableKeys = new Set(commandSenderTargets.map((target) => target.key));
    setCommandSenderDeliveryByKey((deliveryByKey) => {
      const entries = Object.entries(deliveryByKey).filter(([key]) => availableKeys.has(key));
      return entries.length === Object.keys(deliveryByKey).length
        ? deliveryByKey
        : Object.fromEntries(entries);
    });
  }, [commandSenderTargets]);

  useEffect(() => {
    if (
      selectedCommandSnippetId &&
      !commandSnippets.some((snippet) => snippet.id === selectedCommandSnippetId)
    ) {
      setSelectedCommandSnippetId(null);
    }
  }, [commandSnippets, selectedCommandSnippetId]);

  useEffect(() => {
    if (
      selectedCommandHistoryId &&
      !commandHistoryEntries.some((entry) => entry.id === selectedCommandHistoryId)
    ) {
      setSelectedCommandHistoryId(null);
    }
  }, [commandHistoryEntries, selectedCommandHistoryId]);

  useEffect(() => {
    const availableTabIds = new Set([
      ...terminalTabs.map((tab) => tab.id),
      ...localTerminalTabs.map((tab) => tab.id),
    ]);

    setTerminalSearchByTabId((states) => {
      const entries = Object.entries(states).filter(([tabId]) => availableTabIds.has(tabId));
      return entries.length === Object.keys(states).length ? states : Object.fromEntries(entries);
    });
    setTerminalRecentOutputByTabId((outputs) => {
      const entries = Object.entries(outputs).filter(([tabId]) => availableTabIds.has(tabId));
      return entries.length === Object.keys(outputs).length ? outputs : Object.fromEntries(entries);
    });
  }, [localTerminalTabs, terminalTabs]);

  useEffect(() => {
    if (!workbenchTabMouseDrag) {
      return;
    }

    const currentDrag = workbenchTabMouseDrag;

    function handleMouseMove(event: MouseEvent) {
      const active =
        currentDrag.active || mouseDragDistance(currentDrag, event.clientX, event.clientY) > 6;

      if (!active) {
        return;
      }

      event.preventDefault();
      setWorkbenchTabDropZone(getWorkbenchTabDropZoneFromPoint(event.clientX, event.clientY));
      setWorkbenchTabMouseDrag((drag) =>
        drag
          ? {
              ...drag,
              active: true,
              currentX: event.clientX,
              currentY: event.clientY,
            }
          : drag,
      );
    }

    function handleMouseUp(event: MouseEvent) {
      const active =
        currentDrag.active || mouseDragDistance(currentDrag, event.clientX, event.clientY) > 6;

      if (active) {
        event.preventDefault();
        suppressNextWorkbenchTabClickRef.current = true;
        window.setTimeout(() => {
          suppressNextWorkbenchTabClickRef.current = false;
        }, 0);

        const dropZone = getWorkbenchTabDropZoneFromPoint(event.clientX, event.clientY);
        if (dropZone) {
          applyWorkbenchTabMouseDrop(currentDrag.payload, dropZone);
          return;
        }
      }

      finishWorkbenchTabMouseDrag();
    }

    window.addEventListener("mousemove", handleMouseMove, { passive: false });
    window.addEventListener("mouseup", handleMouseUp);

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [workbenchTabMouseDrag]);

  const activeRemoteFileTabs = activeWorkspaceMode === "ssh" && activeConnectionId && activeConnectedTerminalTab
    ? remoteFileTabs.filter((tab) => tab.connectionId === activeConnectionId)
    : [];
  const activeRemoteFileTab =
    (activeRemoteFileTabId
      ? activeRemoteFileTabs.find((tab) => tab.id === activeRemoteFileTabId) || null
      : null) ||
    activeRemoteFileTabs[0] ||
    null;
  const activeTerminalFileLayout = activeConnectionId
    ? terminalFileLayoutByConnectionId[activeConnectionId] || settings.basic.remoteFileOpenMode
    : settings.basic.remoteFileOpenMode;
  const isActiveTerminalFileUnified =
    !terminalSplitActive && activeTerminalFileLayout === "unified" && activeRemoteFileTabs.length > 0;
  const requestedUnifiedTab = activeConnectionId
    ? activeUnifiedTabByConnectionId[activeConnectionId] || null
    : null;
  const requestedUnifiedTerminalTab =
    requestedUnifiedTab?.kind === "terminal"
      ? activeConnectionTabs.find((tab) => tab.id === requestedUnifiedTab.id) || null
      : null;
  const requestedUnifiedFileTab =
    requestedUnifiedTab?.kind === "file"
      ? activeRemoteFileTabs.find((tab) => tab.id === requestedUnifiedTab.id) || null
      : null;
  const activeUnifiedTab: UnifiedWorkbenchTab | null = isActiveTerminalFileUnified
    ? requestedUnifiedFileTab
      ? { kind: "file", id: requestedUnifiedFileTab.id }
      : requestedUnifiedTerminalTab
        ? { kind: "terminal", id: requestedUnifiedTerminalTab.id }
        : activeRemoteFileTab
          ? { kind: "file", id: activeRemoteFileTab.id }
          : activeConnectedTerminalTab
            ? { kind: "terminal", id: activeConnectedTerminalTab.id }
            : null
    : null;
  const activeUnifiedTabKind = activeUnifiedTab?.kind || null;
  const isUnifiedFileTabActive = isActiveTerminalFileUnified && activeUnifiedTabKind === "file";
  const activeSshToolbarTerminalTab = isUnifiedFileTabActive ? null : activeConnectedTerminalTab;
  const activeTerminalToolbarTabId = terminalSplitActive
    ? focusedTerminalSplitBinding?.tabId || null
    : activeWorkspaceMode === "local"
      ? activeLocalTerminalTab?.sessionId
        ? activeLocalTerminalTab.id
        : null
      : activeSshToolbarTerminalTab?.id || null;
  const activeTerminalToolbarSearch = activeTerminalToolbarTabId
    ? terminalSearchByTabId[activeTerminalToolbarTabId] || null
    : null;
  const showTerminalScopedActions = Boolean(activeTerminalToolbarTabId);
  const showMultiExecBar = multiExecBarOpen || multiExecMode === "live";
  const showTerminalCommandSenderPanel =
    commandSenderOpen && (terminalSplitActive || showTerminalScopedActions);
  useEffect(() => {
    if (isUnifiedFileTabActive && commandSenderOpen) {
      setCommandSenderOpen(false);
      if (multiExecMode === "send") {
        setMultiExecMode("off");
      }
    }
  }, [commandSenderOpen, isUnifiedFileTabActive, multiExecMode, setMultiExecMode]);
  const activeWorkbenchSurface =
    isUnifiedFileTabActive
      ? "panel"
      : activeConnectedTerminalTab || activeLocalTerminalTab?.sessionId
        ? "terminal"
        : "panel";
  const showUnifiedSplitDropZones = Boolean(
    isActiveTerminalFileUnified &&
      workbenchTabMouseDrag?.active &&
      activeConnectionId &&
      workbenchTabMouseDrag.payload.connectionId === activeConnectionId,
  );
  const hasSessionWorkspace =
    terminalTabs.length > 0 ||
    remoteFileTabs.length > 0 ||
    localTerminalTabs.length > 0 ||
    rdpSessions.length > 0 ||
    vncSessions.length > 0;
  const showingHome = activeWorkspaceMode === "home" || (!hasSessionWorkspace && homeActive);
  const showingLocalTerminal = activeWorkspaceMode === "local";
  const showingRdp = activeWorkspaceMode === "rdp";
  const showingVnc = activeWorkspaceMode === "vnc";
  // WF-01 切片 3：顶栏按会话实例成项（WS-M02 / WS-E11–E13），分屏组折叠为一项。
  const workspaceItems = useMemo(
    () =>
      selectWorkspaceItems(
        { localTerminalTabs, rdpSessions, terminalTabs, vncSessions },
        workspaceItemOrder,
        terminalSplitExists && terminalSplitHost
          ? {
              bindings: terminalSplitPanes.flatMap((pane) => (pane.binding ? [pane.binding] : [])),
              host: terminalSplitHost,
            }
          : null,
      ),
    [
      localTerminalTabs,
      rdpSessions,
      terminalSplitExists,
      terminalSplitHost,
      terminalSplitPanes,
      terminalTabs,
      vncSessions,
      workspaceItemOrder,
    ],
  );
  const activeWorkspaceItemId = selectActiveItemId(
    {
      localTerminalTabId: activeLocalTerminalTabId,
      mode: activeWorkspaceMode,
      rdpSessionId: activeRdpSession?.id ?? null,
      showingHome,
      splitActive: terminalSplitActive,
      terminalTabId: activeTabId,
      vncSessionId: activeVncSession?.id ?? null,
    },
    workspaceItems,
  );
  const workspaceSnapshot = toSnapshot(
    { activeItemId: activeWorkspaceItemId, files: { directories: workspaceRemoteFileDirectories(terminalTabs.map((tab) => tab.id)), followActivePane: settings.basic.filePanelFollowsActiveConnection, followTerminalDirectories: workspaceRemoteFileFollowStates(terminalTabs.map((tab) => tab.id)) }, order: workspaceItemOrder, sidebar: { collapsed: leftPaneCollapsed, view: workspaceSidebarView }, splitLayout: terminalSplitLayout },
    { localTerminalTabs, rdpSessions, terminalTabs, vncSessions, targetRefs: { ...workspaceRestoreTargetRefsRef.current, connections: { ...workspaceRestoreTargetRefsRef.current.connections, ...Object.fromEntries(temporaryConnections.map((connection) => [connection.id, { kind: "temporary" as const, targetId: connection.id }])) } } },
  );
  useWorkspaceSnapshotLifecycle({ enabled: storageReady && !loading && !localTerminalProfilesLoading, onRestore: restoreWorkspaceShell, restoreOnLaunch: settings.basic.restoreWorkspaceOnLaunch, snapshot: workspaceSnapshot, runtime: hasTauriRuntime() ? workspaceSnapshotRuntime : null });
  const actionExecutor = useWorkspaceActionRuntime({
    workspaceVisible: activeView !== "settings", activeItemId: activeWorkspaceItemId,
    activePaneId: activeWorkspaceItemId === SPLIT_ITEM_ID ? focusedTerminalPaneId : null,
    workspaceItems, terminalTabs, localTerminalTabs, rdpSessions, vncSessions,
    splitPanes: terminalSplitPanes, terminalSearchByTabId,
    commandSenderTargetCount: commandSenderTargets.length,
    canSplitTerminal: Boolean(fallbackTerminalSplitBinding()) &&
      (!terminalSplitLayout || terminalSplitCanAddPane),
    canOpenTunnels:
      activeView !== "settings" && activeWorkspaceMode === "ssh" && isSshConnection(activeConnection),
  }, settings.shortcuts.bindings, {
    quickOpen: () => setConnectionSearchOpen(true),
    openSettings: () => openSettingsSection(),
    toggleSidebar: () => setLeftPaneCollapsed((collapsed) => !collapsed),
    toggleTools: () => setRightPaneCollapsed((collapsed) => !collapsed),
    toggleCommandSender: openCommandSender,
    toggleMultiExec: toggleMultiExecBar,
    openTunnels: () => {
      setRightPaneCollapsed(false);
      setRightTool("tunnels");
    },
    closeItem: (target) => closeWorkspaceItems(target.itemId, "self"),
    closeInstance: (target) =>
      closeRequestController.request({ instanceIds: [target.instanceId], splitGroup: false }),
    closePane: (target) =>
      closeRequestController.request({ instanceIds: [], splitGroup: false, splitPaneIds: [target.paneId] }),
    closeSplitGroup: () =>
      closeRequestController.request({ instanceIds: [], splitGroup: true }),
    newTerminal: (target, tabId) => {
      if (target.instanceKind === "local") {
        void openLocalTerminalByProfile(resolveDefaultLocalTerminalProfile());
        return;
      }
      const tab = terminalTabsRef.current.find((candidate) => candidate.id === tabId);
      const connection = tab ? connectionById.get(tab.connectionId) : null;
      if (connection && isSshConnection(connection)) openTerminalInConnection(connection);
    },
    toggleSearch: (_, tabId) => toggleTerminalSearch(tabId),
    searchNext: (_, tabId) => requestTerminalSearchNavigation("next", tabId),
    searchPrevious: (_, tabId) => requestTerminalSearchNavigation("previous", tabId),
    splitRight: (target, tabId) =>
      startTerminalSplitForBinding({ kind: target.instanceKind, tabId }, "row"),
    splitDown: (target, tabId) =>
      startTerminalSplitForBinding({ kind: target.instanceKind, tabId }, "column"),
    splitFour: (target, tabId) =>
      startTerminalFourPaneForBinding({ kind: target.instanceKind, tabId }),
  });
  useWorkspaceActionShortcuts({ bindings: settings.shortcuts.bindings, executor: actionExecutor });
  const closeShortcutBinding = resolveShortcutBindingById(settings.shortcuts.bindings, "terminal.closeTab");
  const newSessionEntry = {
    desktopPlatform,
    localProfiles: localTerminalProfiles,
    localProfilesError: localTerminalProfilesError,
    localProfilesLoading: localTerminalProfilesLoading,
    remoteDesktopEntryCapabilities,
    wslProviderStatus,
    onCreateConnection: (protocol?: ConnectionProtocol) => createConnection(undefined, protocol),
    onOpenLocalProfile: (profile: LocalTerminalProfile) => void openLocalTerminalByProfile(profile),
    onQuickOpen: () => setConnectionSearchOpen(true),
  };
  const navigationItems = useMemo(
    () => selectWorkspaceItems({ localTerminalTabs, rdpSessions, terminalTabs, vncSessions }, workspaceItemOrder, null),
    [localTerminalTabs, rdpSessions, terminalTabs, vncSessions, workspaceItemOrder],
  );
  const titlebarLookups = useMemo(() => ({
    connectionAddress: (id: string) => {
      const connection = connectionById.get(id);
      return connection ? formatConnectionAddress(connection) : null;
    },
    connectionName: (id: string) => connectionById.get(id)?.name || null,
    localProfileName: (id: string) => localTerminalProfiles.find((profile) => profile.id === id)?.name || null,
  }), [connectionById, localTerminalProfiles]);
  const openSessionEntries = useMemo(
    () => buildOpenSessionEntries(navigationItems, titlebarLookups, t),
    [navigationItems, titlebarLookups, t],
  );
  const titlebarItems = useMemo(
    () => buildTitlebarItems(workspaceItems, titlebarLookups, t),
    [workspaceItems, titlebarLookups, t],
  );
  const showSessionWorkspace = !showingHome && activeWorkspaceMode === "ssh" && hasSessionWorkspace;
  const showTerminalSplitSurface =
    terminalSplitActive &&
    !showingHome &&
    (terminalTabs.length > 0 || localTerminalTabs.length > 0);
  const showTerminalWorkbench =
    showSessionWorkspace || showingLocalTerminal || showTerminalSplitSurface;
  const showRdpWorkspace = !showingHome && showingRdp && hasSessionWorkspace;
  const showVncWorkspace = !showingHome && showingVnc && hasSessionWorkspace;
  const showWorkspaceToolPane = !showingHome && hasSessionWorkspace;
  const remoteEditorTabScroll = useWorkbenchTabScroller({
    activeKey: activeRemoteFileTab?.id || null,
    enabled: showSessionWorkspace && activeRemoteFileTabs.length > 0 && !isActiveTerminalFileUnified,
    itemCount: activeRemoteFileTabs.length,
  });
  const terminalWorkbenchActiveTabKey = terminalSplitActive
    ? "terminal-split-group"
    : activeWorkspaceMode === "local"
      ? activeLocalTerminalTabId
      : activeUnifiedTab
        ? `${activeUnifiedTab.kind}:${activeUnifiedTab.id}`
        : activeTabId;
  const visibleSshTerminalTabCount = terminalSplitExists
    ? activeConnectionTabs.filter(
        (tab) =>
          !terminalSplitMemberKeys.has(
            terminalPaneBindingKey({ kind: "ssh", tabId: tab.id }),
          ),
      ).length +
      (terminalSplitHost?.kind === "ssh" &&
      activeConnectionTabs.some((tab) => tab.id === terminalSplitHost.tabId)
        ? 1
        : 0)
    : activeConnectionTabs.length;
  const visibleLocalTerminalTabCount = terminalSplitExists
    ? localTerminalTabs.filter(
        (tab) =>
          !terminalSplitMemberKeys.has(
            terminalPaneBindingKey({ kind: "local", tabId: tab.id }),
          ),
      ).length + (terminalSplitHost?.kind === "local" ? 1 : 0)
    : localTerminalTabs.length;
  const sshWorkbenchTabCount =
    visibleSshTerminalTabCount +
    (isActiveTerminalFileUnified ? activeRemoteFileTabs.length : 0) +
    (activeConnectedTerminalTab ? 1 : 0);
  const sshTerminalTabScroll = useWorkbenchTabScroller({
    activeKey: terminalWorkbenchActiveTabKey,
    enabled: showTerminalWorkbench,
    itemCount:
      activeWorkspaceMode === "local"
        ? visibleLocalTerminalTabCount + 2 + (localTerminalProfilesError ? 1 : 0)
        : sshWorkbenchTabCount,
  });
  const rdpTabScroll = useWorkbenchTabScroller({
    activeKey: activeRdpSession?.id || null,
    enabled: showRdpWorkspace,
    itemCount: activeRdpSessions.length,
  });
  const vncTabScroll = useWorkbenchTabScroller({
    activeKey: activeVncSession?.id || null,
    enabled: showVncWorkspace,
    itemCount: activeVncSessions.length,
  });
  const shouldShowAiAssistantPanel = showWorkspaceToolPane && rightTool === "ai";
  const shouldRenderAiAssistantPanel =
    aiAssistantPanelLoaded || shouldShowAiAssistantPanel;
  const shouldRenderSettingsView = settingsViewLoaded || activeView === "settings";
  const SettingsViewComponent = LoadedSettingsView ?? SettingsView;
  const activeConnectionSelectionId =
    activeWorkspaceMode === "ssh" || activeWorkspaceMode === "rdp" || activeWorkspaceMode === "vnc"
      ? activeConnectionId
      : null;
  const activeTerminalDirectory = activeConnectedTerminalTab
    ? terminalDirectories[activeConnectedTerminalTab.id] || null
    : null;
  const activeAiTerminalTab = terminalSplitActive
    ? focusedTerminalSplitBinding?.kind === "local"
      ? localTerminalTabs.find((tab) => tab.id === focusedTerminalSplitBinding.tabId) || null
      : terminalTabs.find((tab) => tab.id === focusedTerminalSplitBinding?.tabId) || null
    : activeWorkspaceMode === "local"
      ? activeLocalTerminalTab
      : activeConnectedTerminalTab;
  const activeAiRecentTerminalOutput = activeAiTerminalTab
    ? terminalRecentOutputByTabId[activeAiTerminalTab.id] || ""
    : "";
  const activeAiTerminalTitle = activeAiTerminalTab?.title || null;
  const aiSendMessageShortcutBinding = resolveShortcutBindingById(
    settings.shortcuts.bindings,
    aiSendMessageShortcutActionId,
  );
  const workspaceSidebarFileBinding = resolveWorkspaceSidebarFileContext({
    activeTabId,
    activeWorkspaceMode,
    focusedBinding: focusedTerminalSplitBinding,
    showingHome,
    splitActive: terminalSplitActive,
    terminalDirectories,
    terminalTabs,
  });
  const workspaceSidebarFileContext = describeWorkspaceSidebarFiles(
    workspaceSidebarFileBinding, openSessionEntries, terminalTabs,
    terminalSplitActive ? terminalSplitPanes.findIndex((pane) => pane.id === focusedTerminalPaneId) + 1 : null, t,
  );
  const remoteFileConnection =
    showSessionWorkspace && activeConnectedTerminalTab ? activeConnection : null;
  const remoteFilePanelKey = showingRdp
    ? activeRdpSession?.id || "no-rdp-session"
    : showingVnc
      ? activeVncSession?.id || "no-vnc-session"
      : remoteFileConnection?.id || "no-active-connection";
  const sshRemoteFilePanelStack = useMemo(
    () =>
      buildSshRemoteFilePanelStack({
        activeTabId,
        activeWorkspaceMode,
        rightPaneCollapsed,
        rightTool,
        tabs: terminalTabs,
      }),
    [activeTabId, activeWorkspaceMode, rightPaneCollapsed, rightTool, terminalTabs],
  );
  // 依赖 terminalColorSchemesReady：数据预热完成后重新取值，确保终端在
  // 首屏 fallback 主题渲染后切换到用户选择的真实主题（缓存就绪前
  // getTerminalColorScheme 返回 fallback）。
  const terminalColorScheme = useMemo(
    () => getTerminalColorScheme(settings.terminalTheme.scheme),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [settings.terminalTheme.scheme, terminalColorSchemesReady],
  );
  const terminalTone = getTerminalColorSchemeTone(terminalColorScheme);
  const terminalFontFamily = resolveTerminalFontFamily(settings.appearance);
  const defaultLocalTerminalProfile = useMemo(
    () => localTerminalProfiles[0] || null,
    [localTerminalProfiles],
  );
  const terminalSplitSessionOptions = useMemo<TerminalSplitSessionOption[]>(
    () => [
      ...terminalTabs.map((tab) => {
        const connection = connectionById.get(tab.connectionId);
        return {
          binding: { kind: "ssh" as const, tabId: tab.id },
          group:
            tab.connectionId === activeConnectionId ? tr("workspace.connection.currentSsh") : tr("workspace.connection.otherSsh"),
          icon: <SquareTerminal className="ui-icon" aria-hidden="true" />,
          label: `${connection?.name || connection?.host || "SSH"} · ${tab.title}`,
          searchText: [
            connection?.name,
            connection?.username,
            connection?.host,
            connection?.port?.toString(),
            tab.title,
          ]
            .filter(Boolean)
            .join(" "),
          searchOpen: Boolean(terminalSearchByTabId[tab.id]?.open),
          status: tab.status,
          value: terminalPaneBindingKey({ kind: "ssh", tabId: tab.id }),
        };
      }),
      ...localTerminalTabs.map((tab) => {
        const source =
          tab.profileKind === "wsl"
            ? "WSL"
            : tab.source === "telnet"
              ? "Telnet"
              : tab.source === "serial"
                ? tr("workspace.local.serial")
                : tr("workspace.local.local");
        return {
          binding: { kind: "local" as const, tabId: tab.id },
          group:
            tab.profileKind === "wsl"
              ? "WSL"
              : tab.source === "local" || !tab.source
                ? tr("workspace.local.terminal")
                : tr("workspace.local.character"),
          icon: <LocalTerminalIcon className="ui-icon" kind={tab.profileKind} title={tab.title} />,
          label: `${source} · ${tab.title}`,
          searchText: `${source} ${tab.title}`,
          searchOpen: Boolean(terminalSearchByTabId[tab.id]?.open),
          status: tab.status,
          value: terminalPaneBindingKey({ kind: "local", tabId: tab.id }),
        };
      }),
      ...connections
        .filter(isSshConnection)
        .map((connection) => ({
          connectionId: connection.id,
          group: t("split.newSshInstanceGroup"),
          icon: (
            <ConnectionSystemLogo compact connection={connection} decorative />
          ),
          label: `${connection.name || connection.host} · ${formatConnectionAddress(connection)}`,
          searchText: [
            connection.name,
            connection.username,
            connection.host,
            connection.port?.toString(),
          ]
            .filter(Boolean)
            .join(" "),
          value: `connection:${connection.id}`,
        })),
      ...connections
        .filter(…86019 tokens truncated…=== "waiting_host_key") {
    return tr("workspace.step.hostKey");
  }
  if (step.status === "prompt") {
    return tr("workspace.step.authInfo");
  }
  return tr("workspace.step.execute");
}

function connectionStepPanelDescription(step: ConnectionStepState) {
  if (step.status === "success") {
    return tr("workspace.step.note.test");
  }
  if (step.status === "error") {
    return tr("workspace.step.note.error");
  }
  if (step.status === "waiting_host_key") {
    return tr("workspace.step.note.hostKey");
  }
  if (step.status === "prompt") {
    return tr("workspace.step.note.credential");
  }
  return tr("workspace.step.note.live");
}

function RemoteFilePropertiesTable({ metadata }: { metadata: RemoteFileEntryMetadata }) {
  return (
    <dl className="remote-file-properties">
      <div>
        <dt>{tr("workspace.file.meta.name")}</dt>
        <dd>{metadata.name}</dd>
      </div>
      <div>
        <dt>{tr("workspace.file.meta.type")}</dt>
        <dd>{remoteFileKindLabel(metadata.type)}</dd>
      </div>
      {shouldShowRemoteFileSize(metadata.type) ? (
        <div>
          <dt>{tr("workspace.file.meta.size")}</dt>
          <dd>{formatFileSize(metadata.size)}</dd>
        </div>
      ) : null}
      <div>
        <dt>{tr("workspace.file.meta.user")}</dt>
        <dd>{formatRemoteFileIdentity(metadata.owner, metadata.uid, "UID")}</dd>
      </div>
      <div>
        <dt>{tr("workspace.file.meta.group")}</dt>
        <dd>{formatRemoteFileIdentity(metadata.group, metadata.gid, "GID")}</dd>
      </div>
      <div>
        <dt>{tr("workspace.file.meta.permissions")}</dt>
        <dd>{metadata.mode || tr("workspace.file.meta.unknown")}</dd>
      </div>
      <div>
        <dt>{tr("workspace.file.meta.modified")}</dt>
        <dd>{formatRemoteFileTimestamp(metadata.mtime, tr("workspace.file.meta.unknown"))}</dd>
      </div>
      <div>
        <dt>{tr("workspace.file.meta.created")}</dt>
        <dd>{formatRemoteFileTimestamp(metadata.birthtime, tr("workspace.file.meta.unsupported"))}</dd>
      </div>
      <div>
        <dt>{tr("workspace.file.meta.path")}</dt>
        <dd>{metadata.path}</dd>
      </div>
    </dl>
  );
}

function ConnectionHome({
  start,
  connections,
  error,
  groups,
  hidden = false,
  loading,
  onConnect,
  onDelete,
  onEdit,
  onExportConnections,
  onImportConnections,
  onRefresh,
}: {
  start: ReactNode;
  connections: ConnectionProfile[];
  error: string | null;
  groups: ConnectionGroupCatalog;
  hidden?: boolean;
  loading: boolean;
  onConnect: (connection: ConnectionProfile) => void;
  onDelete: (connection: ConnectionProfile) => void | Promise<void>;
  onEdit: (connection: ConnectionProfile) => void;
  onExportConnections: () => void;
  onImportConnections: () => void;
  onRefresh: () => void | Promise<void>;
}) {
  const { t } = useI18n();
  const [filter, setFilter] = useState<ConnectionFilter>("recent");
  const [query, setQuery] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<ConnectionProfile | null>(null);
  const [latencyByConnectionId, setLatencyByConnectionId] = useState<Record<string, LatencyProbeState>>({});
  const latencyProbeRunRef = useRef(0);
  const rows = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    const sorted = [...connections].sort(sortConnectionsByRecent);
    const filteredByTab = sorted.filter((connection) => {
      if (filter === "all") {
        return true;
      }

      if (filter === "favorites") {
        return connection.is_favorite;
      }

      return connectionTimestampOf(connection.last_connected_at) > 0;
    });

    return filteredByTab.filter((connection) => {
      if (!normalizedQuery) {
        return true;
      }

      return [
        connection.name,
        connection.host,
        connection.username,
        connection.notes || "",
      ]
        .join(" ")
        .toLowerCase()
        .includes(normalizedQuery);
    });
  }, [connections, filter, query]);
  const favoriteCount = useMemo(
    () => connections.filter((connection) => connection.is_favorite).length,
    [connections],
  );
  const weekCount = useMemo(() => countConnectedWithinWeek(connections), [connections]);
  const activityConnections = useMemo(
    () =>
      [...connections]
        .filter((connection) => connectionTimestampOf(connection.last_connected_at) > 0)
        .sort(sortConnectionsByRecent)
        .slice(0, 2),
    [connections],
  );
  const isProbingLatency = useMemo(
    () => Object.values(latencyByConnectionId).some((state) => state.status === "checking"),
    [latencyByConnectionId],
  );
  const probeLatencies = useCallback((targets: ConnectionProfile[]) => {
    const uniqueTargets = targets.filter(
      (connection, index, items) =>
        items.findIndex((item) => item.id === connection.id) === index,
    );
    if (uniqueTargets.length === 0) {
      return;
    }

    const runId = latencyProbeRunRef.current;
    setLatencyByConnectionId((states) => {
      const nextStates = { ...states };
      uniqueTargets.forEach((connection) => {
        nextStates[connection.id] = { status: "checking" };
      });
      return nextStates;
    });

    uniqueTargets.forEach((connection) => {
      void measureConnectionLatency(connection).then((nextState) => {
        if (latencyProbeRunRef.current !== runId) {
          return;
        }

        setLatencyByConnectionId((states) => ({
          ...states,
          [connection.id]: nextState,
        }));
      });
    });
  }, []);

  useEffect(() => {
    if (hidden || loading || rows.length === 0) {
      return;
    }

    const pendingConnections = rows.filter((connection) => !latencyByConnectionId[connection.id]);
    if (pendingConnections.length > 0) {
      probeLatencies(pendingConnections);
    }
  }, [hidden, latencyByConnectionId, loading, probeLatencies, rows]);

  return (
    <section className={`connection-home ${hidden ? "is-hidden" : ""}`} aria-label={t("connectionHome.aria")} aria-hidden={hidden}>
      {start}
      <header className="repository-toolbar">
        <div className="toolbar-left">
          <div className="filter-tabs" aria-label={t("connectionHome.filterAria")}>
            <button
              className={`filter-tab ${filter === "recent" ? "active" : ""}`}
              type="button"
              onClick={() => setFilter("recent")}
            >
              <Clock3 className="ui-icon" aria-hidden="true" />
              <span>{t("connectionHome.filter.recent")}</span>
            </button>
            <button
              className={`filter-tab ${filter === "all" ? "active" : ""}`}
              type="button"
              onClick={() => setFilter("all")}
            >
              <List className="ui-icon" aria-hidden="true" />
              <span>{t("connectionHome.filter.all")}</span>
            </button>
            <button
              className={`filter-tab ${filter === "favorites" ? "active" : ""}`}
              type="button"
              onClick={() => setFilter("favorites")}
            >
              <Star className="ui-icon" aria-hidden="true" />
              <span>{t("connectionHome.filter.favorites")}</span>
            </button>
          </div>
          <label className="repository-search">
            <Search className="ui-icon" aria-hidden="true" />
            <input
              aria-label={t("connectionHome.searchAria")}
              placeholder={t("connectionHome.searchPlaceholder")}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>
        </div>

        <div className="toolbar-right">
          <Tooltip label={t("connectionHome.refresh")}>
            <button
              className="repository-icon-button"
              type="button"
              aria-label={t("connectionHome.refresh")}
              disabled={loading}
              onClick={() => void refreshConnectionsAndLatency()}
            >
              <RefreshCw className={`ui-icon ${loading || isProbingLatency ? "spin" : ""}`} aria-hidden="true" />
            </button>
          </Tooltip>
        </div>
      </header>

      <div className="connection-home-body">
        <section className="connection-board" aria-label={t("connectionHome.tableAria")}>
          <div className="connection-head" role="row">
            <span>{t("connectionHome.column.system")}</span>
            <span>{t("connectionHome.column.last")}</span>
            <span>{t("connectionHome.column.latency")}</span>
            <span>{t("connectionHome.column.name")}</span>
            <span>{t("connectionHome.column.notes")}</span>
            <span className="action-head">{t("connectionHome.column.actions")}</span>
          </div>
          <div className="connection-board-body">
            {loading ? <p className="connection-board-note">{t("connectionHome.loading")}</p> : null}
            {error ? <p className="connection-board-error">{error}</p> : null}
            {!loading && rows.length === 0 ? (
              <p className="connection-board-note">{t("connectionHome.empty")}</p>
            ) : null}

            {rows.map((connection) => {
              const latencyState = latencyByConnectionId[connection.id];
              const lastConnectedAt = connection.last_connected_at;
              const hasLastConnectedAt = Boolean(lastConnectedAt);

              return (
                <div className="connection-row" role="row" key={connection.id}>
                  <span className="system-cell">
                    <ConnectionSystemLogo connection={connection} />
                  </span>
                  <span className="last-cell">
                    <strong>{hasLastConnectedAt ? formatRelativeTime(lastConnectedAt, t) : t("connectionHome.neverConnected")}</strong>
                    <span>
                      {lastConnectedAt === "demo"
                        ? t("connectionHome.recentUse")
                        : hasLastConnectedAt
                          ? t("connectionHome.recentConnection")
                          : t("connectionHome.awaitingFirst")}
                    </span>
                  </span>
                  <span className="latency-cell">
                    <LatencyIndicator state={latencyState} />
                  </span>
                  <span className="name-cell">
                    <button
                      className="connection-name-link"
                      type="button"
                      aria-label={t("connectionHome.open", { name: connection.name })}
                      title={t("connectionHome.open", { name: connection.name })}
                      onClick={() => onConnect(connection)}
                    >
                      <span className="connection-name">{connection.name}</span>
                      <span className="connection-user">{connection.username}@{connection.host}:{connection.port.toString()}</span>
                    </button>
                  </span>
                  <span className="remark-cell">
                    <span className="remark-main">{primaryNote(connection)}</span>
                  </span>
                  <span className="action-cell">
                    <button
                      className="connection-action-icon connect"
                      type="button"
                      aria-label={t("connectionHome.connect", { name: connection.name })}
                      title={t("connectionHome.connectTitle")}
                      onClick={() => onConnect(connection)}
                    >
                      <Play className="ui-icon" aria-hidden="true" />
                    </button>
                    <button
                      className="connection-action-icon"
                      type="button"
                      aria-label={t("connectionHome.edit", { name: connection.name })}
                      title={t("connectionHome.editTitle")}
                      onClick={() => onEdit(connection)}
                    >
                      <Pencil className="ui-icon" aria-hidden="true" />
                    </button>
                    <button
                      className="connection-action-icon"
                      type="button"
                      aria-label={t("connectionHome.delete", { name: connection.name })}
                      title={t("connectionHome.deleteTitle")}
                      onClick={() => setDeleteTarget(connection)}
                    >
                      <Trash2 className="ui-icon" aria-hidden="true" />
                    </button>
                  </span>
                </div>
              );
            })}
          </div>
        </section>

        <aside className="side-summary" aria-label={t("connectionHome.summaryAria")}>
          <section className="summary-block">
            <p className="summary-title">{t("connectionHome.overview")}</p>
            <div className="summary-grid">
              <div className="summary-item">
                <strong>{connections.length.toString()}</strong>
                <span>{t("connectionHome.connections")}</span>
              </div>
              <div className="summary-item">
                <strong>{groups.groups.length.toString()}</strong>
                <span>{t("connectionHome.groups")}</span>
              </div>
              <div className="summary-item">
                <strong>{favoriteCount.toString()}</strong>
                <span>{t("connectionHome.favorites")}</span>
              </div>
              <div className="summary-item">
                <strong>{weekCount.toString()}</strong>
                <span>{t("connectionHome.week")}</span>
              </div>
            </div>
          </section>

          <section className="summary-block">
            <p className="summary-title">{t("connectionHome.maintenance")}</p>
            <div className="quick-links">
              <button className="quick-link" type="button" onClick={onImportConnections}>
                <Upload className="ui-icon" aria-hidden="true" />
                <span>
                  <strong>{t("connectionHome.import")}</strong>
                  <small>{t("connectionHome.importHint")}</small>
                </span>
              </button>
              <button className="quick-link" type="button" onClick={onExportConnections}>
                <Download className="ui-icon" aria-hidden="true" />
                <span>
                  <strong>{t("connectionHome.export")}</strong>
                  <small>{t("connectionHome.exportHint")}</small>
                </span>
              </button>
            </div>
          </section>

          <section className="summary-block">
            <p className="summary-title">{t("connectionHome.recentActivity")}</p>
            <div className="activity-list">
              {activityConnections.length > 0 ? (
                activityConnections.map((connection) => (
                  <button
                    className="activity-row"
                    key={connection.id}
                    type="button"
                    onClick={() => onConnect(connection)}
                  >
                    <span className="latency-dot" />
                    <span>
                      <strong>{connection.name}</strong>
                      <span>{formatRelativeTime(connection.last_connected_at, t)}</span>
                    </span>
                  </button>
                ))
              ) : (
                <p className="connection-board-note">{t("connectionHome.noRecent")}</p>
              )}
            </div>
          </section>
        </aside>
      </div>
      <ConfirmDialog
        confirmLabel={t("connectionHome.deleteConfirm")}
        description={
          deleteTarget ? t("connectionHome.deleteDescription", { name: deleteTarget.name }) : ""
        }
        open={Boolean(deleteTarget)}
        title={t("connectionHome.deleteDialogTitle")}
        onConfirm={async () => {
          if (deleteTarget) {
            await onDelete(deleteTarget);
          }
        }}
        onOpenChange={(open) => {
          if (!open) {
            setDeleteTarget(null);
          }
        }}
      />
    </section>
  );

  async function refreshConnectionsAndLatency() {
    latencyProbeRunRef.current += 1;
    setLatencyByConnectionId({});
    await onRefresh();
  }
}

function LatencyIndicator({ state }: { state?: LatencyProbeState }) {
  if (!state) {
    return (
      <>
        <span className="latency-dot idle" />
        <span>{tr("workspace.probe.notTested")}</span>
      </>
    );
  }

  if (state.status === "checking") {
    return (
      <>
        <Loader2 className="ui-icon latency-spinner spin" aria-hidden="true" />
        <span>{tr("workspace.probe.running")}</span>
      </>
    );
  }

  if (state.status === "failed") {
    return (
      <>
        <span className="latency-dot fail" />
        <span>{tr("workspace.probe.timeout")}</span>
      </>
    );
  }

  return (
    <>
      <span className={`latency-dot ${state.latencyMs > 60 ? "warn" : ""}`} />
      <span>{state.latencyMs.toString()} ms</span>
    </>
  );
}

async function measureConnectionLatency(connection: ConnectionProfile): Promise<LatencyProbeState> {
  if (!hasTauriRuntime() || connection.created_at === "demo" || connection.created_at === "preview") {
    await wait(120 + (latencySeed(connection) % 180));
    return { latencyMs: estimateLatency(connection), status: "ok" };
  }

  try {
    const result = await connectionProbeLatency(connection.id);
    if (result.reachable && typeof result.latency_ms === "number") {
      return { latencyMs: result.latency_ms, status: "ok" };
    }
  } catch {
    return { status: "failed" };
  }

  return { status: "failed" };
}

function primaryNote(connection: ConnectionProfile) {
  const note = connection.notes?.trim();
  if (!note) {
    return "";
  }

  return note.split(/[;；,，]/)[0]?.trim() || note;
}

function estimateLatency(connection: ConnectionProfile) {
  return 4 + (latencySeed(connection) % 66);
}

function latencySeed(connection: ConnectionProfile) {
  return Array.from(`${connection.host}:${connection.port.toString()}`).reduce(
    (total, char) => total + char.charCodeAt(0),
    0,
  );
}

function wait(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function vncRunnerWindowUrl() {
  const url = new URL(window.location.href);
  url.search = "view=vnc-runner";
  url.hash = "";
  return url.toString();
}

function waitForWebviewWindowCreation(
  windowRef: import("@tauri-apps/api/webviewWindow").WebviewWindow,
) {
  return new Promise<void>((resolve, reject) => {
    let settled = false;
    const finish = (callback: () => void) => {
      if (settled) {
        return;
      }
      settled = true;
      callback();
    };

    void windowRef.once("tauri://created", () => {
      finish(resolve);
    });
    void windowRef.once("tauri://error", (event) => {
      finish(() => reject(event.payload));
    });
  });
}

function countConnectedWithinWeek(connections: ConnectionProfile[]) {
  const now = Date.now();
  const week = 7 * 24 * 60 * 60 * 1000;
  const dated = connections.filter((connection) => connectionTimestampOf(connection.last_connected_at) > 0);

  return dated.filter((connection) => now - connectionTimestampOf(connection.last_connected_at) <= week).length;
}

function getWorkspaceWidth(element: HTMLElement | null) {
  return Math.max(element?.getBoundingClientRect().width || window.innerWidth, 0);
}

function getElementHeight(element: HTMLElement | null) {
  return Math.max(element?.getBoundingClientRect().height || 0, 0);
}

function clampEditorTerminalSplitPercent(percent: number) {
  return Math.round(
    Math.min(
      maxEditorTerminalSplitPercent,
      Math.max(minEditorTerminalSplitPercent, percent),
    ),
  );
}

function clampPaneWidth(
  side: ResizablePaneSide,
  width: number,
  containerWidth: number,
  oppositeWidth: number,
) {
  const minimumWidth = side === "left" ? minLeftPaneWidth : minRightPaneWidth;
  const maximumPresetWidth = side === "left" ? maxLeftPaneWidth : maxRightPaneWidth;
  const maximumLayoutWidth = Math.max(
    minimumWidth,
    containerWidth - oppositeWidth - minCenterPaneWidth,
  );

  return Math.round(
    Math.min(maximumPresetWidth, maximumLayoutWidth, Math.max(minimumWidth, width)),
  );
}

function removeDirectoryState<T>(
  directories: Record<string, T>,
  tabIds: string[],
): Record<string, T> {
  if (tabIds.length === 0) {
    return directories;
  }

  const next = { ...directories };
  tabIds.forEach((tabId) => {
    delete next[tabId];
  });
  return next;
}

function nextTerminalOrdinalForConnection(tabs: TerminalTab[], connectionId: string) {
  return nextOrdinal(tabs.filter((tab) => tab.connectionId === connectionId).map((tab) => tab.ordinal));
}

/** 工作区内终端子标签标题；编号显示规则与顶层实例标签共用 `displayOrdinal`（WS-E11）。 */
function terminalTabTitle(ordinal: number) {
  const displayNumber = displayOrdinal(ordinal);
  return displayNumber === null ? tr("workspace.terminal.title") : tr("workspace.terminal.numbered", { number: displayNumber });
}

function shortDockerRuntimeId(id: string) {
  return id.replace(/^sha256:/, "").slice(0, 12) || id;
}

function quotePosixShellForTerminal(value: string) {
  return `'${value.replace(/'/g, "'\"'\"'")}'`;
}

function formatError(error: unknown) {
  if (typeof error === "object" && error !== null && "message" in error) {
    return String((error as { message: unknown }).message);
  }
  return String(error);
}

function formatDetailedError(error: unknown) {
  const message = formatError(error);
  const rawMessage =
    typeof error === "object" && error !== null && "raw_message" in error
      ? normalizeErrorText((error as { raw_message: unknown }).raw_message)
      : "";
  if (rawMessage && rawMessage !== normalizeErrorText(message)) {
    return `${message}\n${rawMessage}`;
  }
  // raw_message 缺失时用诊断 ID 兜底，保证用户报障时仍有可对上内部日志的线索。
  const diagnosticId = errorDiagnosticId(error);
  if (!rawMessage && diagnosticId) {
    return `${message}\n${tr("workspace.diagnostic", { id: diagnosticId })}`;
  }
  return message;
}

function isTransferCanceledError(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    String((error as { code: unknown }).code) === "remote_file_transfer_canceled"
  );
}

function extractTransferErrorCode(error: unknown): string | null {
  if (
    typeof error === "object" &&
    error !== null &&
    "code" in error
  ) {
    return String((error as { code: unknown }).code);
  }
  return null;
}

function transferErrorStage(code: string): string | null {
  if (code === "remote_file_upload_confirm_timeout") {
    return tr("workspace.sftp.writeTimeout");
  }
  if (code === "remote_file_upload_confirm_failed") {
    return tr("workspace.sftp.writeFailed");
  }
  if (
    code === "remote_sftp_subsystem_failed" ||
    code === "remote_sftp_subsystem_timeout"
  ) {
    return tr("workspace.sftp.unavailable");
  }
  if (
    code === "remote_sftp_connect_failed" ||
    code.startsWith("remote_sftp_connect_")
  ) {
    return tr("workspace.sftp.connectionFailed");
  }
  if (
    code === "remote_sftp_channel_failed" ||
    code === "remote_sftp_init_failed" ||
    code === "remote_sftp_channel_timeout"
  ) {
    return tr("workspace.sftp.channelFailed");
  }
  if (code === "remote_sftp_auth_timeout") {
    return tr("workspace.sftp.authTimeout");
  }
  return null;
}

function transferErrorSuggestion(code: string): string | null {
  if (code === "remote_file_upload_confirm_timeout") {
    return tr("workspace.sftp.suggestion.writeTimeout");
  }
  if (code === "remote_file_upload_confirm_failed") {
    return tr("workspace.sftp.suggestion.writeFailed");
  }
  if (
    code === "remote_sftp_subsystem_failed" ||
    code === "remote_sftp_subsystem_timeout"
  ) {
    return tr("workspace.sftp.suggestion.unavailable");
  }
  if (
    code === "remote_sftp_connect_failed" ||
    code.startsWith("remote_sftp_connect_")
  ) {
    return tr("workspace.sftp.suggestion.connection");
  }
  if (
    code === "remote_sftp_channel_failed" ||
    code === "remote_sftp_init_failed" ||
    code === "remote_sftp_channel_timeout"
  ) {
    return tr("workspace.sftp.suggestion.channel");
  }
  if (code === "remote_sftp_auth_timeout") {
    return tr("workspace.sftp.suggestion.authTimeout");
  }
  return null;
}

function appendUniqueLogs(logs: string[], nextLines: string[]) {
  const next = [...logs];
  nextLines
    .map((line) => line.trim())
    .filter(Boolean)
    .forEach((line) => {
      if (next[next.length - 1] !== line) {
        next.push(line);
      }
    });
  return next;
}

function describeConnectionStepError(error: unknown): ConnectionStepErrorDetail {
  const code =
    typeof error === "object" && error !== null && "code" in error
      ? String((error as { code: unknown }).code)
      : "unknown_error";
  const message = formatError(error);
  // raw_message 只用于展示底层原因，不参与任何判定；字段缺失时退回 message。
  const rawMessage =
    typeof error === "object" && error !== null && "raw_message" in error
      ? normalizeErrorText((error as { raw_message: unknown }).raw_message)
      : "";
  const recoverable =
    typeof error === "object" && error !== null && "recoverable" in error
      ? Boolean((error as { recoverable: unknown }).recoverable)
      : true;
  const diagnosticId = errorDiagnosticId(error);

  return {
    code,
    message: connectionErrorSummary(code, message),
    // raw_message 下线后仍要给出可追溯的线索：优先展示诊断 ID，供用户报障时对上内部日志。
    rawMessage: rawMessage || (diagnosticId ? tr("workspace.diagnostic", { id: diagnosticId }) : message),
    recoverable,
    stage: connectionErrorStage(code),
    suggestion: connectionErrorSuggestion(code),
  };
}

function normalizeErrorText(value: unknown) {
  return String(value ?? "")
    .replace(/^Error:\s*/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

function connectionErrorStage(code: string) {
  if (isConnectTimeoutCode(code)) {
    return tr("workspace.error.stage.networkTimeout");
  }
  if (isConnectionStageError(code)) {
    return tr("workspace.error.stage.network");
  }
  if (code === "host_key_unknown" || code === "host_key_changed") {
    return tr("workspace.error.stage.hostKey");
  }
  if (
    code === "terminal_auth_failed" ||
    code === "terminal_auth_rejected" ||
    code === "terminal_auth_timeout" ||
    code === "terminal_private_key_invalid" ||
    code === "terminal_private_key_passphrase" ||
    code === "terminal_private_key_not_found" ||
    code.startsWith("credential_")
  ) {
    return tr("workspace.error.stage.auth");
  }
  if (
    code === "terminal_channel_open_failed" ||
    code === "terminal_pty_failed" ||
    code === "terminal_shell_failed"
  ) {
    return tr("workspace.error.stage.terminal");
  }
  return tr("workspace.error.stage.connection");
}

function connectionErrorSuggestion(code: string) {
  const networkKind = connectionNetworkKind(code);
  if (networkKind === "timeout") {
    return tr("workspace.error.suggest.networkTimeout");
  }
  if (networkKind === "refused") {
    return tr("workspace.error.suggest.refused");
  }
  if (networkKind === "unreachable") {
    return tr("workspace.error.suggest.unreachable");
  }
  if (networkKind === "reset") {
    return tr("workspace.error.suggest.reset");
  }
  if (code.startsWith("proxy_")) {
    return tr("workspace.error.suggest.proxy");
  }
  if (code === "terminal_auth_rejected") {
    return tr("workspace.error.suggest.auth");
  }
  if (code === "terminal_private_key_invalid") {
    return tr("workspace.error.suggest.keyFormat");
  }
  if (code === "terminal_private_key_passphrase") {
    return tr("workspace.error.suggest.passphrase");
  }
  if (code === "terminal_private_key_not_found") {
    return tr("workspace.error.suggest.keyFile");
  }
  if (code === "terminal_auth_failed" || code === "terminal_auth_timeout") {
    return tr("workspace.error.suggest.authMethod");
  }
  if (code === "host_key_changed") {
    return tr("workspace.error.suggest.hostKeyChanged");
  }
  if (code === "host_key_unknown") {
    return tr("workspace.error.suggest.hostKeyUnknown");
  }
  if (code === "terminal_pty_failed" || code === "terminal_shell_failed") {
    return tr("workspace.error.suggest.terminal");
  }
  return tr("workspace.error.suggest.generic");
}

function connectionErrorSummary(code: string, fallback: string) {
  const networkKind = connectionNetworkKind(code);
  if (networkKind === "timeout") {
    return tr("workspace.error.timeout");
  }
  if (networkKind === "refused") {
    return tr("workspace.error.refused");
  }
  if (networkKind === "unreachable") {
    return tr("workspace.error.unreachable");
  }
  return fallback;
}

function toWindowsPtyOption(
  info: WindowsPtyInfo | null,
  platform: string,
): IWindowsPty | undefined {
  if (platform !== "windows") {
    return undefined;
  }

  return {
    backend: info?.backend || "conpty",
    buildNumber:
      typeof info?.build_number === "number" ? info.build_number : undefined,
  };
}

function previewLocalTerminalProfiles(platform: string): LocalTerminalProfile[] {
  if (platform === "windows") {
    return [
      buildPreviewLocalTerminalProfile({
        args: ["-NoLogo", "-NoProfile"],
        command: "pwsh.exe",
        icon: "terminal-powershell",
        id: "pwsh",
        kind: "powershell_core",
        name: "PowerShell 7",
        platform,
      }),
      buildPreviewLocalTerminalProfile({
        args: ["-NoLogo", "-NoProfile"],
        command: "powershell.exe",
        icon: "terminal-powershell",
        id: "powershell",
        kind: "powershell",
        name: "Windows PowerShell",
        platform,
      }),
      buildPreviewLocalTerminalProfile({
        args: [],
        command: "cmd.exe",
        icon: "terminal-cmd",
        id: "cmd",
        kind: "cmd",
        name: tr("workspace.local.previewCmd"),
        platform,
      }),
      buildPreviewLocalTerminalProfile({
        args: ["--login", "-i"],
        command: "bash.exe",
        icon: "terminal-git-bash",
        id: "git-bash",
        kind: "git_bash",
        name: "Git Bash",
        platform,
      }),
    ];
  }

  const unixPlatform = platform === "macos" ? "macos" : "linux";
  return [
    buildPreviewLocalTerminalProfile({
      args: [],
      command: "zsh",
      icon: "terminal-zsh",
      id: "zsh",
      kind: "zsh",
      name: "zsh",
      platform: unixPlatform,
    }),
    buildPreviewLocalTerminalProfile({
      args: [],
      command: "bash",
      icon: "terminal-bash",
      id: "bash",
      kind: "bash",
      name: "bash",
      platform: unixPlatform,
    }),
    buildPreviewLocalTerminalProfile({
      args: [],
      command: "pwsh",
      icon: "terminal-powershell",
      id: "pwsh",
      kind: "pwsh",
      name: "PowerShell 7",
      platform: unixPlatform,
    }),
  ];
}

function buildPreviewLocalTerminalProfile(
  input: Omit<LocalTerminalProfile, "cwd" | "detected" | "env" | "hidden" | "source">,
): LocalTerminalProfile {
  return {
    ...input,
    cwd: null,
    detected: true,
    env: {},
    hidden: false,
    source: "detected",
  };
}

function mergeLocalTerminalProfiles(
  detectedProfiles: LocalTerminalProfile[],
  customProfiles: LocalTerminalProfileInput[],
  hiddenProfileIds: string[],
) {
  const hiddenIdSet = new Set(hiddenProfileIds);
  const byId = new Map<string, LocalTerminalProfile>();

  detectedProfiles.forEach((profile) => {
    if (!hiddenIdSet.has(profile.id) && !profile.hidden) {
      byId.set(profile.id, profile);
    }
  });

  customProfiles.forEach((profile, index) => {
    const normalized = normalizeLocalTerminalProfileInput(profile, index);
    if (normalized && !normalized.hidden && !hiddenIdSet.has(normalized.id)) {
      byId.set(normalized.id, normalized);
    }
  });

  return Array.from(byId.values()).sort((left, right) =>
    localTerminalProfileSortKey(left).localeCompare(localTerminalProfileSortKey(right), "zh-Hans"),
  );
}

function normalizeLocalTerminalProfileInput(
  profile: LocalTerminalProfileInput,
  index = 0,
): LocalTerminalProfile | null {
  const id = (profile.id || "").trim() || `custom-${index.toString()}`;
  const name = profile.name.trim();
  const kind = profile.kind.trim();
  const command = profile.command.trim();
  if (!name || !kind || !command) {
    return null;
  }

  return {
    args: profile.args.filter((item) => item.trim().length > 0),
    command,
    cwd: profile.cwd?.trim() || null,
    detected: profile.detected,
    env: Object.fromEntries(
      Object.entries(profile.env).map(([key, value]) => [key.trim(), value.trim()]),
    ),
    hidden: profile.hidden,
    icon: profile.icon || `terminal-${kind}`,
    id,
    kind,
    name,
    platform: profile.platform || "all",
    source: profile.source || "custom",
  };
}

function localTerminalProfileSortKey(profile: LocalTerminalProfile) {
  return `${localTerminalProfileRank(profile.kind).toString().padStart(2, "0")}:${profile.name}:${profile.id}`;
}

function localTerminalProfileRank(kind: string) {
  switch (kind) {
    case "powershell_core":
    case "pwsh":
      return 0;
    case "powershell":
      return 1;
    case "cmd":
      return 2;
    case "wsl":
      return 3;
    case "git_bash":
      return 4;
    case "bash":
      return 5;
    case "zsh":
      return 6;
    case "fish":
      return 7;
    default:
      return 20;
  }
}

function toLocalTerminalProfileInput(profile: LocalTerminalProfile): LocalTerminalProfileInput {
  return {
    args: [...profile.args],
    command: profile.command,
    cwd: profile.cwd || null,
    detected: profile.detected,
    env: { ...profile.env },
    hidden: profile.hidden,
    icon: profile.icon,
    id: profile.id,
    kind: profile.kind,
    name: profile.name,
    platform: profile.platform,
    source: profile.source,
  };
}

function buildCommandSnippetDraft(
  command: string,
  group = commandSnippetRootGroup,
): CommandSnippetDraft {
  const normalizedCommand = command.trim();
  return {
    command: normalizedCommand,
    description: "",
    favorite: false,
    group: normalizeCommandSnippetGroupValue(group),
    tagsText: "",
    title: commandSnippetTitleFromCommand(normalizedCommand),
  };
}

function commandSnippetToDraft(snippet: CommandSnippet): CommandSnippetDraft {
  return {
    command: snippet.command,
    description: snippet.description || "",
    favorite: snippet.favorite,
    group: normalizeCommandSnippetGroupValue(snippet.group),
    id: snippet.id,
    tagsText: snippet.tags.join(", "),
    title: snippet.title,
  };
}

function commandSnippetToInput(snippet: CommandSnippet, group: string) {
  return {
    command: snippet.command,
    description: snippet.description || null,
    favorite: snippet.favorite,
    group: normalizeCommandSnippetGroupValue(group) || null,
    id: snippet.id,
    tags: snippet.tags,
    title: snippet.title,
  };
}

function normalizeCommandSnippetGroupValue(group?: string | null) {
  const normalizedGroup = group?.trim() || commandSnippetRootGroup;
  return normalizedGroup === legacyCommandSnippetGroup ? commandSnippetRootGroup : normalizedGroup;
}

function buildCommandSnippetGroupCatalog(
  snippets: CommandSnippet[],
  localGroups: string[],
) {
  const groups = new Set<string>();
  snippets.forEach((snippet) => {
    const group = normalizeCommandSnippetGroupValue(snippet.group);
    if (group) {
      groups.add(group);
    }
  });
  localGroups.forEach((groupName) => {
    const group = normalizeCommandSnippetGroupValue(groupName);
    if (group) {
      groups.add(group);
    }
  });
  return Array.from(groups).sort((left, right) => left.localeCompare(right, "zh-Hans"));
}

function appendCommandSnippetLocalGroup(groups: string[], groupName: string) {
  const normalizedGroup = normalizeCommandSnippetGroupValue(groupName);
  if (!normalizedGroup || groups.includes(normalizedGroup)) {
    return groups;
  }
  return [...groups, normalizedGroup].sort((left, right) => left.localeCompare(right, "zh-Hans"));
}

function commandSnippetTitleFromCommand(command: string) {
  const firstLine = command
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find(Boolean);
  return firstLine ? truncateCommandLabel(firstLine, 32) : "";
}

function parseCommandSnippetTags(value: string) {
  return value
    .split(/[,，]/)
    .map((tag) => tag.trim())
    .filter(Boolean);
}

function truncateCommandLabel(value: string, maxLength: number) {
  if (value.length <= maxLength) {
    return value;
  }
  return `${value.slice(0, Math.max(0, maxLength - 3))}...`;
}

function upsertCommandSnippet(
  snippets: CommandSnippet[],
  snippet: CommandSnippet,
): CommandSnippet[] {
  return [
    snippet,
    ...snippets.filter((item) => item.id !== snippet.id),
  ].sort(compareCommandSnippets);
}

function compareCommandSnippets(left: CommandSnippet, right: CommandSnippet) {
  if (left.favorite !== right.favorite) {
    return left.favorite ? -1 : 1;
  }
  return (
    compareCommandLibraryTimestampsDesc(left.last_used_at, right.last_used_at) ||
    compareCommandLibraryTimestampsDesc(left.updated_at, right.updated_at) ||
    left.title.localeCompare(right.title, "zh-Hans")
  );
}

function commandLibraryRestartMessage() {
  return tr("workspace.snippet.restartRequired");
}

function isCommandLibraryCommandMissingError(error: unknown) {
  return (
    isTauriCommandMissingError(error, "command_snippet_list") ||
    isTauriCommandMissingError(error, "command_history_list") ||
    isTauriCommandMissingError(error, "command_snippet_upsert") ||
    isTauriCommandMissingError(error, "command_snippet_delete") ||
    isTauriCommandMissingError(error, "command_snippet_mark_used") ||
    isTauriCommandMissingError(error, "command_history_record") ||
    isTauriCommandMissingError(error, "command_history_delete") ||
    isTauriCommandMissingError(error, "command_history_clear")
  );
}

function isTauriCommandMissingError(error: unknown, commandName: string) {
  const message = formatError(error).toLowerCase();
  const normalizedCommandName = commandName.toLowerCase();
  const singleQuote = String.fromCharCode(39);
  return (
    message.includes(`command ${normalizedCommandName} not found`) ||
    message.includes(`command ${singleQuote}${normalizedCommandName}${singleQuote} not found`) ||
    message.includes(`command "${normalizedCommandName}" not found`)
  );
}

function formatConnectionAddress(connection: ConnectionProfile) {
  if ((connection.protocol || "ssh") === "telnet") {
    return `${connection.host}:${connection.port.toString()}`;
  }
  if ((connection.protocol || "ssh") === "serial") {
    return connection.serial?.port_name || connection.host;
  }
  return `${connection.username}@${connection.host}:${connection.port.toString()}`;
}

function isRdpConnection(
  connection?: ConnectionProfile | null,
): connection is RdpConnectionProfile {
  return (connection?.protocol || "ssh") === "rdp";
}

function isVncConnection(
  connection?: ConnectionProfile | null,
): connection is VncConnectionProfile {
  return (connection?.protocol || "ssh") === "vnc";
}

function isTelnetConnection(
  connection?: ConnectionProfile | null,
): connection is TelnetConnectionProfile {
  return (connection?.protocol || "ssh") === "telnet";
}

function isSerialConnection(
  connection?: ConnectionProfile | null,
): connection is SerialConnectionProfile {
  return (connection?.protocol || "ssh") === "serial";
}

function measureRdpEmbeddedViewport(element: HTMLElement | null): RdpEmbeddedBounds | null {
  if (!element || !element.isConnected) {
    return null;
  }
  const rect = element.getBoundingClientRect();
  const scale = window.devicePixelRatio || 1;
  const width = Math.round(rect.width * scale);
  const height = Math.round(rect.height * scale);
  if (width < 120 || height < 90) {
    return null;
  }
  return {
    x: Math.round(rect.left * scale),
    y: Math.round(rect.top * scale),
    width,
    height,
  };
}

function hiddenRdpEmbeddedBounds(): RdpEmbeddedBounds {
  return {
    x: -32000,
    y: -32000,
    width: 120,
    height: 90,
  };
}

function isSshConnection(
  connection?: ConnectionProfile | null,
): connection is SshConnectionProfile {
  // 缺省协议只兼容已有 profile；关闭会话的过渡帧可能没有活动连接。
  return Boolean(connection) && (connection?.protocol || "ssh") === "ssh";
}

function rdpStatusLabel(status: RdpSessionStatus) {
  switch (status) {
    case "launching":
      return tr("workspace.rdp.status.starting");
    case "embedded":
      return tr("workspace.rdp.status.embedded");
    case "native":
      return tr("workspace.rdp.status.native");
    case "external":
      return tr("workspace.rdp.status.external");
    case "error":
      return tr("workspace.step.failed");
    default:
      return "RDP";
  }
}

function rdpRenderModeLabel(mode: string) {
  switch (mode) {
    case "embedded":
      return tr("workspace.rdp.runner.embedded");
    case "external":
      return tr("workspace.rdp.status.external");
    case "custom":
      return tr("workspace.rdp.runner.custom");
    default:
      return tr("workspace.rdp.runner.auto");
  }
}

function rdpDisplaySummary(
  display?: NonNullable<ConnectionProfile["rdp"]>["display"] | null,
) {
  if (!display) {
    return tr("workspace.rdp.display.default");
  }
  const size =
    display.mode === "fullscreen" || display.mode === "all_monitors"
      ? rdpDisplayModeLabel(display.mode)
      : `${(display.width || 1440).toString()} x ${(display.height || 900).toString()}`;
  const flags = [
    display.dynamic_resize ? tr("workspace.rdp.display.dynamic") : null,
    display.use_multimon ? tr("workspace.rdp.display.multimon") : null,
  ].filter(Boolean);
  return [size, ...flags].join(" · ");
}

function rdpDisplayModeLabel(mode: string) {
  switch (mode) {
    case "embedded":
      return tr("workspace.rdp.display.embedded");
    case "windowed":
      return tr("workspace.rdp.display.window");
    case "fullscreen":
      return tr("workspace.rdp.display.fullscreen");
    case "all_monitors":
      return tr("workspace.rdp.display.fullscreenAll");
    default:
      return tr("workspace.rdp.display.defaultMode");
  }
}

function rdpResourceSummary(
  resources?: NonNullable<ConnectionProfile["rdp"]>["resources"] | null,
) {
  if (!resources) {
    return tr("workspace.rdp.resources.default");
  }
  const enabled = [
    resources.clipboard ? tr("workspace.rdp.resources.clipboard") : null,
    resources.drives ? tr("workspace.rdp.resources.drives") : null,
    resources.printers ? tr("workspace.rdp.resources.printers") : null,
    resources.smart_cards ? tr("workspace.rdp.resources.smartCards") : null,
    resources.audio !== "disabled" ? tr("workspace.rdp.resources.audio", { mode: rdpAudioLabel(resources.audio) }) : null,
  ].filter(Boolean);
  return enabled.length ? enabled.join(" · ") : tr("workspace.rdp.resources.none");
}

function rdpAudioLabel(mode: string) {
  if (mode === "remote") {
    return tr("workspace.rdp.audio.remote");
  }
  if (mode === "disabled") {
    return tr("workspace.rdp.audio.disabled");
  }
  return tr("workspace.rdp.audio.local");
}

function previewRdpLaunchForBrowser(
  connection: ConnectionProfile,
  platform: DesktopPlatform = resolveDesktopPlatform(),
): RdpLaunchPreview {
  const config = connection.rdp;
  const renderMode = config?.runner.render_mode || "embedded";
  const externalRunner = defaultRdpExternalRunnerForPlatform(platform);
  const runner: RdpRunnerKind =
    config?.runner.preferred_runner ||
    (renderMode === "custom"
      ? "custom"
      : renderMode === "embedded" && platform === "windows"
        ? "mstsc_activex"
        : externalRunner);
  const executable =
    runner === "custom"
      ? config?.runner.custom_executable || "custom-rdp-client"
      : runner === "freerdp"
        ? "xfreerdp"
        : runner === "macos_app"
          ? "/usr/bin/open"
        : runner === "mstsc_activex"
          ? "mstscax.dll"
          : "mstsc.exe";
  const args =
    runner === "freerdp"
      ? [
          `/v:${connection.host}:${connection.port.toString()}`,
          `/u:${connection.username}`,
          ...(config?.domain ? [`/d:${config.domain}`] : []),
          "/dynamic-resolution",
          "/clipboard",
        ]
      : runner === "custom"
        ? [config?.runner.custom_args_template || "{rdp_file}"]
        : runner === "macos_app"
          ? ["<generated.rdp>"]
        : runner === "mstsc_activex"
          ? []
          : ["<generated.rdp>"];
  const warnings = [
    tr("workspace.rdp.preview.browser"),
    tr("workspace.rdp.preview.noPassword"),
    config?.raw_rdp_settings?.trim()
      ? tr("workspace.rdp.preview.raw")
      : null,
  ].filter((item): item is string => Boolean(item));

  return {
    args,
    connection_id: connection.id,
    executable,
    fallback_reason:
      runner === "mstsc"
        ? tr("workspace.rdp.preview.windows")
        : runner === "macos_app"
          ? tr("workspace.rdp.preview.macos")
          : null,
    rdp_file_content:
      runner === "mstsc" || runner === "macos_app" || runner === "custom"
        ? previewRdpFileContent(connection)
        : null,
    render_mode: renderMode,
    runner,
    setup_hint: null,
    warnings,
  };
}

function previewRdpFileContent(connection: ConnectionProfile) {
  const rdp = connection.rdp;
  const display = rdp?.display;
  const resources = rdp?.resources;
  const gateway = rdp?.gateway;
  const lines = [
    `full address:s:${connection.host}:${connection.port.toString()}`,
    `username:s:${connection.username}`,
    rdp?.domain ? `domain:s:${rdp.domain}` : null,
    `screen mode id:i:${display?.mode === "fullscreen" || display?.mode === "all_monitors" ? "2" : "1"}`,
    `desktopwidth:i:${(display?.width || 1440).toString()}`,
    `desktopheight:i:${(display?.height || 900).toString()}`,
    `use multimon:i:${display?.use_multimon ? "1" : "0"}`,
    `redirectclipboard:i:${resources?.clipboard === false ? "0" : "1"}`,
    `audiomode:i:${resources?.audio === "disabled" ? "2" : resources?.audio === "remote" ? "1" : "0"}`,
    `redirectdrives:i:${resources?.drives ? "1" : "0"}`,
    `redirectprinters:i:${resources?.printers ? "1" : "0"}`,
    `redirectsmartcards:i:${resources?.smart_cards ? "1" : "0"}`,
    `authentication level:i:${rdpCertificateAuthenticationLevel(rdp?.security.certificate_policy)}`,
    gateway?.mode === "explicit" && gateway.host ? `gatewayhostname:s:${gateway.host}` : null,
    gateway?.mode && gateway.mode !== "disabled"
      ? `gatewayusagemethod:i:${gateway.mode === "explicit" ? "1" : "2"}`
      : null,
    "prompt for credentials:i:1",
  ].filter((line): line is string => Boolean(line));

  return lines.join("\n");
}

function rdpCertificateAuthenticationLevel(policy?: RdpCertificatePolicy | null) {
  switch (policy) {
    case "trust":
      return "0";
    case "strict":
      return "1";
    case "prompt":
    default:
      return "2";
  }
}

function rdpSessionHasCommandText(session: RdpSessionTab) {
  const material = session.result || session.preview;
  if (material?.runner === "mstsc_activex" && material.args.length === 0) {
    return false;
  }
  return Boolean(material?.executable || material?.args.length);
}

function rdpSessionHasRdpFileText(session: RdpSessionTab) {
  return Boolean(session.preview?.rdp_file_content || session.result?.rdp_file_path);
}

function rdpSessionCommandText(session: RdpSessionTab) {
  const material = session.result || session.preview;
  if (!material) {
    return "";
  }
  if (material.runner === "mstsc_activex" && material.args.length === 0) {
    return "";
  }
  const executable = material.executable || "";
  const args = material.args.map(quoteCommandArgForDisplay).join(" ");
  return [executable, args].filter(Boolean).join(" ");
}

function rdpSessionFileText(session: RdpSessionTab) {
  if (session.preview?.rdp_file_content) {
    return session.preview.rdp_file_content;
  }
  return session.result?.rdp_file_path || "";
}

function rdpSessionPrimaryDetail(session: RdpSessionTab) {
  if (session.status === "embedded") {
    return { title: tr("workspace.launch.method"), value: "Windows embedded RDP host" };
  }
  if (session.status === "native") {
    return { title: tr("workspace.launch.method"), value: "Windows ActiveX native child window" };
  }
  const command = rdpSessionCommandText(session);
  if (command) {
    return { title: tr("workspace.launch.command"), value: command };
  }
  return { title: tr("workspace.launch.status"), value: session.message || rdpStatusLabel(session.status) };
}

function vncStatusLabel(status: VncSessionStatus) {
  switch (status) {
    case "launching":
      return tr("workspace.rdp.status.starting");
    case "embedded":
      return tr("workspace.vnc.status.embedded");
    case "windowed":
      return tr("workspace.vnc.status.window");
    case "external":
      return tr("workspace.rdp.status.external");
    case "error":
      return tr("workspace.step.failed");
    default:
      return "VNC";
  }
}

function vncRenderModeLabel(mode: string) {
  switch (mode) {
    case "embedded":
      return tr("workspace.vnc.runner.embedded");
    case "windowed":
      return tr("workspace.vnc.runner.window");
    case "external":
      return tr("workspace.rdp.status.external");
    case "custom":
      return tr("workspace.rdp.runner.custom");
    default:
      return tr("workspace.rdp.runner.auto");
  }
}

function vncDisplaySummary(
  display?: NonNullable<ConnectionProfile["vnc"]>["display"] | null,
) {
  if (!display) {
    return tr("workspace.rdp.display.default");
  }
  const scale =
    display.scale_mode === "actual"
      ? tr("workspace.vnc.display.actual")
      : display.scale_mode === "stretch"
        ? tr("workspace.vnc.display.stretch")
        : tr("workspace.vnc.display.fit");
  const flags = [
    display.resize_session ? tr("workspace.vnc.display.remoteResize") : null,
    display.clip_viewport ? tr("workspace.vnc.display.clip") : null,
  ].filter(Boolean);
  return [scale, ...flags].join(" · ");
}

function vncInputSummary(
  input?: NonNullable<ConnectionProfile["vnc"]>["input"] | null,
) {
  if (!input) {
    return tr("workspace.vnc.input.default");
  }
  const enabled = [
    input.view_only ? tr("workspace.vnc.input.viewOnly") : tr("workspace.vnc.input.keyboardMouse"),
    input.clipboard ? tr("workspace.vnc.input.clipboard") : null,
    input.shared ? tr("workspace.vnc.input.shared") : null,
  ].filter(Boolean);
  return enabled.join(" · ");
}

function previewVncLaunchForBrowser(connection: ConnectionProfile): VncLaunchPreview {
  const config = connection.vnc || defaultVncConfig;
  const renderMode = config.runner.render_mode || "embedded";
  const runner: VncRunnerKind =
    config.runner.preferred_runner ||
    (renderMode === "custom"
      ? "custom"
      : renderMode === "embedded" || renderMode === "windowed"
        ? "novnc"
        : "vncviewer");
  const executable =
    runner === "novnc"
      ? null
      : runner === "custom"
        ? config.runner.custom_executable || "custom-vnc-client"
        : runner === "realvnc"
          ? "vncviewer.exe"
          : "vncviewer";
  const args =
    runner === "novnc"
      ? []
      : runner === "custom"
        ? [config.runner.custom_args_template || "{host}::{port}"]
        : [`${connection.host}::${connection.port.toString()}`];
  const warnings = [
    tr("workspace.vnc.preview.browser"),
    tr("workspace.vnc.preview.noPassword"),
    config.raw_runner_args?.trim()
      ? tr("workspace.vnc.preview.raw")
      : null,
  ].filter((item): item is string => Boolean(item));

  return {
    args,
    connection_id: connection.id,
    embedded: runner === "novnc",
    executable,
    fallback_reason: runner === "novnc" ? null : tr("workspace.vnc.preview.external"),
    render_mode: renderMode,
    runner,
    setup_hint: null,
    warnings,
    websocket_url: runner === "novnc" ? "ws://127.0.0.1:<port>/vnc/<session>/<token>" : null,
  };
}

function vncSessionHasCommandText(session: VncSessionTab) {
  const material = session.result || session.preview;
  if (!material || material.runner === "novnc") {
    return false;
  }
  return Boolean(material.executable || material.args.length);
}

function vncSessionCommandText(session: VncSessionTab) {
  const material = session.result || session.preview;
  if (!material || material.runner === "novnc") {
    return "";
  }
  const executable = material.executable || "";
  const args = material.args.map(quoteCommandArgForDisplay).join(" ");
  return [executable, args].filter(Boolean).join(" ");
}

function vncSessionPrimaryDetail(session: VncSessionTab) {
  if (session.status === "embedded") {
    return { title: tr("workspace.launch.method"), value: "noVNC local bridge" };
  }
  if (session.status === "windowed") {
    return { title: tr("workspace.launch.method"), value: "RDP-style runner host" };
  }
  const command = vncSessionCommandText(session);
  if (command) {
    return { title: tr("workspace.launch.command"), value: command };
  }
  return { title: tr("workspace.launch.status"), value: session.message || vncStatusLabel(session.status) };
}

function quoteCommandArgForDisplay(value: string) {
  if (!value) {
    return "\"\"";
  }
  return /\s/.test(value) ? `"${value.replace(/"/g, "\\\"")}"` : value;
}

function commandHistoryKeyForScope(scope: CommandHistoryScope | null) {
  if (!scope) {
    return commandHistoryAllScopeKey;
  }
  return scope.scope_kind === "ssh_connection"
    ? `${commandHistorySshScopePrefix}${scope.scope_id}`
    : `${commandHistoryLocalScopePrefix}${scope.scope_id}`;
}

function commandHistoryScopeFromKey(key: string): CommandHistoryScope | null {
  if (key.startsWith(commandHistorySshScopePrefix)) {
    return {
      scope_kind: "ssh_connection",
      scope_id: key.slice(commandHistorySshScopePrefix.length),
    };
  }

  if (key.startsWith(commandHistoryLocalScopePrefix)) {
    return {
      scope_kind: "local_profile",
      scope_id: key.slice(commandHistoryLocalScopePrefix.length),
    };
  }

  return null;
}

function commandHistoryDefaultScopeKey({
  activeConnectionId,
  activeLocalTerminalTab,
  activeWorkspaceMode,
}: {
  activeConnectionId: string | null;
  activeLocalTerminalTab: LocalTerminalTab | null;
  activeWorkspaceMode: WorkspaceMode;
}) {
  if (activeWorkspaceMode === "local" && activeLocalTerminalTab?.profileId) {
    return commandHistoryKeyForScope({
      scope_kind: "local_profile",
      scope_id: activeLocalTerminalTab.profileId,
    });
  }

  if (activeWorkspaceMode === "ssh" && activeConnectionId) {
    return commandHistoryKeyForScope({
      scope_kind: "ssh_connection",
      scope_id: activeConnectionId,
    });
  }

  return commandHistoryAllScopeKey;
}

function buildCommandHistoryScopeOptions({
  activeConnection,
  activeLocalTerminalTab,
  activeWorkspaceMode,
  connections,
  defaultScopeKey,
  localTerminalProfiles,
}: {
  activeConnection: ConnectionProfile | null;
  activeLocalTerminalTab: LocalTerminalTab | null;
  activeWorkspaceMode: WorkspaceMode;
  connections: ConnectionProfile[];
  defaultScopeKey: string;
  localTerminalProfiles: LocalTerminalProfile[];
}): CommandHistoryScopeOption[] {
  const options: CommandHistoryScopeOption[] = [];
  const seen = new Set<string>();

  const addOption = (option: CommandHistoryScopeOption) => {
    if (seen.has(option.value)) {
      return;
    }
    seen.add(option.value);
    options.push(option);
  };

  if (activeWorkspaceMode === "local" && activeLocalTerminalTab) {
    const activeProfile = localTerminalProfiles.find(
      (profile) => profile.id === activeLocalTerminalTab.profileId,
    );
    addOption({
      badge: tr("workspace.command.target.local"),
      label: tr("workspace.command.target.currentTerminal", { name: activeProfile?.name || activeLocalTerminalTab.title }),
      value: defaultScopeKey,
    });
  } else if (activeWorkspaceMode === "ssh" && isSshConnection(activeConnection)) {
    addOption({
      badge: "SSH",
      label: tr("workspace.command.target.currentConnection", { name: activeConnection.name }),
      value: defaultScopeKey,
    });
  }

  connections.filter(isSshConnection).forEach((connection) => {
    addOption({
      badge: "SSH",
      label: connection.name,
      value: commandHistoryKeyForScope({
        scope_kind: "ssh_connection",
        scope_id: connection.id,
      }),
    });
  });

  localTerminalProfiles
    .filter((profile) => !profile.hidden || profile.id === activeLocalTerminalTab?.profileId)
    .forEach((profile) => {
      addOption({
        badge: tr("workspace.command.target.local"),
        label: profile.name,
        value: commandHistoryKeyForScope({
          scope_kind: "local_profile",
          scope_id: profile.id,
        }),
      });
    });

  addOption({
    label: tr("workspace.command.target.allHistory"),
    value: commandHistoryAllScopeKey,
  });

  return options;
}

function uniqueCommandHistoryScopes(scopes: CommandHistoryScope[]) {
  const unique = new Map<string, CommandHistoryScope>();
  scopes.forEach((scope) => {
    unique.set(commandHistoryKeyForScope(scope), scope);
  });
  return Array.from(unique.values());
}

function buildCommandSenderTargets({
  connectionById,
  deliveryByKey,
  instanceTargets,
  localTerminalProfiles,
  localTerminalTabs,
}: {
  connectionById: Map<string, ConnectionProfile>;
  deliveryByKey: Record<string, { message?: string; status: CommandSenderDeliveryStatus }>;
  instanceTargets: readonly MultiExecTarget[];
  localTerminalProfiles: LocalTerminalProfile[];
  localTerminalTabs: LocalTerminalTab[];
}): CommandSenderTarget[] {
  const localById = new Map(localTerminalTabs.map((tab) => [tab.id, tab]));
  return instanceTargets.map((target): CommandSenderTarget => {
    const delivery = deliveryByKey[target.key];
    if (target.kind === "ssh") {
      const connection = connectionById.get(target.ownerId) || null;
      return {
        deliveryMessage: delivery?.message,
        deliveryStatus: delivery?.status || "idle",
        description: connection ? formatConnectionAddress(connection) : target.title,
        historyScope: {
          scope_kind: "ssh_connection",
          scope_id: target.ownerId,
        },
        key: target.key,
        kind: "ssh",
        label: connection?.name || target.title,
        sessionId: target.sessionId,
        tabId: target.tabId,
        tabTitle: target.title,
      };
    }

    const localTab = localById.get(target.tabId) || null;
    const profile = localTerminalProfiles.find((item) => item.id === target.ownerId) || null;
    const kindLabel =
      target.kind === "telnet" ? "Telnet" : target.kind === "serial" ? "Serial" : "Local";
    return {
      deliveryMessage: delivery?.message,
      deliveryStatus: delivery?.status || "idle",
      description: `${kindLabel} · ${profile?.name || localTab?.title || target.title}`,
      historyScope: {
        scope_kind: "local_profile",
        scope_id: target.ownerId,
      },
      key: target.key,
      kind: "local",
      label: localTab?.title || target.title,
      sessionId: target.sessionId,
      tabId: target.tabId,
      tabTitle: target.title,
    };
  });
}

function commandSenderDeliveryLabel(status: CommandSenderDeliveryStatus) {
  if (status === "written") {
    return tr("workspace.command.delivery.written");
  }
  if (status === "failed") {
    return tr("workspace.command.delivery.failed");
  }
  if (status === "disconnected") {
    return tr("workspace.command.delivery.disconnected");
  }
  return tr("workspace.command.delivery.notSent");
}

function buildAiContextBlock({
  kind,
  title,
  source,
  content,
}: {
  kind: string;
  title: string;
  source: string;
  content: string;
}): AiContextBlock {
  const normalized = content.trim();
  return {
    id: `${kind}-${Date.now().toString()}`,
    kind,
    title,
    source,
    content: normalized,
    line_count: normalized ? normalized.split(/\r?\n/).length : 0,
    char_count: Array.from(normalized).length,
  };
}

function tailStringByChars(value: string, maxChars: number) {
  const chars = Array.from(value);
  return chars.length <= maxChars ? value : chars.slice(chars.length - maxChars).join("");
}

function stripTerminalControlText(value: string) {
  return value
    .replace(/\x1b\][^\x07]*(?:\x07|\x1b\\)/g, "")
    .replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, "");
}

function mouseDragDistance(drag: WorkbenchTabMouseDrag, currentX: number, currentY: number) {
  return Math.hypot(currentX - drag.startX, currentY - drag.startY);
}

function getWorkbenchTabDropZoneFromPoint(x: number, y: number): WorkbenchTabDropZone | null {
  const target = document
    .elementFromPoint(x, y)
    ?.closest<HTMLElement>("[data-workbench-tab-drop-zone]");
  const zone = target?.dataset.workbenchTabDropZone;
  return zone === "terminal" ||
    zone === "file" ||
    zone === "split-file" ||
    zone === "split-terminal"
    ? zone
    : null;
}

function isCommandSenderRisky(command: string) {
  return (
    /\b(?:sudo|mkfs|shutdown|reboot)\b/i.test(command) ||
    /\brm\s+-[^\n\r]*r[^\n\r]*f/i.test(command) ||
    /\b(?:curl|wget)\b[^\n\r|]*\|\s*(?:sh|bash)\b/i.test(command)
  );
}

function isRemoteFileConflict(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code: unknown }).code === "remote_file_conflict"
  );
}

function isRemoteFileTabUnderEntry(
  tab: RemoteFileEditorTab,
  connectionId: string,
  entryPath: string,
) {
  const normalizedEntryPath = normalizeRemotePath(entryPath);
  return (
    tab.connectionId === connectionId &&
    (tab.path === normalizedEntryPath ||
      isRemotePathStrictDescendant(tab.path, normalizedEntryPath))
  );
}

function collapseRemoteFileDeleteEntries(entries: RemoteFileEntry[]) {
  const byPath = new Map<string, RemoteFileEntry>();
  for (const entry of entries) {
    const path = normalizeRemotePath(entry.path);
    byPath.set(path, { ...entry, path });
  }

  const orderedEntries = Array.from(byPath.values()).sort(
    (left, right) => left.path.length - right.path.length || left.path.localeCompare(right.path),
  );
  const collapsed: RemoteFileEntry[] = [];
  for (const entry of orderedEntries) {
    const coveredByDirectory = collapsed.some(
      (selected) =>
        selected.type === "directory" &&
        isRemotePathStrictDescendant(entry.path, selected.path),
    );
    if (!coveredByDirectory) {
      collapsed.push(entry);
    }
  }
  return collapsed;
}

function uniqueRemoteParentPaths(entries: RemoteFileEntry[]) {
  return Array.from(new Set(entries.map((entry) => remotePathParent(entry.path))));
}

function remoteFileDeleteDescription(entries: RemoteFileEntry[], affectedTabs: number, dirtyTabs: number) {
  const base =
    entries.length === 1
      ? tr("workspace.file.deleteOne", { path: entries[0].path })
      : tr("workspace.file.deleteMany", { count: entries.length });
  if (dirtyTabs > 0) {
    return tr("workspace.file.deleteWithDirty", { base, open: affectedTabs, dirty: dirtyTabs });
  }
  if (affectedTabs > 0) {
    return tr("workspace.file.deleteWithOpen", { base, open: affectedTabs });
  }
  return base;
}

function joinRemotePath(parentPath: string, name: string) {
  const normalizedParent = normalizeRemotePath(parentPath);
  const cleanName = name.trim().replace(/\\/g, "/").replace(/^\/+/, "");
  if (!cleanName) {
    return normalizedParent;
  }
  return normalizeRemotePath(
    normalizedParent === "/" ? `/${cleanName}` : `${normalizedParent}/${cleanName}`,
  );
}

function remoteFileName(path: string) {
  const normalizedPath = normalizeRemotePath(path);
  if (normalizedPath === "/") {
    return "/";
  }
  const parts = normalizedPath.split("/").filter(Boolean);
  return parts[parts.length - 1] || normalizedPath;
}

function localPathName(path: string) {
  const normalizedPath = path.replace(/\\/g, "/").replace(/\/+$/, "");
  return normalizedPath.split("/").filter(Boolean).pop() || "upload";
}

function previewRemoteFileMetadata(path: string): RemoteFileMetadata {
  const normalizedPath = normalizeRemotePath(path);
  const content = previewRemoteFileContent(normalizedPath);
  return {
    mtime: Date.now(),
    name: remoteFileName(normalizedPath),
    path: normalizedPath,
    size: new TextEncoder().encode(content).length,
    mode: "-rw-r--r--",
  };
}

function previewRemoteFileRead(
  connection: ConnectionProfile,
  path: string,
): RemoteFileReadResult {
  const normalizedPath = normalizeRemotePath(path);
  const content = previewRemoteFileContent(normalizedPath, connection.name);
  const metadata: RemoteFileMetadata = {
    mtime: Date.now(),
    name: remoteFileName(normalizedPath),
    path: normalizedPath,
    size: new TextEncoder().encode(content).length,
    mode: "-rw-r--r--",
  };

  return {
    content,
    editable: true,
    encoding: "utf-8",
    is_binary: false,
    metadata,
    mode: metadata.mode,
    mtime: metadata.mtime,
    name: metadata.name,
    path: metadata.path,
    size: metadata.size,
  };
}

function previewRemoteFileContent(path: string, connectionName = "preview") {
  const name = remoteFileName(path);
  if (name.endsWith(".json")) {
    return `{\n  "name": "${connectionName}",\n  "path": "${path}",\n  "enabled": true\n}\n`;
  }
  if (name.endsWith(".sh")) {
    return "#!/usr/bin/env sh\nset -eu\n\necho \"deploy preview\"\n";
  }
  if (name.endsWith(".md")) {
    return `# ${name}\n\nRemote preview file for ${connectionName}.\n`;
  }
  if (name.endsWith(".conf")) {
    return "server {\n  listen 80;\n  server_name example.local;\n}\n";
  }
  return tr("workspace.file.previewBody", { name, connection: connectionName, path });
}

function remoteFileActionTitle(action: RemoteFileTextAction) {
  if (action.action === "create-file") return tr("workspace.file.action.createFile");
  if (action.action === "create-directory") return tr("workspace.file.action.createDirectory");
  return tr("workspace.file.action.rename");
}

function remoteFileActionDescription(action: RemoteFileTextAction) {
  if (action.action === "rename") {
    return tr("workspace.file.parent", { path: remotePathParent(action.entry.path) });
  }
  return tr("workspace.file.parent", { path: action.parentPath });
}

function toRemoteFileConflictPolicy(
  policy: RemoteFileTransferConflictPolicy,
): RemoteFileTransferConflictPolicy {
  return policy === "ask" ? "rename" : policy;
}

function isClosableSavedRemoteFileTab(tab: RemoteFileEditorTab) {
  return !tab.dirty && (tab.saveState === "ready" || tab.saveState === "saved");
}

async function copyText(text: string) {
  await copyTextToClipboard(text);
}

function isValidRemoteBaseName(name: string) {
  const trimmed = name.trim();
  return Boolean(trimmed) && trimmed !== "." && trimmed !== ".." && !/[\\/]/.test(trimmed);
}

function remoteFileNameValidationMessage(name: string) {
  const trimmed = name.trim();
  if (!trimmed) {
    return tr("workspace.file.validation.required");
  }
  if (trimmed === "." || trimmed === "..") {
    return tr("workspace.file.validation.dot");
  }
  if (/[\\/]/.test(trimmed)) {
    return tr("workspace.file.validation.path");
  }
  return tr("workspace.file.validation.invalid");
}

function getFileRelativePath(file: File) {
  const withRelativePath = file as File & { webkitRelativePath?: string };
  return normalizeUploadRelativePath(withRelativePath.webkitRelativePath || file.name);
}

function normalizeUploadRelativePath(path: string) {
  return path
    .replace(/\\/g, "/")
    .split("/")
    .map((part) => part.trim())
    .filter((part) => part && part !== "." && part !== "..")
    .join("/");
}

function totalUploadBytes(items: RemoteFileUploadItem[]) {
  return items.reduce((total, item) => {
    return normalizeUploadRelativePath(item.relativePath) ? total + item.file.size : total;
  }, 0);
}

function groupUploadDirectories(items: RemoteFileUploadItem[]) {
  const groups = new Map<string, RemoteFileUploadItem[]>();

  items.forEach((item) => {
    const relativePath = normalizeUploadRelativePath(item.relativePath);
    const [rootName] = relativePath.split("/");
    if (!rootName || !relativePath.includes("/")) {
      return;
    }
    const group = groups.get(rootName) || [];
    group.push({
      file: item.file,
      relativePath,
    });
    groups.set(rootName, group);
  });

  return groups;
}

async function buildTarGzArchiveToTemp(
  localPath: string,
  items: RemoteFileUploadItem[],
  onProgress?: (progress: ArchiveBuildProgress) => void,
) {
  const totalBytes = totalUploadBytes(items);
  const compression = new CompressionStream("gzip");
  const writer = compression.writable.getWriter();
  const reader = compression.readable.getReader();
  const encoder = new TextEncoder();
  const directories = collectTarDirectories(items);
  let loadedBytes = 0;
  let archiveBytes = 0;
  let pendingGzipBytes = 0;
  const pendingGzipChunks: Uint8Array[] = [];

  const flushGzipChunks = async () => {
    if (pendingGzipBytes <= 0) {
      return;
    }
    const chunk =
      pendingGzipChunks.length === 1
        ? pendingGzipChunks[0]
        : concatenateUint8Arrays(pendingGzipChunks, pendingGzipBytes);
    pendingGzipChunks.length = 0;
    pendingGzipBytes = 0;
    await remoteFileAppendUploadTemp(localPath, chunk);
    archiveBytes += chunk.byteLength;
    onProgress?.({
      archiveBytes,
      loadedBytes,
      phase: "compress",
      totalBytes,
    });
    await yieldToBrowser();
  };

  const persistGzip = (async () => {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      if (value.byteLength === 0) {
        continue;
      }
      pendingGzipChunks.push(value);
      pendingGzipBytes += value.byteLength;
      if (pendingGzipBytes >= uploadTempAppendChunkBytes) {
        await flushGzipChunks();
      }
    }
    await flushGzipChunks();
  })();

  try {
    for (const directory of directories) {
      await writer.write(buildTarHeader(`${directory}/`, 0, true, encoder));
      await yieldToBrowser();
    }

    for (const item of items) {
      const relativePath = normalizeUploadRelativePath(item.relativePath);
      if (!relativePath) {
        continue;
      }
      await writer.write(buildTarHeader(relativePath, item.file.size, false, encoder));
      await writeFileToTarGzipStream(item.file, writer, loadedBytes, totalBytes, onProgress);
      loadedBytes += item.file.size;
      await writer.write(new Uint8Array(paddingForTarBlock(item.file.size)));
      await yieldToBrowser();
    }

    loadedBytes = totalBytes;
    onProgress?.({
      archiveBytes,
      loadedBytes,
      phase: "compress",
      totalBytes,
    });
    await writer.write(new Uint8Array(1024));
    await writer.close();
    await persistGzip;
  } catch (error) {
    await writer.abort(error).catch(() => undefined);
    await persistGzip.catch(() => undefined);
    throw error;
  }

  onProgress?.({
    archiveBytes,
    loadedBytes: totalBytes,
    phase: "compress",
    totalBytes,
  });
  return archiveBytes;
}

async function writeFileToTarGzipStream(
  file: File,
  writer: WritableStreamDefaultWriter<Uint8Array>,
  loadedBeforeFile: number,
  totalBytes: number,
  onProgress?: (progress: ArchiveBuildProgress) => void,
) {
  if (file.size === 0) {
    onProgress?.({
      archiveBytes: 0,
      loadedBytes: loadedBeforeFile,
      phase: "read",
      totalBytes,
    });
    return;
  }

  let loadedInFile = 0;
  while (loadedInFile < file.size) {
    const nextOffset = Math.min(file.size, loadedInFile + fileReadChunkBytes);
    const chunk = new Uint8Array(await file.slice(loadedInFile, nextOffset).arrayBuffer());
    await writer.write(chunk);
    loadedInFile = nextOffset;
    onProgress?.({
      archiveBytes: 0,
      loadedBytes: loadedBeforeFile + loadedInFile,
      phase: "read",
      totalBytes,
    });
    await yieldToBrowser();
  }
}

async function writeFileToUploadTemp(
  localPath: string,
  file: File,
  onProgress?: (loadedBytes: number, totalBytes: number) => void,
) {
  if (file.size === 0) {
    onProgress?.(0, 0);
    return;
  }

  let loadedBytes = 0;
  while (loadedBytes < file.size) {
    const nextOffset = Math.min(file.size, loadedBytes + fileReadChunkBytes);
    const chunk = new Uint8Array(await file.slice(loadedBytes, nextOffset).arrayBuffer());
    await remoteFileAppendUploadTemp(localPath, chunk);
    loadedBytes = nextOffset;
    onProgress?.(loadedBytes, file.size);
    await yieldToBrowser();
  }
}

function collectTarDirectories(items: RemoteFileUploadItem[]) {
  const directories = new Set<string>();
  items.forEach((item) => {
    const parts = normalizeUploadRelativePath(item.relativePath).split("/");
    for (let index = 1; index < parts.length; index += 1) {
      directories.add(parts.slice(0, index).join("/"));
    }
  });
  return Array.from(directories).sort((left, right) => left.localeCompare(right));
}

function buildTarHeader(
  path: string,
  size: number,
  directory: boolean,
  encoder: TextEncoder,
) {
  const header = new Uint8Array(512);
  const normalizedPath = normalizeUploadRelativePath(path).slice(0, 255);
  const splitPath = splitTarPath(normalizedPath);

  writeTarString(header, 0, 100, splitPath.name, encoder);
  writeTarOctal(header, 100, 8, directory ? 0o755 : 0o644);
  writeTarOctal(header, 108, 8, 0);
  writeTarOctal(header, 116, 8, 0);
  writeTarOctal(header, 124, 12, directory ? 0 : size);
  writeTarOctal(header, 136, 12, Math.floor(Date.now() / 1000));
  header.fill(32, 148, 156);
  header[156] = directory ? "5".charCodeAt(0) : "0".charCodeAt(0);
  writeTarString(header, 257, 6, "ustar", encoder);
  writeTarString(header, 263, 2, "00", encoder);
  writeTarString(header, 345, 155, splitPath.prefix, encoder);

  const checksum = header.reduce((sum, byte) => sum + byte, 0);
  writeTarOctal(header, 148, 8, checksum);
  return header;
}

function splitTarPath(path: string) {
  if (path.length <= 100) {
    return { name: path, prefix: "" };
  }

  const segments = path.split("/");
  let name = segments.pop() || path.slice(-100);
  let prefix = segments.join("/");
  if (name.length > 100) {
    name = name.slice(-100);
  }
  if (prefix.length > 155) {
    prefix = prefix.slice(-155);
  }
  return { name, prefix };
}

function writeTarString(
  header: Uint8Array,
  offset: number,
  length: number,
  value: string,
  encoder: TextEncoder,
) {
  header.set(encoder.encode(value).slice(0, length), offset);
}

function writeTarOctal(header: Uint8Array, offset: number, length: number, value: number) {
  const text = value.toString(8).padStart(length - 1, "0").slice(0, length - 1);
  for (let index = 0; index < text.length; index += 1) {
    header[offset + index] = text.charCodeAt(index);
  }
  header[offset + length - 1] = 0;
}

function paddingForTarBlock(size: number) {
  return (512 - (size % 512)) % 512;
}

function concatenateUint8Arrays(chunks: Uint8Array[], totalBytes: number) {
  const combined = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    combined.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return combined;
}

function yieldToBrowser() {
  return new Promise<void>((resolve) => window.setTimeout(resolve, 0));
}

function scheduleIdleTask(callback: () => void, timeoutMs: number): () => void {
  const idleWindow = window as Window & {
    requestIdleCallback?: (
      callback: IdleRequestCallback,
      options?: IdleRequestOptions,
    ) => number;
    cancelIdleCallback?: (handle: number) => void;
  };

  if (typeof idleWindow.requestIdleCallback === "function") {
    const handle = idleWindow.requestIdleCallback(() => callback(), { timeout: timeoutMs });
    return () => idleWindow.cancelIdleCallback?.(handle);
  }

  const timer = window.setTimeout(callback, timeoutMs);
  return () => window.clearTimeout(timer);
}

function scheduleWorkspaceModulePrewarm(): () => void {
  let canceled = false;
  const cancelBatchTasks = WORKSPACE_IDLE_PREWARM_BATCHES.map((batch) =>
    scheduleIdleTask(() => {
      void prewarmLazyModuleBatch(batch.loaders, () => canceled);
    }, batch.timeoutMs),
  );

  return () => {
    canceled = true;
    for (const cancelBatchTask of cancelBatchTasks) {
      cancelBatchTask();
    }
  };
}

async function prewarmLazyModuleBatch(
  loaders: LazyModuleLoader[],
  isCanceled: () => boolean,
) {
  for (const loader of loaders) {
    if (isCanceled()) {
      return;
    }
    await loader().catch(() => undefined);
    await yieldToBrowser();
  }
}

function transferSessionName(connection: ConnectionProfile) {
  return sanitizeLocalSegment(connection.name || connection.host || "nexaterm-session");
}

function formatTransferTimestamp(date: Date, format: FileTransferTimestampFormat) {
  const year = date.getFullYear().toString();
  const month = padDatePart(date.getMonth() + 1);
  const day = padDatePart(date.getDate());
  const hour = padDatePart(date.getHours());
  const minute = padDatePart(date.getMinutes());

  if (format === "yyyy-MM-dd-HHmm") {
    return `${year}-${month}-${day}-${hour}${minute}`;
  }
  if (format === "yyyyMMdd-HHmm") {
    return `${year}${month}${day}-${hour}${minute}`;
  }
  return `${year}${month}${day}${hour}${minute}`;
}

function padDatePart(value: number) {
  return value.toString().padStart(2, "0");
}

function sanitizeLocalSegment(value: string) {
  const sanitized = value.trim().replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_");
  return sanitized || "nexaterm-session";
}

function previewRemoteFileUploadResult(path: string, size: number): RemoteFileUploadResult {
  const metadata = {
    ...previewRemoteFileMetadata(path),
    size,
  };
  return {
    metadata,
    name: metadata.name,
    path: metadata.path,
    skipped: false,
  };
}

function previewRemoteFileArchiveUploadResult(path: string): RemoteFileArchiveUploadResult {
  const normalizedPath = normalizeRemotePath(path);
  return {
    archive_path: null,
    name: remoteFileName(normalizedPath),
    path: normalizedPath,
    skipped: false,
  };
}

function previewRemoteFileDownloadToLocalResult(
  entry: RemoteFileEntry,
  directory: boolean,
): RemoteFileDownloadToLocalResult {
  const localDirectory = `Downloads\\${sanitizeLocalSegment(entry.name)}\\preview`;
  return {
    archive_path: null,
    directory,
    local_directory: localDirectory,
    local_path: `${localDirectory}\\${entry.name}`,
    name: entry.name,
    remote_path: entry.path,
    skipped: false,
  };
}

function resolveNativeFileDropTargetPath(position: NativeFileDropPosition) {
  const scaleFactor = window.devicePixelRatio || 1;
  const element = document.elementFromPoint(position.x / scaleFactor, position.y / scaleFactor);
  const target = element?.closest<HTMLElement>(`[${remoteFileDropTargetAttribute}]`);
  return target?.dataset.remoteFileDropTarget || null;
}

function previewRemoteFileEntryMetadata(entry: RemoteFileEntry): RemoteFileEntryMetadata {
  return {
    birthtime: Date.now() / 1000 - 86400,
    gid: 1000,
    group: "nexaterm",
    mode: entry.type === "directory" ? "755" : "644",
    mtime: Date.now() / 1000,
    name: entry.name,
    owner: "preview",
    path: entry.path,
    size: entry.type === "directory" ? 0 : previewRemoteFileMetadata(entry.path).size,
    type: entry.type,
    uid: 1000,
  };
}
