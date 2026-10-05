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
import { ConnectionPane } from "../connections/ConnectionPane";
import { useBatchConnectController } from "../connections/useBatchConnectController";
import { batchWorkspaceClosePlan, batchWorkspaceItemId, collectBatchOpenConnectionIds, waitForBatchWorkspaceHandle, type BatchWorkspaceHandle } from "../connections/batchConnectWorkspaceRuntime";
import {
  WorkspaceSidebar,
  readStoredWorkspaceSidebarView,
  writeStoredWorkspaceSidebarView,
  type WorkspaceSidebarView,
} from "./WorkspaceSidebar";
import { resolveWorkspaceSidebarFileContext } from "./workspaceSidebarContext";
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
import { syncCurrentWebviewBackground } from "../../shared/tauri/webviewBackground";
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
import { seedWorkspaceRemoteFileDirectories, workspaceRemoteFileDirectories } from "../workspace/restore/remoteFileSnapshotBridge";
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
const commandSnippetRootGroup = "";
const commandSnippetRootGroupLabel = () => tr("workspace.snippet.root");
const legacyCommandSnippetGroup = "未分组";
const commandHistoryAllScopeKey = "all";
const commandHistorySshScopePrefix = "ssh:";
const commandHistoryLocalScopePrefix = "local:";
function connectionPromptAuthKindOptions(): Array<{
  label: string;
  value: ConnectionAuthKind;
}> {
  return [
    { label: tr("workspace.connection.auth.password"), value: "password" },
    { label: tr("workspace.connection.auth.privateKey"), value: "private_key" },
  ];
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
    { activeItemId: activeWorkspaceItemId, files: { directories: workspaceRemoteFileDirectories(terminalTabs.map((tab) => tab.id)), followActivePane: settings.basic.filePanelFollowsActiveConnection }, order: workspaceItemOrder, sidebar: { collapsed: leftPaneCollapsed, view: workspaceSidebarView }, splitLayout: terminalSplitLayout },
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
  const titlebarItems = useMemo(
    () =>
      buildTitlebarItems(
        workspaceItems,
        {
          connectionAddress: (connectionId) => {
            const connection = connectionById.get(connectionId);
            return connection ? formatConnectionAddress(connection) : null;
          },
          connectionName: (connectionId) => connectionById.get(connectionId)?.name || null,
          localProfileName: (profileId) =>
            localTerminalProfiles.find((profile) => profile.id === profileId)?.name ?? null,
        },
        t,
      ),
    [connectionById, localTerminalProfiles, t, workspaceItems],
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
  const workspaceSidebarFileContext = workspaceSidebarFileBinding
    ? {
        ...workspaceSidebarFileBinding,
        connectionName:
          connectionById.get(workspaceSidebarFileBinding.connectionId)?.name || null,
      }
    : null;
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
        .filter((connection) => isTelnetConnection(connection) || isSerialConnection(connection))
        .map((connection) => ({
          connectionId: connection.id,
          group: t("split.newCharacterInstanceGroup"),
          icon: <ConnectionSystemLogo compact connection={connection} decorative />,
          label: `${connection.name || connection.host} · ${formatConnectionAddress(connection)}`,
          searchText: [connection.name, connection.host, connection.port?.toString()]
            .filter(Boolean)
            .join(" "),
          value: `connection:${connection.id}`,
        })),
      {
        disabled: !defaultLocalTerminalProfile,
        group: tr("workspace.newSession.group"),
        label: tr("workspace.newSession.defaultLocal"),
        value: "action:new-local",
        variant: "action" as const,
      },
      {
        disabled: terminalTabs.length === 0 && !isSshConnection(activeConnection),
        group: tr("workspace.newSession.group"),
        label: tr("workspace.newSession.currentSsh"),
        value: "action:new-ssh",
        variant: "action" as const,
      },
    ],
    [
      activeConnection,
      connectionById,
      connections,
      defaultLocalTerminalProfile,
      localTerminalTabs,
      terminalSearchByTabId,
      terminalTabs,
    ],
  );
  const terminalSplitSyncPaneOptions = useMemo(() => buildTerminalSplitSyncPaneOptions({
    focusedBinding: focusedTerminalSplitBinding,
    panes: terminalSplitPanes,
    sessionOptions: terminalSplitSessionOptions,
    sessionIdForBinding: terminalSessionIdForBinding,
    syncEnabled: terminalSplitSyncEnabled,
  }), [
    focusedTerminalSplitBinding,
    localTerminalTabs,
    terminalSplitPanes,
    terminalSplitSessionOptions,
    terminalSplitSyncEnabled,
    terminalTabs,
  ]);
  const pendingRemoteFileCloseTab = pendingRemoteFileCloseId
    ? remoteFileTabs.find((tab) => tab.id === pendingRemoteFileCloseId) || null
    : null;
  const closeConfirmCopy = closeRequestController.pending
    ? closeConfirmationCopy(closeRequestController.pending.confirmation, t)
    : null;
  const pendingRemoteFileConflictTab = pendingRemoteFileConflictId
    ? remoteFileTabs.find((tab) => tab.id === pendingRemoteFileConflictId) || null
    : null;
  const remoteFileDeleteEntries = remoteFileDeleteTarget
    ? collapseRemoteFileDeleteEntries(remoteFileDeleteTarget.entries)
    : [];
  const remoteFileDeleteAffectedTabs = remoteFileDeleteTarget
    ? remoteFileTabs.filter((tab) =>
        remoteFileDeleteEntries.some((entry) =>
          isRemoteFileTabUnderEntry(tab, remoteFileDeleteTarget.connectionId, entry.path),
        ),
      )
    : [];
  const remoteFileDeleteDirtyCount = remoteFileDeleteAffectedTabs.filter((tab) => tab.dirty).length;
  const shouldSuppressRdpEmbeddedHost =
    dialogOpen ||
    connectionSearchOpen ||
    commandSnippetDialogOpen ||
    Boolean(commandSnippetGroupDialog) ||
    Boolean(pendingCommandSnippetDelete) ||
    Boolean(pendingCommandSnippetGroupDelete) ||
    Boolean(pendingCommandHistoryDelete) ||
    commandHistoryClearOpen ||
    Boolean(pendingRemoteFileCloseTab) ||
    Boolean(closeRequestController.pending) ||
    Boolean(remoteFileDeleteTarget) ||
    Boolean(pendingRemoteFileConflictTab) ||
    Boolean(remoteFileTextAction) ||
    Boolean(remoteFileProperties) ||
    Boolean(transferConflictPrompt);
  const effectiveWindowMaterial = normalizeWindowMaterial(
    settings.appearance.windowMaterial,
    supportedWindowMaterials,
  );
  const appShellStyle = {
    ...resolveSettingsStyle(settings),
    "--editor-terminal-split-percent": `${editorTerminalSplitPercent.toString()}%`,
    "--left-pane-custom-width": `${leftPaneWidth.toString()}px`,
    "--right-pane-custom-width": `${rightPaneWidth.toString()}px`,
  } as CSSProperties;

  useEffect(() => {
    if (shouldShowAiAssistantPanel) {
      setAiAssistantPanelLoaded(true);
    }
  }, [shouldShowAiAssistantPanel]);

  const aiAssistantPanelNode = shouldRenderAiAssistantPanel ? (
    <Suspense fallback={<p className="file-panel-empty">{tr("workspace.loading.ai")}</p>}>
      <AiAssistantPanel
        active={showWorkspaceToolPane && !rightPaneCollapsed && rightTool === "ai"}
        commandDraft={commandSenderInput}
        connection={activeWorkspaceMode === "ssh" ? activeConnection : null}
        contextRequestKey={aiContextRequestKey}
        initialContexts={aiInitialContexts}
        recentCommands={commandHistoryEntries}
        recentTerminalOutput={activeAiRecentTerminalOutput}
        sendShortcutBinding={aiSendMessageShortcutBinding}
        terminalDirectory={activeWorkspaceMode === "ssh" ? activeTerminalDirectory : null}
        terminalTitle={activeAiTerminalTitle}
        onInsertCommand={insertAiCommandToSender}
        onOpenSettings={() => openSettingsSection("ai")}
        onSaveCommand={saveAiCommandAsSnippet}
        onSendCommand={sendAiCommandToTerminal}
      />
    </Suspense>
  ) : null;

  useLayoutEffect(() => {
    const body = document.body;
    document.body.dataset.themeMode = settings.appearance.themeMode;
    document.body.dataset.windowMaterial = effectiveWindowMaterial;
    document.body.dataset.density = settings.appearance.density;
    document.body.dataset.platform = desktopPlatform;

    const portalThemeStyle = resolveSettingsStyle(settings);
    for (const [name, value] of Object.entries(portalThemeStyle)) {
      body.style.setProperty(name, value);
    }

    void syncCurrentWebviewBackground();

    // system 主题模式下，监听系统深浅色切换，同步 WebView 背景
    let mediaQuery: MediaQueryList | null = null;
    let cleanup: (() => void) | null = null;

    if (settings.appearance.themeMode === "system") {
      mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
      const handleChange = () => {
        void syncCurrentWebviewBackground();
      };
      mediaQuery.addEventListener("change", handleChange);
      cleanup = () => mediaQuery?.removeEventListener("change", handleChange);
    }

    return () => {
      delete document.body.dataset.themeMode;
      delete document.body.dataset.windowMaterial;
      delete document.body.dataset.density;
      delete document.body.dataset.platform;
      for (const name of Object.keys(portalThemeStyle)) {
        body.style.removeProperty(name);
      }
      cleanup?.();
    };
  }, [
    desktopPlatform,
    effectiveWindowMaterial,
    settings,
    settings.appearance.density,
    settings.appearance.themeMode,
  ]);

  useEffect(() => {
    if (!platformCapabilities.supportsWindowsPty) {
      setWindowsPtyInfo(undefined);
      return;
    }

    if (!hasTauriRuntime()) {
      setWindowsPtyInfo(toWindowsPtyOption(null, desktopPlatform));
      return;
    }

    let disposed = false;
    void getWindowsPtyInfo()
      .then((info) => {
        if (!disposed) {
          setWindowsPtyInfo(toWindowsPtyOption(info, desktopPlatform));
        }
      })
      .catch(() => {
        if (!disposed) {
          setWindowsPtyInfo(toWindowsPtyOption(null, desktopPlatform));
        }
      });

    return () => {
      disposed = true;
    };
  }, [desktopPlatform, platformCapabilities.supportsWindowsPty]);

  useEffect(() => {
    let disposed = false;
    void getSupportedWindowMaterials().then((materials) => {
      if (!disposed) {
        setSupportedWindowMaterials(materials);
      }
    });

    return () => {
      disposed = true;
    };
  }, []);

  useEffect(() => {
    if (settings.appearance.windowMaterial !== effectiveWindowMaterial) {
      updateAppearance({ windowMaterial: effectiveWindowMaterial });
    }
  }, [effectiveWindowMaterial, settings.appearance.windowMaterial, updateAppearance]);

  useEffect(() => {
    rdpEmbeddedHostSuppressedRef.current = shouldSuppressRdpEmbeddedHost;
    if (!hasTauriRuntime()) {
      return;
    }

    if (shouldSuppressRdpEmbeddedHost) {
      if (activeRdpSession?.result?.embedded) {
        syncRdpEmbeddedBounds(activeRdpSession, null, false);
      }
      return;
    }

    const frame = window.requestAnimationFrame(syncActiveRdpEmbeddedBounds);
    return () => {
      window.cancelAnimationFrame(frame);
    };
  }, [
    activeRdpSession,
    shouldSuppressRdpEmbeddedHost,
    syncActiveRdpEmbeddedBounds,
    syncRdpEmbeddedBounds,
  ]);

  useEffect(() => {
    void setWindowMaterial(effectiveWindowMaterial);
  }, [effectiveWindowMaterial]);

  useEffect(() => {
    if (!hasTauriRuntime()) {
      return;
    }

    const appWindow = getCurrentWindow();
    let disposed = false;
    let frameId: number | null = null;
    const unlisteners: Array<() => void> = [];
    const scheduleSync = () => {
      if (disposed || frameId !== null) {
        return;
      }
      frameId = window.requestAnimationFrame(() => {
        frameId = null;
        syncActiveRdpEmbeddedBounds();
      });
    };

    void (async () => {
      const unlistenMove = await appWindow.onMoved(scheduleSync);
      if (disposed) {
        unlistenMove();
        return;
      }
      unlisteners.push(unlistenMove);

      const unlistenResize = await appWindow.onResized(scheduleSync);
      if (disposed) {
        unlistenResize();
        return;
      }
      unlisteners.push(unlistenResize);

      const unlistenScale = await appWindow.onScaleChanged(scheduleSync);
      if (disposed) {
        unlistenScale();
        return;
      }
      unlisteners.push(unlistenScale);

      const unlistenFocus = await appWindow.onFocusChanged(scheduleSync);
      if (disposed) {
        unlistenFocus();
        return;
      }
      unlisteners.push(unlistenFocus);
    })();

    return () => {
      disposed = true;
      if (frameId !== null) {
        window.cancelAnimationFrame(frameId);
      }
      unlisteners.forEach((unlisten) => unlisten());
    };
  }, [syncActiveRdpEmbeddedBounds]);

  useEffect(() => {
    if (!hasTauriRuntime()) {
      return;
    }

    let disposed = false;
    let unlisten: (() => void) | null = null;
    void listenRdpSessionClosed((event) => {
      if (disposed) {
        return;
      }
      const closedTabIds = rdpSessionsRef.current
        .filter((session) => session.result?.session_id === event.session_id)
        .map((session) => session.id);
      if (closedTabIds.length === 0) {
        return;
      }
      removeRdpSessionsLocally(closedTabIds);
      void rdpCloseSession(event.session_id).catch(() => undefined);
    }).then((cleanup) => {
      if (disposed) {
        cleanup();
      } else {
        unlisten = cleanup;
      }
    });

    return () => {
      disposed = true;
      unlisten?.();
    };
  }, [activeConnectionId, activeRdpSessionId, activeWorkspaceMode, remoteFileTabs.length]);

  useEffect(() => {
    if (!hasTauriRuntime()) {
      return;
    }

    let disposed = false;
    const unlisteners: Array<() => void> = [];

    void Promise.all([
      listenVncRunnerWindowReady((event) => {
        if (disposed) {
          return;
        }
        vncRunnerWindowReadyRef.current = true;
        pendingVncRunnerWindowPayloadsRef.current.forEach((payload, sessionId) => {
          if (payload.window_label !== event.window_label) {
            return;
          }
          void emitVncRunnerWindowPayload(event.window_label, payload)
            .then(() => {
              pendingVncRunnerWindowPayloadsRef.current.delete(sessionId);
            })
            .catch(() => undefined);
        });
      }),
      listenVncRunnerWindowClosed((event) => {
        if (disposed) {
          return;
        }
        pendingVncRunnerWindowPayloadsRef.current.delete(event.workspace_session_id);
        closeVncSessions([event.workspace_session_id], { notifyRunnerWindow: false });
      }),
      listenVncRunnerWindowMessage((event) => {
        if (disposed || !vncSessionExists(event.workspace_session_id)) {
          return;
        }
        updateVncSession(event.workspace_session_id, (session) => ({
          ...session,
          message: event.message,
        }));
      }),
      listenVncRunnerWindowError((event) => {
        if (disposed || !vncSessionExists(event.workspace_session_id)) {
          return;
        }
        const session = vncSessionsRef.current.find(
          (item) => item.id === event.workspace_session_id,
        );
        if (session?.result?.session_id) {
          void vncCloseSession(session.result.session_id).catch(() => undefined);
        }
        updateVncSession(event.workspace_session_id, (current) => ({
          ...current,
          error: event.message,
          message: null,
          status: "error",
        }));
      }),
    ]).then((cleanups) => {
      if (disposed) {
        cleanups.forEach((cleanup) => cleanup());
      } else {
        unlisteners.push(...cleanups);
      }
    });

    return () => {
      disposed = true;
      unlisteners.forEach((unlisten) => unlisten());
    };
  }, [activeConnectionId, activeVncSessionId, activeWorkspaceMode, remoteFileTabs.length]);

  useEffect(() => {
    if (!hasTauriRuntime()) {
      return;
    }

    let disposed = false;
    let unlisten: (() => void) | null = null;
    void getCurrentWebview().onDragDropEvent((event) => {
      if (!disposed) {
        handleNativeFileDropEvent(event.payload);
      }
    }).then((cleanup) => {
      if (disposed) {
        cleanup();
      } else {
        unlisten = cleanup;
      }
    });

    return () => {
      disposed = true;
      unlisten?.();
      setNativeFileDropTargetPath(null);
    };
  }, [
    remoteFileConnection?.id,
    rightPaneCollapsed,
    rightTool,
    settings.fileTransfer.conflictPolicyDefault,
    settings.fileTransfer.keepArchives,
    showSessionWorkspace,
    showWorkspaceToolPane,
  ]);

  const updateTabStatus = useCallback((tabId: string, status: string) => {
    setTerminalTabs((tabs) =>
      tabs.map((tab) => (tab.id === tabId && tab.status !== status ? { ...tab, status } : tab)),
    );
  }, []);

  const updateTerminalRuntimeSession = useCallback((
    tabId: string,
    sessionId: string,
    requestId?: string,
  ) => {
    setTerminalTabs((tabs) => {
      let changed = false;
      const nextTabs = tabs.map((tab) => {
        if (tab.id !== tabId || tab.type !== "terminal") {
          return tab;
        }
        const nextRequestId = requestId || tab.requestId;
        if (
          tab.sessionId === sessionId &&
          tab.requestId === nextRequestId &&
          tab.status === "已连接" &&
          tab.error === null &&
          tab.warmupOutput.length === 0
        ) {
          return tab;
        }
        changed = true;
        return {
          ...tab,
          error: null,
          requestId: nextRequestId,
          sessionId,
          status: "已连接",
          warmupOutput: [],
        };
      });
      if (!changed) {
        return tabs;
      }
      terminalTabsRef.current = nextTabs;
      return nextTabs;
    });
  }, []);

  const updateLocalTerminalTabStatus = useCallback((tabId: string, status: string) => {
    setLocalTerminalTabs((tabs) =>
      tabs.map((tab) => (tab.id === tabId && tab.status !== status ? { ...tab, status } : tab)),
    );
  }, []);

  const updateTerminalDirectory = useCallback((tabId: string, path: string) => {
    setTerminalDirectories((directories) => {
      if (directories[tabId] === path) {
        terminalDirectoriesRef.current = directories;
        return directories;
      }
      const nextDirectories = { ...directories, [tabId]: path };
      terminalDirectoriesRef.current = nextDirectories;
      return nextDirectories;
    });
  }, []);

  const updateTerminalPromptDirectorySnapshotReader = useCallback((
    tabId: string,
    reader: TerminalPromptDirectorySnapshotReader | null,
  ) => {
    if (reader) {
      terminalPromptDirectorySnapshotReadersRef.current.set(tabId, reader);
    } else {
      terminalPromptDirectorySnapshotReadersRef.current.delete(tabId);
    }
  }, []);

  const resolveTerminalLocatePath = useCallback((tabId: string) => {
    const snapshotPath = terminalPromptDirectorySnapshotReadersRef.current.get(tabId)?.() || null;
    if (snapshotPath) {
      const normalizedPath = normalizeRemotePath(snapshotPath);
      updateTerminalDirectory(tabId, normalizedPath);
      return normalizedPath;
    }
    return terminalDirectoriesRef.current[tabId] || null;
  }, [updateTerminalDirectory]);

  const appendTerminalRecentOutput = useCallback((tabId: string, output: string) => {
    if (!output) {
      return;
    }
    setTerminalRecentOutputByTabId((items) => {
      const nextOutput = tailStringByChars(`${items[tabId] || ""}${stripTerminalControlText(output)}`, 12000);
      return nextOutput === items[tabId] ? items : { ...items, [tabId]: nextOutput };
    });
  }, []);

  function remoteFileTabId(connectionId: string, path: string) {
    return `file:${connectionId}:${normalizeRemotePath(path)}`;
  }

  function updateRemoteFileTab(
    tabId: string,
    updater: (tab: RemoteFileEditorTab) => RemoteFileEditorTab,
  ) {
    setRemoteFileTabs((tabs) => tabs.map((tab) => (tab.id === tabId ? updater(tab) : tab)));
  }

  function triggerRemoteFileRefresh(connectionId: string, path: string) {
    setRemoteFileRefreshRequest((request) => ({
      connectionId,
      id: (request?.id || 0) + 1,
      path: normalizeRemotePath(path),
    }));
  }

  function triggerRemoteFileLocate(connectionId: string, path: string) {
    setRemoteFileLocateRequest((request) => ({
      connectionId,
      id: (request?.id || 0) + 1,
      path: normalizeRemotePath(path),
    }));
  }

  function startTransferProgressPulse(
    transferId: string,
    input: {
      cap: number;
      detail?: string | null;
      start: number;
      stage: string;
      speedText?: string | null;
    },
  ) {
    let tick = 0;
    setTransferProgress(transferId, {
      detail: input.detail,
      indeterminate: true,
      progress: input.start,
      speedText: input.speedText,
      stage: input.stage,
    });

    const timer = window.setInterval(() => {
      tick += 1;
      const eased = input.start + (input.cap - input.start) * (1 - Math.pow(0.86, tick));
      updateRemoteFileTransfer(transferId, {
        progress: Math.min(input.cap, eased),
        progressIndeterminate: true,
        stage: input.stage,
        status: "running",
      });
    }, 1200);

    return () => window.clearInterval(timer);
  }

  function connectionForTransfer(connectionId: string) {
    return connectionById.get(connectionId) || null;
  }

  function retryRemoteFileTransfer(transferId: string) {
    const item = getRemoteFileTransfer(transferId);
    if (!item || item.status !== "error" || !item.retry) {
      return;
    }

    const retry = item.retry;
    const connection = retry.action === "download" ? null : connectionForTransfer(retry.connectionId);
    if (retry.action !== "download" && !connection) {
      failTransfer(transferId, tr("workspace.transfer.retryFailed"), new Error(tr("workspace.transfer.connectionMissing")));
      return;
    }

    switch (retry.action) {
      case "local-file-upload":
        void runLocalFileUpload(retry.parentPath, retry.localPath, {
          connection: connection!,
          conflictPolicy: retry.conflictPolicy,
          transferId,
        });
        return;
      case "local-directory-upload":
        void runLocalDirectoryUpload(retry.parentPath, retry.localPath, {
          compress: retry.compress,
          connection: connection!,
          conflictPolicy: retry.conflictPolicy,
          keepArchive: retry.keepArchive,
          transferId,
        });
        return;
      case "browser-file-upload":
        void runSingleFileUpload(retry.parentPath, retry.item, {
          connection: connection!,
          conflictPolicy: retry.conflictPolicy,
          transferId,
        });
        return;
      case "browser-directory-upload":
        void runDirectoryUpload(retry.parentPath, retry.rootName, retry.items, {
          connection: connection!,
          conflictPolicy: retry.conflictPolicy,
          keepArchive: retry.keepArchive,
          transferId,
        });
        return;
      case "download":
        void runRemoteFileDownload(retry.entry, {
          input: retry.input,
          transferId,
        });
    }
  }

  function failTransfer(transferId: string, stage: string, error: unknown) {
    const currentTransfer = getRemoteFileTransfer(transferId);
    if (currentTransfer?.status === "canceled") {
      return;
    }
    if (isTransferCanceledError(error)) {
      markTransferCanceled(transferId);
      return;
    }
    const code = extractTransferErrorCode(error);
    const mappedStage = code ? transferErrorStage(code) : null;
    const suggestion = code ? transferErrorSuggestion(code) : null;
    const baseError = formatDetailedError(error);
    const errorText = suggestion ? `${baseError}\n${tr("workspace.error.suggestion", { suggestion })}` : baseError;
    updateRemoteFileTransfer(transferId, {
      error: errorText,
      progressIndeterminate: false,
      speedText: null,
      stage: mappedStage ?? stage,
      status: "error",
    });
  }

  function downloadTargetOptions(connection: ConnectionProfile, entry: RemoteFileEntry) {
    return {
      connectionId: connection.id,
      directory: entry.type === "directory",
      downloadRoot: settings.fileTransfer.downloadRoot || undefined,
      groupBySession: settings.fileTransfer.groupBySession,
      path: entry.path,
      sessionName: transferSessionName(connection),
      timestampDirectory: settings.fileTransfer.timestampDirectory,
      timestampName: formatTransferTimestamp(new Date(), settings.fileTransfer.timestampFormat),
    };
  }

  async function resolveDownloadConflictPolicy(
    downloadOptions: Omit<RemoteFileDownloadToLocalInput, "transferId" | "compress" | "conflictPolicy" | "keepArchives">,
    transferId: string,
  ): Promise<RemoteFileTransferConflictPolicy | "failed" | null> {
    const defaultPolicy = settings.fileTransfer.conflictPolicyDefault;
    if (defaultPolicy !== "ask") {
      return toRemoteFileConflictPolicy(defaultPolicy);
    }

    if (!hasTauriRuntime()) {
      return "rename";
    }

    setTransferProgress(transferId, {
      detail: null,
      indeterminate: true,
      progress: 2,
      stage: tr("workspace.transfer.checkLocal"),
    });
    let check;
    try {
      check = await remoteFileCheckDownloadTarget(downloadOptions);
    } catch (error) {
      failTransfer(transferId, tr("workspace.transfer.checkLocalFailed"), error);
      return "failed";
    }
    if (!check.exists) {
      return "rename";
    }

    return promptTransferConflictPolicy(
      check.name,
      tr("workspace.transfer.localExists", { path: check.local_path }),
    );
  }

  async function resolveUploadConflictPolicy(
    connection: ConnectionProfile,
    remotePath: string,
    transferId: string,
  ): Promise<RemoteFileTransferConflictPolicy | "failed" | null> {
    const defaultPolicy = settings.fileTransfer.conflictPolicyDefault;
    if (defaultPolicy !== "ask") {
      return toRemoteFileConflictPolicy(defaultPolicy);
    }

    if (!hasTauriRuntime()) {
      return "rename";
    }

    setTransferProgress(transferId, {
      detail: null,
      indeterminate: true,
      progress: 2,
      stage: tr("workspace.transfer.checkRemote"),
    });
    let check;
    try {
      check = await remoteFileCheckPath(connection.id, remotePath);
    } catch (error) {
      failTransfer(transferId, tr("workspace.transfer.checkRemoteFailed"), error);
      return "failed";
    }
    if (!check.exists) {
      return "rename";
    }

    return promptTransferConflictPolicy(
      remoteFileName(remotePath),
      tr("workspace.transfer.remoteExists", { path: check.path }),
    );
  }

  function promptTransferConflictPolicy(name: string, description: string) {
    return new Promise<RemoteFileTransferConflictPolicy | null>((resolve) => {
      setTransferConflictPrompt({
        description,
        id: `conflict-${Date.now().toString()}`,
        name,
        resolve,
      });
    });
  }

  function settleTransferConflictPrompt(policy: RemoteFileTransferConflictPolicy | null) {
    const prompt = transferConflictPrompt;
    if (!prompt) {
      return;
    }
    prompt.resolve(policy);
    setTransferConflictPrompt(null);
  }

  function openLocalTransferPath(path: string) {
    if (!hasTauriRuntime()) {
      void copyText(path);
      return;
    }
    void openPath(path);
  }

  function revealLocalTransferPath(path: string) {
    if (!hasTauriRuntime()) {
      void copyText(path);
      return;
    }
    void revealItemInDir(path);
  }

  function activateRemoteFileTab(tab: RemoteFileEditorTab) {
    const sameConnectionActiveTerminal = activeTabId
      ? terminalTabs.find((item) => item.id === activeTabId && item.connectionId === tab.connectionId)
      : null;
    const terminalTab = sameConnectionActiveTerminal || preferredTabForConnection(tab.connectionId);
    dispatchTabs({
      type: "tabs/activateFile",
      connectionId: tab.connectionId,
      fileTabId: tab.id,
      rememberUnified: isConnectionTerminalFileUnified(tab.connectionId),
      terminalTabId: terminalTab?.id ?? null,
    });
  }

  function activateRemoteFileFallbackAfterRemoval(
    nextRemoteFileTabs: RemoteFileEditorTab[],
    preferredConnectionId: string,
  ) {
    const sameConnectionFileTab = nextRemoteFileTabs.find(
      (tab) => tab.connectionId === preferredConnectionId,
    );
    if (sameConnectionFileTab) {
      activateRemoteFileTab(sameConnectionFileTab);
      return;
    }

    const anyFileTab = nextRemoteFileTabs[0];
    if (anyFileTab) {
      activateRemoteFileTab(anyFileTab);
      return;
    }

    dispatchTabs({ type: "tabs/clearActiveFile" });
    activateTerminalFallbackAfterFilesClose();
  }

  function activateTerminalFallbackAfterFilesClose() {
    const nextTerminalTab =
      (activeTabId ? terminalTabs.find((tab) => tab.id === activeTabId) || null : null) ||
      (activeConnectionId ? preferredTabForConnection(activeConnectionId) : null) ||
      terminalTabs[0] ||
      null;

    if (nextTerminalTab) {
      activateTerminalTab(nextTerminalTab);
      return;
    }

    const nextRdpSession = activeRdpSessionId
      ? rdpSessions.find((session) => session.id === activeRdpSessionId) || null
      : rdpSessions[0] || null;
    if (nextRdpSession) {
      activateRdpSession(nextRdpSession);
      return;
    }

    const nextVncSession = activeVncSessionId
      ? vncSessions.find((session) => session.id === activeVncSessionId) || null
      : vncSessions[0] || null;
    if (nextVncSession) {
      activateVncSession(nextVncSession);
      return;
    }

    dispatchTabs({ type: "tabs/fallbackHomeKeepPointers" });
  }

  function openRemoteFile(entry: RemoteFileEntry) {
    if (!activeConnection || entry.type === "directory") {
      return;
    }

    const path = normalizeRemotePath(entry.path);
    const existingTab = remoteFileTabs.find(
      (tab) => tab.connectionId === activeConnection.id && tab.path === path,
    );
    if (existingTab) {
      activateRemoteFileTab(existingTab);
      return;
    }

    const tab: RemoteFileEditorTab = {
      connectionId: activeConnection.id,
      connectionName: activeConnection.name,
      content: "",
      dirty: false,
      error: null,
      id: remoteFileTabId(activeConnection.id, path),
      metadata: null,
      name: entry.name,
      path,
      savedContent: "",
      saveState: "loading",
      statusMessage: tr("workspace.editor.reading"),
    };

    setRemoteFileTabs((tabs) => [...tabs, tab]);
    activateRemoteFileTab(tab);

    void loadRemoteFileTab(activeConnection, path, tab.id);
  }

  function locateRemoteFileFolder(tabId: string) {
    const tab = remoteFileTabs.find((item) => item.id === tabId);
    if (!tab) {
      return;
    }

    activateRemoteFileTab(tab);
    setLeftPaneCollapsed(false);
    setWorkspaceSidebarView("files");
    triggerRemoteFileLocate(tab.connectionId, remotePathParent(tab.path));
  }

  async function loadRemoteFileTab(connection: ConnectionProfile, path: string, tabId: string) {
    try {
      const result = hasTauriRuntime()
        ? await remoteFileRead(connection.id, path)
        : previewRemoteFileRead(connection, path);
      updateRemoteFileTab(tabId, (tab) => ({
        ...tab,
        content: result.content,
        dirty: false,
        error: null,
        metadata: result.metadata,
        name: result.name,
        path: result.path,
        savedContent: result.content,
        saveState: "ready",
        statusMessage: tr("workspace.editor.ready"),
      }));
    } catch (error) {
      updateRemoteFileTab(tabId, (tab) => ({
        ...tab,
        content: "",
        dirty: false,
        error: formatError(error),
        saveState: "error",
        statusMessage: formatError(error),
      }));
    }
  }

  function handleRemoteFileChange(tabId: string, content: string) {
    updateRemoteFileTab(tabId, (tab) => ({
      ...tab,
      content,
      dirty: content !== tab.savedContent,
      saveState: content === tab.savedContent ? "ready" : "dirty",
      statusMessage: content === tab.savedContent ? tr("workspace.editor.ready") : tr("workspace.editor.modified"),
    }));
  }

  function saveRemoteFile(tabId: string, overwrite = false) {
    const tab = remoteFileTabs.find((item) => item.id === tabId);
    if (!tab || !tab.metadata || tab.saveState === "saving") {
      return;
    }

    updateRemoteFileTab(tabId, (item) => ({
      ...item,
      error: null,
      saveState: "saving",
      statusMessage: tr("workspace.editor.saving"),
    }));

    void (hasTauriRuntime()
      ? remoteFileWrite({
          connectionId: tab.connectionId,
          content: tab.content,
          expectedMtime: tab.metadata.mtime,
          expectedSize: tab.metadata.size,
          overwrite,
          path: tab.path,
        })
      : Promise.resolve({
          conflict: false,
          metadata: {
            ...tab.metadata,
            mtime: Date.now(),
            size: new TextEncoder().encode(tab.content).length,
          },
        }))
      .then((result) => {
        updateRemoteFileTab(tabId, (item) => ({
          ...item,
          dirty: false,
          error: null,
          metadata: result.metadata,
          savedContent: item.content,
          saveState: "saved",
          statusMessage: tr("workspace.editor.saved"),
        }));
        triggerRemoteFileRefresh(tab.connectionId, remotePathParent(tab.path));
      })
      .catch((error: unknown) => {
        if (isRemoteFileConflict(error)) {
          updateRemoteFileTab(tabId, (item) => ({
            ...item,
            error: formatError(error),
            saveState: "conflict",
            statusMessage: tr("workspace.editor.remoteChanged"),
          }));
          setPendingRemoteFileConflictId(tabId);
          return;
        }

        updateRemoteFileTab(tabId, (item) => ({
          ...item,
          error: formatError(error),
          saveState: "error",
          statusMessage: formatError(error),
        }));
      });
  }

  function reloadRemoteFile(tabId: string) {
    const tab = remoteFileTabs.find((item) => item.id === tabId);
    const connection = tab ? connectionById.get(tab.connectionId) : null;
    if (!tab || !connection) {
      return;
    }

    updateRemoteFileTab(tabId, (item) => ({
      ...item,
      error: null,
      saveState: "loading",
      statusMessage: tr("workspace.editor.reading"),
    }));
    void loadRemoteFileTab(connection, tab.path, tabId);
  }

  function discardRemoteFileChanges(tabId: string) {
    updateRemoteFileTab(tabId, (tab) => ({
      ...tab,
      content: tab.savedContent,
      dirty: false,
      error: null,
      saveState: "ready",
      statusMessage: tr("workspace.editor.discarded"),
    }));
  }

  function clearRemoteFileSessionStateForConnections(closingConnectionIds: Set<string>) {
    const nextRemoteFileTabs = remoteFileTabs.filter(
      (tab) => !closingConnectionIds.has(tab.connectionId),
    );

    if (nextRemoteFileTabs.length !== remoteFileTabs.length) {
      setRemoteFileTabs(nextRemoteFileTabs);
    }
    if (
      activeRemoteFileTabId &&
      !nextRemoteFileTabs.some((tab) => tab.id === activeRemoteFileTabId)
    ) {
      dispatchTabs({ type: "tabs/clearActiveFile" });
    }
    setPendingRemoteFileCloseId((tabId) =>
      tabId && nextRemoteFileTabs.some((tab) => tab.id === tabId) ? tabId : null,
    );
    setPendingRemoteFileConflictId((tabId) =>
      tabId && nextRemoteFileTabs.some((tab) => tab.id === tabId) ? tabId : null,
    );
    setRemoteFileDeleteTarget((target) =>
      target && closingConnectionIds.has(target.connectionId) ? null : target,
    );
    if (remoteFileTextAction && closingConnectionIds.has(remoteFileTextAction.connectionId)) {
      setRemoteFileTextAction(null);
      setRemoteFileTextValue("");
      setRemoteFileTextError(null);
    }
    setRemoteFileLocateRequest((request) =>
      request && closingConnectionIds.has(request.connectionId) ? null : request,
    );
    setRemoteFileRefreshRequest((request) =>
      request && closingConnectionIds.has(request.connectionId) ? null : request,
    );
    setTerminalFileLayoutByConnectionId((layouts) =>
      removeConnectionRecordEntries(layouts, closingConnectionIds),
    );
    dispatchTabs({ type: "tabs/forgetUnified", connectionIds: Array.from(closingConnectionIds) });

    return nextRemoteFileTabs;
  }

  function closeRemoteFileTab(tabId: string) {
    const tab = remoteFileTabs.find((item) => item.id === tabId);
    if (tab?.dirty) {
      setPendingRemoteFileCloseId(tabId);
      return;
    }
    closeRemoteFileTabNow(tabId);
  }

  function closeRemoteFileTabs(tabIds: string[]) {
    const closingIds = new Set(tabIds);
    const dirtyTab = remoteFileTabs.find((tab) => closingIds.has(tab.id) && tab.dirty);
    const cleanTabIds = remoteFileTabs
      .filter((tab) => closingIds.has(tab.id) && !tab.dirty)
      .map((tab) => tab.id);

    if (cleanTabIds.length > 0) {
      closeRemoteFileTabsNow(cleanTabIds);
    }
    if (dirtyTab) {
      setPendingRemoteFileCloseId(dirtyTab.id);
    }
  }

  function closeRemoteFileTabNow(tabId: string) {
    closeRemoteFileTabsNow([tabId]);
  }

  function closeRemoteFileTabsNow(tabIds: string[]) {
    const closingIds = new Set(tabIds);
    const closingActiveTab = activeRemoteFileTabId
      ? remoteFileTabs.find((tab) => tab.id === activeRemoteFileTabId && closingIds.has(tab.id)) || null
      : null;
    const nextTabs = remoteFileTabs.filter((tab) => !closingIds.has(tab.id));

    setRemoteFileTabs(nextTabs);
    if (closingActiveTab) {
      activateRemoteFileFallbackAfterRemoval(nextTabs, closingActiveTab.connectionId);
    }
  }

  function closeOtherRemoteFileTabs(tabId: string) {
    const tab = remoteFileTabs.find((item) => item.id === tabId);
    if (!tab) {
      return;
    }
    closeRemoteFileTabs(
      remoteFileTabs
        .filter((item) => item.connectionId === tab.connectionId && item.id !== tabId)
        .map((item) => item.id),
    );
  }

  function closeRemoteFileTabsToRight(tabId: string) {
    const tab = remoteFileTabs.find((item) => item.id === tabId);
    if (!tab) {
      return;
    }
    const sameConnectionTabs = remoteFileTabs.filter((item) => item.connectionId === tab.connectionId);
    const index = sameConnectionTabs.findIndex((item) => item.id === tabId);
    if (index < 0) {
      return;
    }
    closeRemoteFileTabs(sameConnectionTabs.slice(index + 1).map((item) => item.id));
  }

  function closeAllRemoteFileTabsForConnection(connectionId: string) {
    closeRemoteFileTabs(
      remoteFileTabs
        .filter((tab) => tab.connectionId === connectionId)
        .map((tab) => tab.id),
    );
  }

  function closeSavedRemoteFileTabsForConnection(connectionId: string) {
    closeRemoteFileTabsNow(
      remoteFileTabs
        .filter((tab) => tab.connectionId === connectionId && isClosableSavedRemoteFileTab(tab))
        .map((tab) => tab.id),
    );
  }

  function requestCreateRemoteFile(parentPath: string) {
    if (!activeConnection) {
      return;
    }
    setRemoteFileTextAction({
      action: "create-file",
      connectionId: activeConnection.id,
      parentPath: normalizeRemotePath(parentPath),
    });
    setRemoteFileTextValue("untitled.txt");
    setRemoteFileTextError(null);
  }

  function requestCreateRemoteDirectory(parentPath: string) {
    if (!activeConnection) {
      return;
    }
    setRemoteFileTextAction({
      action: "create-directory",
      connectionId: activeConnection.id,
      parentPath: normalizeRemotePath(parentPath),
    });
    setRemoteFileTextValue("new-folder");
    setRemoteFileTextError(null);
  }

  function requestRenameRemoteEntry(entry: RemoteFileEntry) {
    if (!activeConnection) {
      return;
    }
    setRemoteFileTextAction({ action: "rename", connectionId: activeConnection.id, entry });
    setRemoteFileTextValue(entry.name);
    setRemoteFileTextError(null);
  }

  function requestDeleteRemoteEntry(entry: RemoteFileEntry) {
    requestDeleteRemoteEntries([entry]);
  }

  function requestDeleteRemoteEntries(entries: RemoteFileEntry[]) {
    if (!activeConnection) {
      return;
    }
    const normalizedEntries = collapseRemoteFileDeleteEntries(entries);
    if (normalizedEntries.length === 0) {
      return;
    }
    setRemoteFileDeleteTarget({ connectionId: activeConnection.id, entries: normalizedEntries });
  }

  async function submitRemoteFileTextAction(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const action = remoteFileTextAction;
    if (!action) {
      return;
    }

    const value = remoteFileTextValue.trim();
    if (!isValidRemoteBaseName(value)) {
      setRemoteFileTextError(remoteFileNameValidationMessage(value));
      return;
    }

    try {
      if (action.action === "create-file") {
        const path = joinRemotePath(action.parentPath, value);
        const metadata = hasTauriRuntime()
          ? await remoteFileCreateFile(action.connectionId, path)
          : previewRemoteFileMetadata(path);
        triggerRemoteFileRefresh(action.connectionId, remotePathParent(metadata.path));
        if (activeConnection) {
          openRemoteFile({
            name: metadata.name,
            path: metadata.path,
            type: "file",
          });
        }
      } else if (action.action === "create-directory") {
        const path = joinRemotePath(action.parentPath, value);
        if (hasTauriRuntime()) {
          await remoteFileCreateDirectory(action.connectionId, path);
        }
        triggerRemoteFileRefresh(action.connectionId, action.parentPath);
      } else {
        const newPath = joinRemotePath(remotePathParent(action.entry.path), value);
        if (hasTauriRuntime()) {
          await remoteFileRename({
            connectionId: action.connectionId,
            newPath,
            path: action.entry.path,
          });
        }
        renameRemoteFileTabs(action.connectionId, action.entry.path, newPath);
        triggerRemoteFileRefresh(action.connectionId, remotePathParent(action.entry.path));
        triggerRemoteFileRefresh(action.connectionId, remotePathParent(newPath));
      }
      setRemoteFileTextAction(null);
      setRemoteFileTextValue("");
      setRemoteFileTextError(null);
    } catch (error) {
      setRemoteFileTextError(formatError(error));
    }
  }

  function renameRemoteFileTabs(connectionId: string, oldPath: string, newPath: string) {
    const normalizedOldPath = normalizeRemotePath(oldPath);
    const normalizedNewPath = normalizeRemotePath(newPath);
    setRemoteFileTabs((tabs) =>
      tabs.map((tab) => {
        if (
          tab.connectionId !== connectionId ||
          (tab.path !== normalizedOldPath && !isRemotePathStrictDescendant(tab.path, normalizedOldPath))
        ) {
          return tab;
        }
        const nextPath = tab.path === normalizedOldPath
          ? normalizedNewPath
          : joinRemotePath(normalizedNewPath, tab.path.slice(normalizedOldPath.length + 1));
        return {
          ...tab,
          id: remoteFileTabId(connectionId, nextPath),
          name: remoteFileName(nextPath),
          path: nextPath,
        };
      }),
    );
    if (activeRemoteFileTabId === remoteFileTabId(connectionId, normalizedOldPath)) {
      setActiveRemoteFileTabId(remoteFileTabId(connectionId, normalizedNewPath));
    }
  }

  async function confirmRemoteFileDelete() {
    const target = remoteFileDeleteTarget;
    if (!target) {
      return;
    }
    const entries = collapseRemoteFileDeleteEntries(target.entries);
    if (entries.length === 0) {
      setRemoteFileDeleteTarget(null);
      return;
    }

    if (hasTauriRuntime()) {
      for (const entry of entries) {
        await remoteFileDelete({
          connectionId: target.connectionId,
          path: entry.path,
          recursive: entry.type === "directory",
        });
      }
    }
    for (const parentPath of uniqueRemoteParentPaths(entries)) {
      triggerRemoteFileRefresh(target.connectionId, parentPath);
    }
    const nextRemoteFileTabs = remoteFileTabs.filter(
      (tab) =>
        !entries.some((entry) =>
          isRemoteFileTabUnderEntry(tab, target.connectionId, entry.path),
        ),
    );
    const removedActiveRemoteFileTab = Boolean(
      activeRemoteFileTabId &&
        remoteFileTabs.some((tab) => tab.id === activeRemoteFileTabId) &&
        !nextRemoteFileTabs.some((tab) => tab.id === activeRemoteFileTabId),
    );

    setRemoteFileTabs(nextRemoteFileTabs);
    if (pendingRemoteFileCloseId && !nextRemoteFileTabs.some((tab) => tab.id === pendingRemoteFileCloseId)) {
      setPendingRemoteFileCloseId(null);
    }
    if (pendingRemoteFileConflictId && !nextRemoteFileTabs.some((tab) => tab.id === pendingRemoteFileConflictId)) {
      setPendingRemoteFileConflictId(null);
    }
    if (removedActiveRemoteFileTab) {
      activateRemoteFileFallbackAfterRemoval(nextRemoteFileTabs, target.connectionId);
    }
    setRemoteFileDeleteTarget(null);
  }

  function uploadRemoteFile(parentPath: string) {
    if (!activeConnection) {
      return;
    }
    if (hasTauriRuntime()) {
      void selectLocalUploadFiles()
        .then((paths) => {
          paths.forEach((path) => {
            void runLocalFileUpload(parentPath, path);
          });
        })
        .catch((error: unknown) => {
          showTransferPickerError(tr("workspace.transfer.uploadFile"), parentPath, error);
        });
      return;
    }
    const input = document.createElement("input");
    input.type = "file";
    input.multiple = true;
    input.onchange = () => {
      const files = Array.from(input.files || []);
      if (files.length === 0) {
        return;
      }
      uploadRemoteItems(parentPath, files.map((file) => ({ file, relativePath: file.name })));
    };
    input.click();
  }

  function uploadRemoteDirectory(parentPath: string) {
    if (!activeConnection) {
      return;
    }
    if (hasTauriRuntime()) {
      void selectLocalUploadDirectories()
        .then((paths) => {
          paths.forEach((path) => {
            void runLocalDirectoryUpload(parentPath, path);
          });
        })
        .catch((error: unknown) => {
          showTransferPickerError(tr("workspace.transfer.uploadFolder"), parentPath, error);
        });
      return;
    }
    const input = document.createElement("input");
    input.type = "file";
    input.multiple = true;
    input.setAttribute("webkitdirectory", "");
    input.onchange = () => {
      const files = Array.from(input.files || []);
      if (files.length === 0) {
        return;
      }
      uploadRemoteItems(
        parentPath,
        files.map((file) => ({
          file,
          relativePath: getFileRelativePath(file),
        })),
      );
    };
    input.click();
  }

  function uploadRemoteItems(parentPath: string, items: RemoteFileUploadItem[]) {
    if (!activeConnection || items.length === 0) {
      return;
    }

    const normalizedParent = normalizeRemotePath(parentPath);
    const directFiles = items.filter((item) => !normalizeUploadRelativePath(item.relativePath).includes("/"));
    const directoryGroups = groupUploadDirectories(items);

    directFiles.forEach((item) => {
      void runSingleFileUpload(normalizedParent, item);
    });
    Array.from(directoryGroups.entries()).forEach(([rootName, groupItems]) => {
      void runDirectoryUpload(normalizedParent, rootName, groupItems);
    });
  }

  function handleNativeFileDropEvent(event: DragDropEvent) {
    if (!remoteFileConnection || rightPaneCollapsed || rightTool !== "files" || !showSessionWorkspace) {
      setNativeFileDropTargetPath(null);
      return;
    }

    if (event.type === "leave") {
      setNativeFileDropTargetPath(null);
      return;
    }

    const targetPath = resolveNativeFileDropTargetPath(event.position);
    if (event.type === "drop") {
      setNativeFileDropTargetPath(null);
      if (!targetPath || event.paths.length === 0) {
        return;
      }
      uploadNativeDroppedPaths(targetPath, event.paths);
      return;
    }

    setNativeFileDropTargetPath(targetPath);
  }

  function uploadNativeDroppedPaths(parentPath: string, paths: string[]) {
    paths.forEach((path) => {
      void uploadNativeDroppedPath(parentPath, path);
    });
  }

  async function uploadNativeDroppedPath(parentPath: string, localPath: string) {
    try {
      const metadata = await localPathMetadata(localPath);
      if (metadata.kind === "directory") {
        await runLocalDirectoryUpload(parentPath, metadata.path);
        return;
      }
      if (metadata.kind === "file") {
        await runLocalFileUpload(parentPath, metadata.path);
        return;
      }
      showTransferPickerError("Unsupported local item", parentPath, new Error(`Unsupported local path: ${localPath}`));
    } catch (error) {
      showTransferPickerError("Drop upload", parentPath, error);
    }
  }

  function showTransferPickerError(action: string, parentPath: string, error: unknown) {
    const transferId = addRemoteFileTransfer({
      direction: "upload",
      kind: "file",
      name: action,
      progress: 100,
      progressDetail: null,
      remotePath: parentPath,
      stage: tr("workspace.transfer.selectionFailed"),
    });
    updateRemoteFileTransfer(transferId, {
      error: formatError(error),
      progressIndeterminate: false,
      status: "error",
    });
  }

  async function runLocalFileUpload(
    parentPath: string,
    localPath: string,
    options: TransferRunOptions = {},
  ) {
    const connection = options.connection ?? activeConnection;
    if (!connection) {
      if (options.transferId) {
        failTransfer(options.transferId, tr("workspace.transfer.retryFailed"), new Error(tr("workspace.transfer.connectionMissing")));
      }
      return;
    }
    const normalizedParentPath = normalizeRemotePath(parentPath);
    const localName = localPathName(localPath);
    const uploadPath = joinRemotePath(normalizedParentPath, localName);
    const transferId = options.transferId ?? addRemoteFileTransfer({
      connectionId: connection.id,
      direction: "upload",
      kind: "file",
      name: localName,
      progress: 0,
      remotePath: uploadPath,
      stage: tr("workspace.transfer.waitUpload"),
    });
    if (options.transferId) {
      prepareTransferRetry(transferId, tr("workspace.transfer.prepareRetry"));
    }

    enqueueRemoteFileTransfer(transferId, async () => {
      try {
        const conflictPolicy = options.conflictPolicy ?? await resolveUploadConflictPolicy(connection, uploadPath, transferId);
        if (conflictPolicy === "failed") {
          return;
        }
        if (!conflictPolicy) {
          markTransferCanceled(transferId);
          return;
        }
        if (isTransferNoLongerActive(transferId)) {
          return;
        }

        updateRemoteFileTransfer(transferId, {
          retry: {
            action: "local-file-upload",
            connectionId: connection.id,
            conflictPolicy,
            localPath,
            parentPath: normalizedParentPath,
          },
        });
        setTransferProgress(transferId, {
          indeterminate: true,
          progress: 4,
          stage: tr("workspace.transfer.uploading"),
        });
        const result = await remoteFileUploadLocalFile({
          connectionId: connection.id,
          conflictPolicy,
          localPath,
          path: uploadPath,
          transferId,
        });
        finishUploadTransfer(transferId, connection.id, result);
      } catch (error) {
        failTransfer(transferId, tr("workspace.transfer.uploadFailed"), error);
      }
    });
  }

  async function runLocalDirectoryUpload(
    parentPath: string,
    localPath: string,
    options: DirectoryTransferRunOptions = {},
  ) {
    const connection = options.connection ?? activeConnection;
    if (!connection) {
      if (options.transferId) {
        failTransfer(options.transferId, tr("workspace.transfer.retryFailed"), new Error(tr("workspace.transfer.connectionMissing")));
      }
      return;
    }
    const normalizedParentPath = normalizeRemotePath(parentPath);
    const rootName = localPathName(localPath);
    const remotePath = joinRemotePath(normalizedParentPath, rootName);
    const transferId = options.transferId ?? addRemoteFileTransfer({
      connectionId: connection.id,
      direction: "upload",
      kind: "directory",
      name: rootName,
      progress: 0,
      remotePath,
      stage: tr("workspace.transfer.waitUpload"),
    });
    if (options.transferId) {
      prepareTransferRetry(transferId, tr("workspace.transfer.prepareRetry"));
    }

    enqueueRemoteFileTransfer(transferId, async () => {
      try {
        const conflictPolicy = options.conflictPolicy ?? await resolveUploadConflictPolicy(connection, remotePath, transferId);
        if (conflictPolicy === "failed") {
          return;
        }
        if (!conflictPolicy) {
          markTransferCanceled(transferId);
          return;
        }
        if (isTransferNoLongerActive(transferId)) {
          return;
        }

        const compress = options.compress ?? settings.fileTransfer.compressDirectories;
        const keepArchive = options.keepArchive ?? settings.fileTransfer.keepArchives;
        updateRemoteFileTransfer(transferId, {
          retry: {
            action: "local-directory-upload",
            compress,
            connectionId: connection.id,
            conflictPolicy,
            keepArchive,
            localPath,
            parentPath: normalizedParentPath,
          },
        });
        setTransferProgress(transferId, {
          indeterminate: true,
          progress: 4,
          stage: compress ? tr("workspace.transfer.packUpload") : tr("workspace.transfer.scanDirectory"),
        });
        const result = await remoteFileUploadLocalArchive({
          compress,
          connectionId: connection.id,
          conflictPolicy,
          keepArchive,
          localPath,
          rootName,
          targetDir: normalizedParentPath,
          transferId,
        });
        finishArchiveUploadTransfer(transferId, connection.id, result);
      } catch (error) {
        failTransfer(transferId, tr("workspace.transfer.directoryUploadFailed"), error);
      }
    });
  }

  async function runSingleFileUpload(
    parentPath: string,
    item: RemoteFileUploadItem,
    options: TransferRunOptions = {},
  ) {
    const connection = options.connection ?? activeConnection;
    if (!connection) {
      if (options.transferId) {
        failTransfer(options.transferId, tr("workspace.transfer.retryFailed"), new Error(tr("workspace.transfer.connectionMissing")));
      }
      return;
    }
    const normalizedParentPath = normalizeRemotePath(parentPath);
    const uploadPath = joinRemotePath(normalizedParentPath, item.file.name);
    const transferId = options.transferId ?? addRemoteFileTransfer({
      connectionId: connection.id,
      direction: "upload",
      kind: "file",
      name: item.file.name,
      progress: 0,
      remotePath: uploadPath,
      stage: tr("workspace.transfer.waitUpload"),
    });
    if (options.transferId) {
      prepareTransferRetry(transferId, tr("workspace.transfer.prepareRetry"));
    }

    enqueueRemoteFileTransfer(transferId, async () => {
      if (!hasTauriRuntime()) {
        const stopPulse = startTransferProgressPulse(transferId, {
          cap: 92,
          detail: formatTransferProgressBytes(0, item.file.size),
          start: 8,
          stage: tr("workspace.transfer.uploading"),
        });
        const result = await wait(240).then(() => {
          stopPulse();
          return previewRemoteFileUploadResult(uploadPath, item.file.size);
        });
        finishUploadTransfer(transferId, connection.id, result);
        return;
      }

      let localPath: string | null = null;
      try {
        const conflictPolicy = options.conflictPolicy ?? await resolveUploadConflictPolicy(connection, uploadPath, transferId);
        if (conflictPolicy === "failed") {
          return;
        }
        if (!conflictPolicy) {
          markTransferCanceled(transferId);
          return;
        }
        if (isTransferNoLongerActive(transferId)) {
          return;
        }

        updateRemoteFileTransfer(transferId, {
          retry: {
            action: "browser-file-upload",
            connectionId: connection.id,
            conflictPolicy,
            item,
            parentPath: normalizedParentPath,
          },
        });
        setTransferProgress(transferId, {
          detail: formatTransferProgressBytes(0, item.file.size),
          progress: 4,
          stage: tr("workspace.transfer.writeUploadCache"),
        });
        const temp = await remoteFilePrepareUploadTemp(item.file.name);
        localPath = temp.local_path;
        const localSpeed = createTransferSpeedTracker();
        await writeFileToUploadTemp(localPath, item.file, (loaded, total) => {
          setTransferProgress(transferId, {
            detail: formatTransferProgressBytes(loaded, total),
            progress: interpolateTransferProgress(4, 34, loaded, total),
            speedText: localSpeed.sample(loaded),
            stage: tr("workspace.transfer.writeUploadCache"),
          });
        });
        setTransferProgress(transferId, {
          detail: formatTransferProgressBytes(0, item.file.size),
          indeterminate: false,
          progress: 36,
          stage: tr("workspace.transfer.uploading"),
        });
        const result = await remoteFileUploadLocalFile({
          connectionId: connection.id,
          conflictPolicy,
          localPath,
          path: uploadPath,
          transferId,
        });
        finishUploadTransfer(transferId, connection.id, result);
      } catch (error) {
        failTransfer(transferId, tr("workspace.transfer.uploadFailed"), error);
      } finally {
        if (localPath) {
          void remoteFileDeleteUploadTemp(localPath).catch(() => undefined);
        }
      }
    });
  }

  async function runDirectoryUpload(
    parentPath: string,
    rootName: string,
    items: RemoteFileUploadItem[],
    options: DirectoryTransferRunOptions = {},
  ) {
    const connection = options.connection ?? activeConnection;
    if (!connection) {
      if (options.transferId) {
        failTransfer(options.transferId, tr("workspace.transfer.retryFailed"), new Error(tr("workspace.transfer.connectionMissing")));
      }
      return;
    }
    const normalizedParentPath = normalizeRemotePath(parentPath);
    const remotePath = joinRemotePath(normalizedParentPath, rootName);
    const transferId = options.transferId ?? addRemoteFileTransfer({
      connectionId: connection.id,
      direction: "upload",
      kind: "directory",
      name: rootName,
      progress: 0,
      remotePath,
      stage: tr("workspace.transfer.waitPack"),
    });
    if (options.transferId) {
      prepareTransferRetry(transferId, tr("workspace.transfer.prepareRetry"));
    }

    enqueueRemoteFileTransfer(transferId, async () => {
      if (!hasTauriRuntime()) {
        const stopPulse = startTransferProgressPulse(transferId, {
          cap: 92,
          detail: formatTransferProgressBytes(0, totalUploadBytes(items)),
          start: 8,
          stage: tr("workspace.transfer.uploadExtract"),
        });
        const result = await wait(320).then(() => {
          stopPulse();
          return previewRemoteFileArchiveUploadResult(remotePath);
        });
        finishArchiveUploadTransfer(transferId, connection.id, result);
        return;
      }

      let localPath: string | null = null;
      try {
        const conflictPolicy = options.conflictPolicy ?? await resolveUploadConflictPolicy(connection, remotePath, transferId);
        if (conflictPolicy === "failed") {
          return;
        }
        if (!conflictPolicy) {
          markTransferCanceled(transferId);
          return;
        }
        if (isTransferNoLongerActive(transferId)) {
          return;
        }

        const keepArchive = options.keepArchive ?? settings.fileTransfer.keepArchives;
        updateRemoteFileTransfer(transferId, {
          retry: {
            action: "browser-directory-upload",
            connectionId: connection.id,
            conflictPolicy,
            items,
            keepArchive,
            parentPath: normalizedParentPath,
            rootName,
          },
        });
        const totalBytes = totalUploadBytes(items);
        const archiveSpeed = createTransferSpeedTracker();
        setTransferProgress(transferId, {
          detail: formatTransferProgressBytes(0, totalBytes),
          progress: 3,
          stage: tr("workspace.transfer.localTar"),
        });
        const temp = await remoteFilePrepareUploadTemp(`${rootName}.tar.gz`);
        localPath = temp.local_path;
        const archiveSize = await buildTarGzArchiveToTemp(localPath, items, (progress) => {
          const detail =
            progress.phase === "compress"
              ? tr("workspace.transfer.archiveSize", { size: formatFileSize(progress.archiveBytes) })
              : formatTransferProgressBytes(progress.loadedBytes, progress.totalBytes);
          const speedBytes = progress.phase === "compress" ? progress.archiveBytes : progress.loadedBytes;
          setTransferProgress(transferId, {
            detail,
            progress:
              progress.phase === "compress"
                ? 34
                : interpolateTransferProgress(3, 32, progress.loadedBytes, progress.totalBytes),
            speedText: archiveSpeed.sample(speedBytes),
            stage: progress.phase === "compress" ? tr("workspace.transfer.compressTar") : tr("workspace.transfer.localTar"),
          });
        });
        const stopPulse = startTransferProgressPulse(transferId, {
          cap: 92,
          detail: tr("workspace.transfer.archiveSize", { size: formatFileSize(archiveSize) }),
          start: 38,
          stage: tr("workspace.transfer.uploadExtract"),
        });
        const result = await remoteFileUploadLocalArchive({
          compress: true,
          connectionId: connection.id,
          conflictPolicy,
          keepArchive,
          localPath,
          rootName,
          targetDir: normalizedParentPath,
          transferId,
        }).finally(stopPulse);
        finishArchiveUploadTransfer(transferId, connection.id, result);
      } catch (error) {
        failTransfer(transferId, tr("workspace.transfer.directoryUploadFailed"), error);
      } finally {
        if (localPath) {
          void remoteFileDeleteUploadTemp(localPath).catch(() => undefined);
        }
      }
    });
  }

  function finishUploadTransfer(
    transferId: string,
    connectionId: string,
    result: RemoteFileUploadResult,
  ) {
    if (isTransferNoLongerActive(transferId)) {
      return;
    }
    updateRemoteFileTransfer(transferId, {
      name: result.name,
      progress: 100,
      progressDetail: result.skipped ? null : "100%",
      progressIndeterminate: false,
      remotePath: result.path,
      speedText: null,
      stage: result.skipped ? tr("workspace.transfer.skipped") : tr("workspace.transfer.uploadComplete"),
      status: result.skipped ? "skipped" : "success",
    });
    triggerRemoteFileRefresh(connectionId, remotePathParent(result.path));
  }

  function finishArchiveUploadTransfer(
    transferId: string,
    connectionId: string,
    result: RemoteFileArchiveUploadResult,
  ) {
    if (isTransferNoLongerActive(transferId)) {
      return;
    }
    updateRemoteFileTransfer(transferId, {
      name: result.name,
      progress: 100,
      progressDetail: result.skipped ? null : "100%",
      progressIndeterminate: false,
      remotePath: result.path,
      speedText: null,
      stage: result.skipped ? tr("workspace.transfer.skipped") : tr("workspace.transfer.directoryUploadComplete"),
      status: result.skipped ? "skipped" : "success",
    });
    triggerRemoteFileRefresh(connectionId, remotePathParent(result.path));
  }

  function downloadRemoteFile(entry: RemoteFileEntry) {
    downloadRemoteFiles([entry]);
  }

  function downloadRemoteFiles(entries: RemoteFileEntry[]) {
    if (!activeConnection) {
      return;
    }
    void runRemoteFileDownloadQueue(entries);
  }

  async function runRemoteFileDownloadQueue(entries: RemoteFileEntry[]) {
    for (const entry of entries) {
      await runRemoteFileDownload(entry);
    }
  }

  async function runRemoteFileDownload(
    entry: RemoteFileEntry,
    options: DownloadTransferRunOptions = {},
  ) {
    const connection = options.input
      ? connectionForTransfer(options.input.connectionId)
      : activeConnection;
    if (!connection) {
      if (options.transferId) {
        failTransfer(options.transferId, tr("workspace.transfer.retryFailed"), new Error(tr("workspace.transfer.connectionMissing")));
      }
      return;
    }
    const isDirectory = entry.type === "directory";
    const transferId = options.transferId ?? addRemoteFileTransfer({
      connectionId: connection.id,
      direction: "download",
      kind: isDirectory ? "directory" : "file",
      name: entry.name,
      progress: 0,
      remotePath: entry.path,
      stage: isDirectory ? tr("workspace.transfer.waitScan") : tr("workspace.transfer.waitDownload"),
    });
    if (options.transferId) {
      prepareTransferRetry(transferId, tr("workspace.transfer.prepareRetry"));
    }

    enqueueRemoteFileTransfer(transferId, async () => {
      let stopPulse: (() => void) | null = null;
      try {
        const downloadOptions = options.input ?? downloadTargetOptions(connection, entry);
        const conflictPolicy = options.input?.conflictPolicy ?? await resolveDownloadConflictPolicy(downloadOptions, transferId);
        if (conflictPolicy === "failed") {
          return;
        }
        if (!conflictPolicy) {
          markTransferCanceled(transferId);
          return;
        }
        if (isTransferNoLongerActive(transferId)) {
          return;
        }

        const request: Omit<RemoteFileDownloadToLocalInput, "transferId"> = options.input ?? {
          ...downloadOptions,
          compress: settings.fileTransfer.compressDirectories,
          conflictPolicy,
          keepArchives: settings.fileTransfer.keepArchives,
        };
        updateRemoteFileTransfer(transferId, {
          retry: {
            action: "download",
            entry,
            input: request,
          },
        });

        let result: RemoteFileDownloadToLocalResult;
        if (hasTauriRuntime()) {
          setTransferProgress(transferId, {
            indeterminate: true,
            progress: 4,
            stage: isDirectory
              ? request.compress
                ? tr("workspace.transfer.compressing")
                : tr("workspace.transfer.scanDirectory")
              : tr("workspace.transfer.prepareDownload"),
          });
          result = await remoteFileDownloadToLocal({
            ...request,
            transferId,
          });
        } else {
          stopPulse = startTransferProgressPulse(transferId, {
            cap: 92,
            detail: null,
            start: 8,
            stage: isDirectory ? tr("workspace.transfer.previewDirectoryDownload") : tr("workspace.transfer.downloadLocal"),
          });
          result = await wait(300).then(() =>
            previewRemoteFileDownloadToLocalResult(entry, isDirectory),
          );
          stopPulse?.();
        }
        finishDownloadTransfer(transferId, result);
      } catch (error) {
        stopPulse?.();
        failTransfer(transferId, tr("workspace.transfer.downloadFailed"), error);
      }
    });
  }

  function finishDownloadTransfer(transferId: string, result: RemoteFileDownloadToLocalResult) {
    if (isTransferNoLongerActive(transferId)) {
      return;
    }
    updateRemoteFileTransfer(transferId, {
      localPath: result.local_path,
      name: result.name,
      progress: 100,
      progressDetail: result.skipped ? null : "100%",
      progressIndeterminate: false,
      remotePath: result.remote_path,
      speedText: null,
      stage: result.skipped ? tr("workspace.transfer.skipped") : tr("workspace.transfer.downloadComplete"),
      status: result.skipped ? "skipped" : "success",
    });
  }

  function showRemoteFileProperties(entry: RemoteFileEntry) {
    if (!activeConnection) {
      return;
    }
    setRemoteFileProperties({ entry, loading: true, metadata: null });
    void (hasTauriRuntime()
      ? remoteFileMetadata(activeConnection.id, entry.path)
      : Promise.resolve(previewRemoteFileEntryMetadata(entry)))
      .then((metadata) => {
        setRemoteFileProperties({ entry, loading: false, metadata });
      })
      .catch((error: unknown) => {
        setRemoteFileProperties({ entry, error: formatError(error), loading: false, metadata: null });
      });
  }

  function copyRemotePath(path: string) {
    void copyText(path);
  }

  async function openQuickConnect(target: QuickConnectTarget) {
    const connection = await createTemporaryQuickConnectProfile(target);
    setTemporaryConnections((items) => [...items, connection]); startConnectionStep(connection, "terminal");
  }

  async function createConnection(
    groupName?: string,
    initialProtocol?: ConnectionProtocol,
  ) {
    setLeftPaneCollapsed(false);
    setPendingConnectionGroupId(groupName || null);
    setPendingConnectionProtocol(initialProtocol || null);
    setEditingConnection(null);
    setDuplicatingConnection(false);
    await ensureConnectionDialogLoaded();
    setDialogOpen(true);
  }

  async function editConnection(connection: ConnectionProfile) {
    setPendingConnectionGroupId(null);
    setPendingConnectionProtocol(null);
    setEditingConnection(connection);
    setDuplicatingConnection(false);
    await ensureConnectionDialogLoaded();
    setDialogOpen(true);
  }

  async function duplicateConnection(connection: ConnectionProfile) {
    setPendingConnectionGroupId(null);
    setPendingConnectionProtocol(null);
    setEditingConnection(connection);
    setDuplicatingConnection(true);
    await ensureConnectionDialogLoaded();
    setDialogOpen(true);
  }

  async function saveConnection(input: ConnectionProfileInput) {
    const saved = await upsert(input);
    setSelectedConnectionId(saved.id);
    setPendingConnectionGroupId(null);
    return saved;
  }

  async function deleteConnection(connection: ConnectionProfile) {
    if (hasTauriRuntime() && isSshConnection(connection)) {
      await tunnelStopConnection(connection.id);
    }
    await remove(connection.id);
    const remainingRemoteFileTabs = clearRemoteFileSessionStateForConnections(new Set([connection.id]));
    closeRdpSessions(
      rdpSessionsRef.current
        .filter((session) => session.connectionId === connection.id)
        .map((session) => session.id),
    );
    closeVncSessions(
      vncSessionsRef.current
        .filter((session) => session.connectionId === connection.id)
        .map((session) => session.id),
    );
    const closingTabs = terminalTabsRef.current.filter((tab) => tab.connectionId === connection.id);
    const closingTabIds = closingTabs.map((tab) => tab.id);
    closingTabIds.forEach(stopTerminalWarmupCapture);
    closeRuntimeTerminalSessions(closingTabs);
    setTerminalDirectories((directories) => removeDirectoryState(directories, closingTabIds));
    forgetActiveConnectionTabs([connection.id]);
    const nextTabs = terminalTabsRef.current.filter((tab) => tab.connectionId !== connection.id);
    terminalTabsRef.current = nextTabs;
    setTerminalTabs(nextTabs);
    dispatchTabs({
      type: "tabs/closeConnections",
      connectionIds: [connection.id],
      snapshot: snapshotFromRefs({ remoteFileTabs: remainingRemoteFileTabs.map(sessionRef), terminalTabs: nextTabs.map(sessionRef) }),
      variant: "delete",
    });

    if (selectedConnectionId === connection.id) {
      setSelectedConnectionId(null);
    }
  }

  async function refreshConnectedProfile(
    connectionId: string,
    request: ConnectionRuntimeCredentialRequest,
  ) {
    if (hasTauriRuntime()) {
      await probeSystem(request).catch(() => null);
    }
    await markConnected(connectionId).catch(() => null);
  }

  function buildConnectingTab(
    tabs: TerminalTab[],
    connection: ConnectionProfile,
    step: ConnectionStepState,
  ): TerminalTab {
    const ordinal = nextTerminalOrdinalForConnection(tabs, connection.id);

    return {
      connectionId: connection.id,
      connectionStep: step,
      id: `connection-${connection.id}-${step.id.toString()}`,
      ordinal,
      status: connectionStepStatusTitle(step),
      temporaryContextRef: step.temporaryContextRef || undefined,
      title: step.mode === "terminal" ? tr("workspace.connection.prepare") : tr("workspace.connection.test"),
      type: "connecting",
      warmupOutput: [],
    };
  }

  function buildDirectTerminalTab(
    tabs: TerminalTab[],
    connection: ConnectionProfile,
    title?: string,
  ): TerminalTab {
    const now = Date.now();
    const nonce = `${now.toString()}-${Math.random().toString(36).slice(2, 8)}`;
    const ordinal = nextTerminalOrdinalForConnection(tabs, connection.id);

    return {
      connectionId: connection.id,
      connectionStep: null,
      id: `terminal-${connection.id}-${nonce}`,
      ordinal,
      requestId: `terminal-${connection.id}-${nonce}`,
      status: "正在连接",
      title: title || terminalTabTitle(ordinal),
      type: "terminal",
      warmupOutput: [],
    };
  }

  function updateConnectingTabStep(tabId: string, step: ConnectionStepState) {
    setTerminalTabs((tabs) =>
      {
        const nextTabs: TerminalTab[] = tabs.map((tab) =>
        tab.id === tabId
          ? {
              ...tab,
              connectionStep: step,
              status: connectionStepStatusTitle(step),
              title:
                step.status === "error"
                  ? tr("workspace.connection.failed")
                  : step.mode === "terminal"
                    ? tr("workspace.connection.prepare")
                    : tr("workspace.connection.test"),
            }
          : tab,
        );
        terminalTabsRef.current = nextTabs;
        return nextTabs;
      },
    );
  }

  function replaceConnectingTabWithTerminal(
    tabId: string,
    sessionId: string,
    warmupOutput: number[] = [],
    requestId?: string,
  ) {
    setTerminalTabs((tabs) =>
      {
        const nextTabs = tabs.map((tab) =>
        tab.id === tabId
          ? {
              ...tab,
              connectionStep: null,
              error: null,
              requestId,
              sessionId,
              status: "已连接",
              title: terminalTabTitle(tab.ordinal),
              type: "terminal" as const,
              warmupOutput,
            }
          : tab,
        );
        terminalTabsRef.current = nextTabs;
        return nextTabs;
      },
    );
  }

  function appendTerminalWarmupOutput(tabId: string, data: number[]) {
    if (data.length === 0) {
      return;
    }

    setTerminalTabs((tabs) => {
      let changed = false;
      const nextTabs = tabs.map((tab) => {
        if (tab.id !== tabId || tab.type !== "terminal") {
          return tab;
        }
        changed = true;
        return {
          ...tab,
          warmupOutput: [...tab.warmupOutput, ...data],
        };
      });
      if (!changed) {
        return tabs;
      }
      terminalTabsRef.current = nextTabs;
      return nextTabs;
    });
  }

  function appendLocalTerminalWarmupOutput(tabId: string, data: number[]) {
    if (data.length === 0) {
      return;
    }

    setLocalTerminalTabs((tabs) => {
      let changed = false;
      const nextTabs = tabs.map((tab) => {
        if (tab.id !== tabId || !tab.sessionId) {
          return tab;
        }
        changed = true;
        return {
          ...tab,
          warmupOutput: [...tab.warmupOutput, ...data],
        };
      });
      if (!changed) {
        return tabs;
      }
      localTerminalTabsRef.current = nextTabs;
      return nextTabs;
    });
  }

  function setTerminalWarmupCaptureStop(tabId: string, stop: () => void) {
    stopTerminalWarmupCapture(tabId);
    terminalWarmupCaptureStopsRef.current.set(tabId, stop);
  }

  function stopTerminalWarmupCapture(tabId: string) {
    const stop = terminalWarmupCaptureStopsRef.current.get(tabId);
    if (!stop) {
      return;
    }
    terminalWarmupCaptureStopsRef.current.delete(tabId);
    stop();
  }

  function connectingTabExists(tabId: string) {
    return terminalTabsRef.current.some((tab) => tab.id === tabId && tab.type === "connecting");
  }

  function sessionRef(item: { connectionId: string; id: string }): SessionRef {
    return { connectionId: item.connectionId, id: item.id };
  }

  /**
   * WF-00B：关闭/删除决策的集合快照。默认从四个 *Ref 与渲染态 remoteFileTabs 组装；
   * 调用方把本次已算出的"移除后"列表通过 overrides 传入。
   */
  function snapshotFromRefs(overrides: Partial<CloseSnapshot> = {}): CloseSnapshot {
    return {
      localTerminalTabs: localTerminalTabsRef.current.map((tab) => ({ id: tab.id })),
      rdpSessions: rdpSessionsRef.current.map(sessionRef),
      remoteFileTabs: remoteFileTabs.map(sessionRef),
      terminalTabs: terminalTabsRef.current.map(sessionRef),
      vncSessions: vncSessionsRef.current.map(sessionRef),
      ...overrides,
    };
  }

  function terminalTabExists(tabId: string) {
    return terminalTabsRef.current.some((tab) => tab.id === tabId);
  }

  function setConnectionTerminalFileLayout(connectionId: string, mode: RemoteFileOpenMode) {
    setTerminalFileLayoutByConnectionId((layouts) =>
      layouts[connectionId] === mode ? layouts : { ...layouts, [connectionId]: mode },
    );
  }

  function isConnectionTerminalFileUnified(connectionId: string) {
    return (
      (terminalFileLayoutByConnectionId[connectionId] || settings.basic.remoteFileOpenMode) ===
      "unified"
    );
  }

  function rememberUnifiedActiveTab(connectionId: string, tab: UnifiedWorkbenchTab) {
    dispatchTabs({ type: "tabs/rememberUnified", connectionId, tab });
  }

  function forgetActiveConnectionTabs(connectionIds: string[]) {
    dispatchTabs({ type: "tabs/forgetConnections", connectionIds });
  }

  function preferredTabForConnection(connectionId: string, tabs = terminalTabs) {
    const rememberedTabId = activeTabByConnectionId[connectionId];
    return (
      (rememberedTabId
        ? tabs.find((tab) => tab.connectionId === connectionId && tab.id === rememberedTabId)
        : null) ||
      tabs.find((tab) => tab.connectionId === connectionId) ||
      null
    );
  }

  function pendingTabForConnection(connectionId: string, tabs = terminalTabs) {
    return tabs.find((tab) => tab.connectionId === connectionId && tab.type === "connecting") || null;
  }

  function terminalSplitHostForBinding(binding: TerminalPaneBinding): TerminalSplitHost | null {
    const exists =
      binding.kind === "ssh"
        ? terminalTabs.some((item) => item.id === binding.tabId)
        : localTerminalTabs.some((item) => item.id === binding.tabId);
    return exists ? binding : null;
  }

  function createSameSessionTerminalBinding(
    binding: TerminalPaneBinding,
  ): TerminalPaneBinding | null {
    if (binding.kind === "ssh") {
      const sourceTab = terminalTabs.find((tab) => tab.id === binding.tabId);
      const connection = sourceTab ? connectionById.get(sourceTab.connectionId) || null : null;
      if (!isSshConnection(connection)) {
        return null;
      }
      const tab = openTerminalInConnection(connection, false);
      return { kind: "ssh", tabId: tab.id };
    }

    const sourceTab = localTerminalTabs.find((tab) => tab.id === binding.tabId);
    if (!sourceTab) {
      return null;
    }
    if (sourceTab.source === "telnet" || sourceTab.source === "serial") {
      const connection = connectionById.get(sourceTab.profileId) || null;
      if (
        (sourceTab.source === "telnet" && isTelnetConnection(connection)) ||
        (sourceTab.source === "serial" && isSerialConnection(connection))
      ) {
        const tab = openCharacterTerminalInConnection(connection, false);
        return { kind: "local", tabId: tab.id };
      }
      return null;
    }

    const profile = localTerminalProfiles.find((item) => item.id === sourceTab.profileId) || null;
    const tab = openLocalTerminalByProfile(profile, false);
    return tab ? { kind: "local", tabId: tab.id } : null;
  }

  function restoreWorkspaceShell(snapshot: WorkspaceSnapshotV1) {
    workspaceRestoreTargetRefsRef.current = snapshotTargetRefs(snapshot);
    const restorePlan = buildWorkspaceRestorePlan(snapshot, { autoReconnect: settings.basic.reopenLastTerminal, profileIds: new Set([...connections.map((item) => item.id), ...localTerminalProfiles.map((item) => item.id)]) });
    const hydration = applyWorkspaceRestorePlanToHydration(buildWorkspaceShellHydration(snapshot, { connectionName: (id) => connectionById.get(id)?.name || null, localProfile: (id) => { const profile = localTerminalProfiles.find((item) => item.id === id); return profile ? { kind: profile.kind, name: profile.name } : null; } }), restorePlan);
    const restoredTerminalTabs = hydration.terminalTabs as TerminalTab[];
    terminalTabsRef.current = restoredTerminalTabs; setTerminalTabs(restoredTerminalTabs); localTerminalTabsRef.current = hydration.localTerminalTabs; setLocalTerminalTabs(hydration.localTerminalTabs);
    rdpSessionsRef.current = hydration.rdpSessions; setRdpSessions(hydration.rdpSessions); vncSessionsRef.current = hydration.vncSessions; setVncSessions(hydration.vncSessions);
    snapshot.order.forEach((itemId) => dispatchTabs({ type: "tabs/itemOpened", itemId })); setTerminalSplitLayout(hydration.splitLayout); setTerminalSplitHost(hydration.splitHost); setFocusedTerminalPaneId(hydration.focusedPaneId);
    setTerminalSplitTabActive(snapshot.activeItemId === SPLIT_ITEM_ID && Boolean(hydration.splitLayout)); setMultiExecMode("off"); setMultiExecTargets(new Set()); setTerminalSplitSyncError(null);
    setLeftPaneCollapsed(snapshot.sidebar.collapsed); setWorkspaceSidebarView(snapshot.sidebar.view); seedWorkspaceRemoteFileDirectories(snapshot.files.directories);
    if (settings.basic.filePanelFollowsActiveConnection !== snapshot.files.followActivePane) updateBasic({ filePanelFollowsActiveConnection: snapshot.files.followActivePane });
    switch (hydration.active.kind) {
      case "ssh": dispatchTabs({ type: "tabs/activateTerminal", connectionId: hydration.active.connectionId, tabId: hydration.active.tabId, rememberUnified: false }); break;
      case "local": dispatchTabs({ type: "tabs/activateLocal", tabId: hydration.active.tabId }); break;
      case "rdp": dispatchTabs({ type: "tabs/activateRdp", connectionId: hydration.active.connectionId, sessionId: hydration.active.sessionId }); break;
      case "vnc": dispatchTabs({ type: "tabs/activateVnc", connectionId: hydration.active.connectionId, sessionId: hydration.active.sessionId }); break;
      case "split": { const host = hydration.active.host; const tab = host.kind === "ssh" ? restoredTerminalTabs.find((item) => item.id === host.tabId) : null; dispatchTabs({ type: "tabs/activateSplitHost", host: tab ? { kind: "ssh", connectionId: tab.connectionId } : { kind: "local" } }); dispatchTabs({ type: "tabs/focusPaneBinding", binding: host }); break; }
      default: dispatchTabs({ type: "tabs/goHome" });
    }
    window.requestAnimationFrame(() => restorePlan.items.filter((item) => item.autoReconnect).forEach((item) => reconnectRestoredWorkspaceItem(item.instance.id)));
  }

  function reconnectRestoredWorkspaceItem(instanceId: string) {
    if (instanceId.startsWith("ssh:")) retryRestoredSshTab(instanceId.slice(4));
    else if (instanceId.startsWith("local:")) retryRestoredLocalTab(instanceId.slice(6));
  }

  function retryRestoredSshTab(tabId: string) {
    const tab = terminalTabsRef.current.find((item) => item.id === tabId); const connection = tab ? connectionById.get(tab.connectionId) : null;
    if (tab && isSshConnection(connection)) { startConnectionStep(connection, "terminal", false, tab.id); return; }
    if (tab) { const next = terminalTabsRef.current.map((item) => item.id === tabId ? { ...item, error: tr("workspace.savedSshMissing"), status: "连接失败" } : item); terminalTabsRef.current = next; setTerminalTabs(next); }
  }

  function retryRestoredLocalTab(tabId: string) {
    const tab = localTerminalTabsRef.current.find((item) => item.id === tabId); if (!tab) return;
    const requestId = `restore-${tab.id}-${Date.now().toString()}`;
    if (tab.source === "telnet" || tab.source === "serial") {
      const connection = connectionById.get(tab.profileId);
      if ((tab.source === "telnet" && isTelnetConnection(connection)) || (tab.source === "serial" && isSerialConnection(connection))) {
        const next = { ...tab, error: undefined, requestId, sessionId: undefined, status: "正在连接", warmupOutput: [] }; const tabs = localTerminalTabsRef.current.map((item) => item.id === tab.id ? next : item); localTerminalTabsRef.current = tabs; setLocalTerminalTabs(tabs); void runCharacterConnectionSession(next, connection); return;
      }
    } else {
      const profile = localTerminalProfilesRef.current.find((item) => item.id === tab.profileId) || null;
      if (profile) { const next = { ...tab, error: undefined, profileKind: profile.kind, requestId, sessionId: undefined, source: "local" as const, status: "正在连接", title: localTerminalTitle(profile, displayOrdinal(tab.ordinal)), warmupOutput: [] }; const tabs = localTerminalTabsRef.current.map((item) => item.id === tab.id ? next : item); localTerminalTabsRef.current = tabs; setLocalTerminalTabs(tabs); void openRuntimeLocalTerminalSession(next, "local-preview", () => localTerminalOpen({ cols: 80, cwd: profile.cwd || undefined, profile: toLocalTerminalProfileInput(profile), request_id: requestId, rows: 24 })).catch(() => undefined); return; }
    }
    const next = localTerminalTabsRef.current.map((item) => item.id === tab.id ? { ...item, error: tr("workspace.savedLocalMissing"), status: "连接失败" } : item); localTerminalTabsRef.current = next; setLocalTerminalTabs(next);
  }

  function openHome() {
    setSettingsSectionRequest(undefined);
    dispatchTabs({ type: "tabs/goHome" });
  }

  function activateTerminalSplitHost(host: TerminalSplitHost | null = terminalSplitHost) {
    if (!host) return;
    setSettingsSectionRequest(undefined);
    if (host.kind === "ssh") {
      const tab = terminalTabs.find((item) => item.id === host.tabId);
      if (!tab) return;
      dispatchTabs({ type: "tabs/activateSplitHost", host: { kind: "ssh", connectionId: tab.connectionId } });
      return;
    }
    if (localTerminalTabs.some((item) => item.id === host.tabId)) {
      dispatchTabs({ type: "tabs/activateSplitHost", host: { kind: "local" } });
    }
  }

  function activateTerminalSplitTab(paneId?: string) {
    if (!terminalSplitLayout || !terminalSplitHost) {
      return;
    }
    setTerminalSplitTabActive(true);
    setTerminalSplitSyncError(null);
    activateTerminalSplitHost();
    const nextPane =
      (paneId ? terminalSplitPanes.find((pane) => pane.id === paneId) : null) ||
      focusedTerminalSplitPane ||
      terminalSplitPanes[0] ||
      null;
    if (nextPane) {
      focusTerminalSplitPane(nextPane.id);
    }
  }

  function requestTerminalSplitPicker(paneId: string, removeOnCancel: boolean) {
    terminalSplitPickerRequestRef.current += 1;
    terminalSplitPickerPendingPaneRef.current = removeOnCancel ? paneId : null;
    setTerminalSplitPickerOpenRequest({
      key: terminalSplitPickerRequestRef.current,
      paneId,
    });
  }

  function focusTerminalSplitPane(paneId: string) {
    const pane = terminalSplitPanes.find((item) => item.id === paneId);
    if (!pane) {
      return;
    }
    setFocusedTerminalPaneId(pane.id);
    if (!pane.binding) {
      return;
    }
    if (pane.binding.kind === "ssh") {
      const tab = terminalTabs.find((item) => item.id === pane.binding?.tabId);
      if (tab) {
        dispatchTabs({ type: "tabs/focusPaneBinding", binding: { kind: "ssh", tabId: tab.id } });
      }
      return;
    }
    const tab = localTerminalTabs.find((item) => item.id === pane.binding?.tabId);
    if (tab) {
      dispatchTabs({ type: "tabs/focusPaneBinding", binding: { kind: "local", tabId: tab.id } });
    }
  }

  function assignTerminalSplitBinding(paneId: string, binding: TerminalPaneBinding) {
    setTerminalSplitLayout((layout) => {
      if (!layout) {
        return layout;
      }
      const previousPane = findTerminalSplitPaneByBinding(layout, binding);
      const targetPane = collectTerminalSplitPanes(layout).find((pane) => pane.id === paneId);
      let nextLayout = moveTerminalSplitBinding(layout, paneId, binding);
      if (!previousPane || previousPane.id === paneId) {
        return nextLayout;
      }
      if (targetPane?.binding && !terminalPaneBindingsEqual(targetPane.binding, binding)) {
        nextLayout = moveTerminalSplitBinding(nextLayout, previousPane.id, targetPane.binding);
      }
      return nextLayout;
    });
    setFocusedTerminalPaneId(paneId);
    terminalSplitPickerPendingPaneRef.current = null;
    setTerminalSplitPickerOpenRequest(null);
  }

  function startTerminalSplit(direction: TerminalSplitBranch["direction"]) {
    const initialBinding = fallbackTerminalSplitBinding();
    if (!initialBinding) {
      return;
    }
    startTerminalSplitForBinding(initialBinding, direction);
  }

  function startTerminalSplitForBinding(
    binding: TerminalPaneBinding,
    direction: TerminalSplitBranch["direction"],
  ) {
    if (terminalSplitLayout && !terminalSplitCanAddPane) {
      return;
    }
    if (!terminalSplitLayout) {
      const host = terminalSplitHostForBinding(binding);
      if (!host) {
        return;
      }
      const firstPaneId = nextTerminalSplitId("terminal-pane");
      const nextPaneId = nextTerminalSplitId("terminal-pane");
      const nextBinding = terminalSplitAutoCreateSameSession
        ? createSameSessionTerminalBinding(binding) || undefined
        : undefined;
      const nextLayout = splitTerminalPane(
        createTerminalSplitLayout(firstPaneId, binding),
        firstPaneId,
        direction,
        nextTerminalSplitId("terminal-split"),
        nextPaneId,
        nextBinding,
      );
      setTerminalSplitHost(host);
      setTerminalSplitTabActive(true);
      setTerminalSplitLayout(nextLayout);
      setFocusedTerminalPaneId(nextPaneId);
      activateTerminalSplitHost(host);
      if (!nextBinding) {
        requestTerminalSplitPicker(nextPaneId, true);
      }
      return;
    }

    const boundPane = findTerminalSplitPaneByBinding(terminalSplitLayout, binding);
    const paneId = boundPane?.id || focusedTerminalPaneId || terminalSplitPanes[0]?.id;
    if (!paneId) {
      return;
    }
    const nextPaneId = nextTerminalSplitId("terminal-pane");
    const nextBinding = boundPane
      ? terminalSplitAutoCreateSameSession
        ? createSameSessionTerminalBinding(binding) || undefined
        : undefined
      : binding;
    setTerminalSplitLayout((layout) =>
      layout
        ? splitTerminalPane(
            layout,
            paneId,
            direction,
            nextTerminalSplitId("terminal-split"),
            nextPaneId,
            nextBinding,
          )
        : layout,
    );
    setTerminalSplitTabActive(true);
    activateTerminalSplitHost();
    setFocusedTerminalPaneId(nextPaneId);
    if (!nextBinding) {
      requestTerminalSplitPicker(nextPaneId, true);
    }
  }

  function startTerminalFourPaneLayout() {
    const initialBinding = fallbackTerminalSplitBinding();
    if (!initialBinding) {
      return;
    }
    startTerminalFourPaneForBinding(initialBinding);
  }

  function startTerminalFourPaneForBinding(binding: TerminalPaneBinding) {
    const host = terminalSplitHost || terminalSplitHostForBinding(binding);
    if (!host) {
      return;
    }
    const currentBindings = terminalSplitPanes.flatMap((pane) => (pane.binding ? [pane.binding] : []));
    const bindings = currentBindings.length > 0 ? [...currentBindings] : [binding];
    if (!bindings.some((candidate) => terminalPaneBindingsEqual(candidate, binding))) {
      bindings.push(binding);
    }
    while (terminalSplitAutoCreateSameSession && bindings.length < terminalSplitMaxPanes) {
      const nextBinding = createSameSessionTerminalBinding(binding);
      if (!nextBinding) {
        break;
      }
      bindings.push(nextBinding);
    }
    const nextLayout = createTerminalFourPane(bindings.slice(0, terminalSplitMaxPanes));
    if (!terminalSplitHost) {
      setTerminalSplitHost(host);
    }
    setTerminalSplitTabActive(true);
    setTerminalSplitLayout(nextLayout.layout);
    setFocusedTerminalPaneId(nextLayout.focusedPaneId);
    activateTerminalSplitHost(host);
    if (nextLayout.emptyPaneId) {
      requestTerminalSplitPicker(nextLayout.emptyPaneId, false);
    }
  }

  function removeTerminalSplitPaneLayout(paneId: string) {
    if (!terminalSplitLayout) return;
    const nextLayout = closeTerminalSplitLayoutPane(terminalSplitLayout, paneId);
    if (!nextLayout) {
      resetTerminalSplitState();
      return;
    }
    const nextPanes = collectTerminalSplitPanes(nextLayout);
    const nextFocusedPane =
      nextPanes.find((pane) => pane.id === focusedTerminalPaneId) || nextPanes[0] || null;
    setTerminalSplitLayout(nextLayout);
    setFocusedTerminalPaneId(nextFocusedPane?.id || null);
  }

  function closeTerminalSplitPane(paneId: string) {
    void actionExecutor.run({
      actionId: "terminal.closePane",
      source: "context-menu",
      target: { kind: "pane", itemId: SPLIT_ITEM_ID, paneId },
    });
  }

  function handleTerminalSplitPickerOpenChange(paneId: string, open: boolean) {
    if (open || terminalSplitPickerPendingPaneRef.current !== paneId) {
      return;
    }
    terminalSplitPickerPendingPaneRef.current = null;
    setTerminalSplitPickerOpenRequest(null);
    closeTerminalSplitEmptyPane(paneId);
  }

  function closeTerminalSplitEmptyPane(paneId: string) {
    setTerminalSplitLayout((layout) =>
      layout ? closeTerminalSplitLayoutPane(layout, paneId) : layout,
    );
    if (focusedTerminalPaneId === paneId) {
      const fallbackPane = terminalSplitPanes.find((pane) => pane.id !== paneId) || null;
      setFocusedTerminalPaneId(fallbackPane?.id || null);
    }
  }

  function clearTerminalTab(tabId: string) {
    terminalClearRequestRef.current += 1;
    setTerminalClearRequest({ id: terminalClearRequestRef.current, tabId });
  }

  function clearTerminalSplitPane(binding: TerminalPaneBinding) {
    clearTerminalTab(binding.tabId);
    const pane = terminalSplitLayout
      ? findTerminalSplitPaneByBinding(terminalSplitLayout, binding)
      : null;
    if (pane) {
      focusTerminalSplitPane(pane.id);
    }
  }

  function toggleTerminalSplitPaneSearch(binding: TerminalPaneBinding) {
    const pane = terminalSplitLayout
      ? findTerminalSplitPaneByBinding(terminalSplitLayout, binding)
      : null;
    if (pane) {
      focusTerminalSplitPane(pane.id);
    }
    toggleTerminalSearch(binding.tabId);
  }

  function equalizeTerminalSplitPanes() {
    setTerminalSplitLayout((layout) => (layout ? equalizeTerminalSplitLayout(layout) : layout));
    setTerminalSplitLayoutRevision((revision) => revision + 1);
  }

  function setTerminalSplitSyncState(enabled: boolean) {
    setTerminalSplitSyncError(null);
    if (!enabled) {
      setMultiExecMode("off");
      return;
    }
    if (multiExecTargets.size === 0) {
      setMultiExecMode("off");
      setTerminalSplitSyncError(tr("workspace.split.chooseTarget"));
      return;
    }
    setMultiExecMode("live");
  }

  function toggleMultiExecBar() {
    setMultiExecBarOpen(!showMultiExecBar);
    if (showMultiExecBar && multiExecMode === "live") setTerminalSplitSyncState(false);
  }

  function setTerminalSplitSyncParticipant(key: string, participant: boolean) {
    setMultiExecTargets((current) => {
      const next = new Set(current);
      if (participant) next.add(key);
      else next.delete(key);
      return next;
    });
    setTerminalSplitSyncError(null);
  }

  function handleMultiExecUserInput(tabId: string, data: string) {
    if (multiExecMode !== "live" || activeTerminalToolbarTabId !== tabId) {
      return;
    }
    const source = multiExecRuntimeTargets.find((target) => target.tabId === tabId) || null;
    if (!source) {
      return;
    }

    void writeMultiExecLiveInput({
      data,
      selectedKeys: multiExecTargets,
      sourceKey: source.key,
      targets: multiExecRuntimeTargets,
      write: terminalWrite,
    }).then((deliveries) => {
      const failedKeys = new Set(
        deliveries
          .filter((delivery) => delivery.status === "failed")
          .map((delivery) => delivery.key),
      );
      if (failedKeys.size === 0) {
        return;
      }
      setMultiExecTargets((current) => {
        const next = new Set(
          Array.from(current).filter((key) => !failedKeys.has(key)),
        );
        return next;
      });
      setTerminalSplitSyncError(
        tr("workspace.split.writeFailed", { count: failedKeys.size }),
      );
    });
  }

  function requestCloseTerminalSplitGroup() {
    void actionExecutor.run({
      actionId: "terminal.closeSplitGroup",
      source: "context-menu",
      target: { kind: "item", itemId: SPLIT_ITEM_ID },
    });
  }

  /** 只重置分屏布局与同步状态，不关闭任何终端标签（标签关闭由调用方按实例 / 连接 id 负责）。 */
  function resetTerminalSplitState() {
    setTerminalSplitLayout(null);
    setTerminalSplitHost(null);
    setTerminalSplitTabActive(false);
    setFocusedTerminalPaneId(null);
    setTerminalSplitPickerOpenRequest(null);
    terminalSplitPickerPendingPaneRef.current = null;
    setMultiExecMode("off");
    setTerminalSplitSyncError(null);
  }

  function updateTerminalSplitRatio(splitId: string, ratio: number) {
    setTerminalSplitLayout((layout) =>
      layout ? updateTerminalSplitLayoutRatio(layout, splitId, ratio) : layout,
    );
  }

  function activateTerminalBindingAsStandalone(binding: TerminalPaneBinding) {
    if (binding.kind === "ssh") {
      const tab = terminalTabs.find((item) => item.id === binding.tabId);
      if (tab) {
        activateStandaloneTerminalTab(tab);
      }
      return;
    }
    const tab = localTerminalTabs.find((item) => item.id === binding.tabId);
    if (tab) {
      activateStandaloneLocalTerminalTab(tab);
    }
  }

  function activateStandaloneTerminalTab(tab: TerminalTab) {
    setTerminalSplitTabActive(false);
    setSettingsSectionRequest(undefined);
    dispatchTabs({
      type: "tabs/activateTerminal",
      connectionId: tab.connectionId,
      tabId: tab.id,
      rememberUnified: isConnectionTerminalFileUnified(tab.connectionId),
    });
  }

  function activateTerminalTab(tab: TerminalTab) {
    const pane = terminalSplitLayout
      ? findTerminalSplitPaneByBinding(terminalSplitLayout, { kind: "ssh", tabId: tab.id })
      : null;
    if (pane) {
      activateTerminalSplitTab(pane.id);
      return;
    }
    activateStandaloneTerminalTab(tab);
  }

  function handleWorkbenchTabMouseDown(
    event: ReactMouseEvent<HTMLElement>,
    payload: WorkbenchTabDragPayload,
  ) {
    if (event.button !== 0) {
      return;
    }

    const bounds = event.currentTarget.getBoundingClientRect();
    setWorkbenchTabMouseDrag({
      active: false,
      currentX: event.clientX,
      currentY: event.clientY,
      grabOffsetX: event.clientX - bounds.left,
      grabOffsetY: event.clientY - bounds.top,
      payload,
      previewWidth: bounds.width,
      startX: event.clientX,
      startY: event.clientY,
    });
  }

  function handleTerminalSubtabClick(event: ReactMouseEvent<HTMLElement>, tab: TerminalTab) {
    if (suppressNextWorkbenchTabClickRef.current) {
      event.preventDefault();
      return;
    }
    activateTerminalTab(tab);
  }

  function handleRemoteFileSubtabClick(
    event: ReactMouseEvent<HTMLElement>,
    tab: RemoteFileEditorTab,
  ) {
    if (suppressNextWorkbenchTabClickRef.current) {
      event.preventDefault();
      return;
    }
    activateRemoteFileTab(tab);
  }

  function finishWorkbenchTabMouseDrag() {
    setWorkbenchTabMouseDrag(null);
    setWorkbenchTabDropZone(null);
  }

  function applyWorkbenchTabMouseDrop(
    payload: WorkbenchTabDragPayload,
    dropZone: WorkbenchTabDropZone,
  ) {
    if (dropZone === "split-file" || dropZone === "split-terminal") {
      restoreConnectionTerminalFileSplit(
        payload.connectionId,
        dropZone === "split-file" ? "file" : "terminal",
        payload,
      );
    } else if (payload.kind === "file" && dropZone === "terminal") {
      const tab = remoteFileTabs.find(
        (item) => item.id === payload.id && item.connectionId === payload.connectionId,
      );
      if (tab) {
        setConnectionTerminalFileLayout(tab.connectionId, "unified");
        rememberUnifiedActiveTab(tab.connectionId, { kind: "file", id: tab.id });
        activateRemoteFileTab(tab);
      }
    } else if (payload.kind === "terminal" && dropZone === "file") {
      const tab = terminalTabs.find(
        (item) => item.id === payload.id && item.connectionId === payload.connectionId,
      );
      if (tab) {
        setConnectionTerminalFileLayout(tab.connectionId, "unified");
        rememberUnifiedActiveTab(tab.connectionId, { kind: "terminal", id: tab.id });
        activateTerminalTab(tab);
      }
    }

    finishWorkbenchTabMouseDrag();
  }

  function restoreConnectionTerminalFileSplit(
    connectionId: string,
    preferredActiveKind?: WorkbenchTabKind,
    payload?: WorkbenchTabDragPayload,
  ) {
    setConnectionTerminalFileLayout(connectionId, "split");

    if (preferredActiveKind === "file") {
      const fileTab =
        payload?.kind === "file"
          ? remoteFileTabs.find(
              (item) => item.id === payload.id && item.connectionId === connectionId,
            )
          : null;
      const fallbackFileTab =
        fileTab ||
        (activeRemoteFileTab?.connectionId === connectionId ? activeRemoteFileTab : null) ||
        remoteFileTabs.find((item) => item.connectionId === connectionId) ||
        null;
      if (fallbackFileTab) {
        activateRemoteFileTab(fallbackFileTab);
      }
      return;
    }

    if (preferredActiveKind === "terminal") {
      const terminalTab =
        payload?.kind === "terminal"
          ? terminalTabs.find(
              (item) => item.id === payload.id && item.connectionId === connectionId,
            )
          : null;
      const fallbackTerminalTab = terminalTab || preferredTabForConnection(connectionId);
      if (fallbackTerminalTab) {
        activateTerminalTab(fallbackTerminalTab);
      }
    }
  }

  function getWorkbenchTabDragLabel(payload: WorkbenchTabDragPayload) {
    if (payload.kind === "file") {
      const tab = remoteFileTabs.find(
        (item) => item.id === payload.id && item.connectionId === payload.connectionId,
      );
      return tab?.name || tr("workspace.file.fallback");
    }

    const tab = terminalTabs.find(
      (item) => item.id === payload.id && item.connectionId === payload.connectionId,
    );
    return tab?.title || tr("workspace.terminal.fallback");
  }

  function isTerminalSubtabActive(tab: TerminalTab) {
    return isActiveTerminalFileUnified
      ? activeUnifiedTab?.kind === "terminal" && activeUnifiedTab.id === tab.id
      : tab.id === activeTabId;
  }

  function isRemoteFileSubtabActive(tab: RemoteFileEditorTab) {
    return isActiveTerminalFileUnified
      ? activeUnifiedTab?.kind === "file" && activeUnifiedTab.id === tab.id
      : tab.id === activeRemoteFileTab?.id;
  }

  function isTerminalPanelActive(tabId: string, kind: TerminalPaneBinding["kind"] = "ssh") {
    if (terminalSplitActive) {
      return Boolean(
        focusedTerminalSplitBinding &&
          focusedTerminalSplitBinding.kind === kind &&
          focusedTerminalSplitBinding.tabId === tabId,
      );
    }
    if (isActiveTerminalFileUnified) {
      return showSessionWorkspace && activeUnifiedTab?.kind === "terminal" && activeUnifiedTab.id === tabId;
    }
    return kind === "local"
      ? showingLocalTerminal && tabId === activeLocalTerminalTabId
      : showSessionWorkspace && tabId === activeTabId;
  }

  function isTerminalPanelVisible(tabId: string, kind: TerminalPaneBinding["kind"]) {
    if (terminalSplitActive) {
      return terminalSplitPaneByBinding.has(terminalPaneBindingKey({ kind, tabId }));
    }
    return kind === "ssh"
      ? isTerminalPanelActive(tabId, kind)
      : showingLocalTerminal && tabId === activeLocalTerminalTabId;
  }

  function terminalSplitContentProps(binding: TerminalPaneBinding) {
    const pane = terminalSplitPaneByBinding.get(terminalPaneBindingKey(binding));
    return {
      className: pane ? "terminal-split-pane-content" : undefined,
      layoutRevision: terminalSplitLayoutRevision,
      onPaneFocus: pane ? () => focusTerminalSplitPane(pane.id) : undefined,
      style: pane ? terminalSplitContentStyle(pane.bounds) : undefined,
      visible: isTerminalPanelVisible(binding.tabId, binding.kind),
    };
  }

  function terminalSplitStatusProps(binding: TerminalPaneBinding) {
    const pane = terminalSplitPaneByBinding.get(terminalPaneBindingKey(binding));
    return {
      className: pane ? "terminal-split-pane-content" : undefined,
      onPaneFocus: pane ? () => focusTerminalSplitPane(pane.id) : undefined,
      style: pane ? terminalSplitContentStyle(pane.bounds) : undefined,
      visible: isTerminalPanelVisible(binding.tabId, binding.kind),
    };
  }

  function isRemoteFileEditorActive(tabId: string) {
    if (isActiveTerminalFileUnified) {
      return !showingHome && activeUnifiedTab?.kind === "file" && activeUnifiedTab.id === tabId;
    }
    return !showingHome && tabId === activeRemoteFileTab?.id;
  }

  function runTerminalInstanceAction(actionId: string, kind: "ssh" | "local", tabId: string) {
    void actionExecutor.run({
      actionId,
      source: "context-menu",
      target: { kind: "instance", instanceId: instanceItemId(kind, tabId) },
    });
  }

  function requestTerminalInstanceClose(kind: "ssh" | "local", tabIds: readonly string[]) {
    closeRequestController.request({
      instanceIds: tabIds.map((tabId) => instanceItemId(kind, tabId)),
      splitGroup: false,
    });
  }

  function requestRelativeTerminalClose(
    kind: "ssh" | "local",
    tabs: readonly { id: string }[],
    tabId: string,
    scope: "others" | "right",
  ) {
    const index = tabs.findIndex((tab) => tab.id === tabId);
    if (index < 0) return;
    requestTerminalInstanceClose(
      kind,
      (scope === "others" ? tabs.filter((_, itemIndex) => itemIndex !== index) : tabs.slice(index + 1))
        .map((tab) => tab.id),
    );
  }

  function renderTerminalSplitGroupSubtab() {
    const boundPaneCount = terminalSplitPanes.filter((pane) => pane.binding).length;
    // 分屏组只保留关闭分屏组动作；通用标签关闭/分屏动作不适用于组本身。
    const splitHostAnchor = { id: "terminal-split-group" };
    const splitGroupCtx: TerminalSubtabMenuContext<typeof splitHostAnchor> = {
      tabs: [splitHostAnchor],
      index: 0,
      activate: () => activateTerminalSplitTab(),
      close: () => requestCloseTerminalSplitGroup(),
      closeOthers: () => requestCloseTerminalSplitGroup(),
      closeRight: () => requestCloseTerminalSplitGroup(),
      closeAll: () => requestCloseTerminalSplitGroup(),
      split: () => {
        // 分屏组菜单隐藏再次分屏动作。
      },
      fourPane: () => {
        // 分屏组菜单隐藏四分屏动作。
      },
    };
    const actions = buildTerminalSubtabActions(splitGroupCtx, terminalSplitCanAddPane, {
      hideClose: true,
      hideCloseOthers: true,
      hideCloseRight: true,
      hideCloseAll: true,
      hideSplit: true,
      prepend: [
        {
          label: tr("workspace.split.closeGroup"),
          onSelect: () => requestCloseTerminalSplitGroup(),
        },
      ],
    });
    return (
      <TabContextMenu key="terminal-split-group" actions={actions}>
        <div
          className={`subtab-shell terminal-split-group-tab ${terminalSplitActive ? "active" : ""}`}
          data-workbench-tab-active={terminalSplitActive ? "true" : undefined}
          onAuxClick={createMiddleClickCloseHandler(requestCloseTerminalSplitGroup)}
        >
          <button
            className="subtab terminal-split-group-subtab"
            type="button"
            aria-label={tr("workspace.split.openGroup", { count: boundPaneCount })}
            onClick={() => activateTerminalSplitTab()}
          >
            <PanelsTopLeft className="ui-icon" aria-hidden="true" />
            <span>{tr("workspace.split.label")}</span>
            <span className="terminal-split-group-count" aria-hidden="true">
              {boundPaneCount.toString()}
            </span>
          </button>
          <button
            className="subtab-close"
            type="button"
            aria-label={tr("workspace.split.closeGroup")}
            onClick={requestCloseTerminalSplitGroup}
          >
            <X className="ui-icon" aria-hidden="true" />
          </button>
        </div>
      </TabContextMenu>
    );
  }

  async function saveTemporaryQuickConnectTab(tab: TerminalTab) {
    const ref = tab.temporaryContextRef; if (!ref) return;
    const profile = await saveTemporaryQuickConnectProfile(ref, connectionById.get(tab.connectionId)?.name); await reload(); const rebound = rebindTemporaryTerminalTab(tab, profile);
    const next = terminalTabsRef.current.map((item) => item.id === tab.id ? rebound : item); terminalTabsRef.current = next; setTerminalTabs(next);
    setRemoteFileTabs((items) => rebindConnectionItems(items, ref, profile.id)); rebindRemoteFileTransferConnection(ref, profile.id); setTemporaryConnections((items) => items.filter((item) => item.id !== ref)); activateTerminalTab(rebound);
  }
  function renderSshTerminalSubtab(tab: TerminalTab, index: number) {
    const sshMenuCtx: TerminalSubtabMenuContext<TerminalTab> = {
      tabs: activeConnectionTabs,
      index,
      activate: activateTerminalTab,
      close: (t) => runTerminalInstanceAction("terminal.closeTab", "ssh", t.id),
      closeOthers: (t) => requestRelativeTerminalClose("ssh", activeConnectionTabs, t.id, "others"),
      closeRight: (t) => requestRelativeTerminalClose("ssh", activeConnectionTabs, t.id, "right"),
      closeAll: () => requestTerminalInstanceClose("ssh", activeConnectionTabs.map((item) => item.id)),
      split: (t, direction) => runTerminalInstanceAction(
        direction === "row" ? "terminal.splitRight" : "terminal.splitDown", "ssh", t.id,
      ),
      fourPane: (t) => runTerminalInstanceAction("terminal.splitFour", "ssh", t.id),
      closeHint: closeShortcutBinding,
      restoreSplit: isConnectionTerminalFileUnified(tab.connectionId)
        ? (t) =>
            restoreConnectionTerminalFileSplit(tab.connectionId, "terminal", {
              connectionId: tab.connectionId,
              id: t.id,
              kind: "terminal",
            })
        : undefined,
    };
    const actions = buildTerminalSubtabActions(sshMenuCtx, terminalSplitCanAddPane, { prepend: tab.temporaryContextRef === tab.connectionId ? [{ label: t("quickConnect.saveSession"), onSelect: () => void saveTemporaryQuickConnectTab(tab) }] : undefined });
    return (
      <TabContextMenu key={tab.id} actions={actions}>
        <div
          className={`subtab-shell ${isTerminalSubtabActive(tab) ? "active" : ""}`}
          data-workbench-tab-active={isTerminalSubtabActive(tab) ? "true" : undefined}
          onAuxClick={createMiddleClickCloseHandler(() => runTerminalInstanceAction("terminal.closeTab", "ssh", tab.id))}
        >
          <button
            className="subtab workbench-draggable-tab"
            type="button"
            onClick={(event) => handleTerminalSubtabClick(event, tab)}
            onMouseDown={(event) =>
              handleWorkbenchTabMouseDown(event, {
                connectionId: tab.connectionId,
                id: tab.id,
                kind: "terminal",
              })
            }
          >
            <span>{tab.title}</span>
          </button>
          <button
            className="subtab-close"
            type="button"
            aria-label={tr("workspace.closeNamed", { name: tab.title })}
            onClick={() => runTerminalInstanceAction("terminal.closeTab", "ssh", tab.id)}
          >
            <X className="ui-icon" aria-hidden="true" />
          </button>
        </div>
      </TabContextMenu>
    );
  }

  function renderSshTerminalSubtabs() {
    const visibleTabs = terminalSplitExists
      ? activeConnectionTabs.filter(
          (tab) =>
            !terminalSplitMemberKeys.has(
              terminalPaneBindingKey({ kind: "ssh", tabId: tab.id }),
            ),
        )
      : activeConnectionTabs;
    const items = visibleTabs.map((tab) =>
      renderSshTerminalSubtab(tab, activeConnectionTabs.findIndex((item) => item.id === tab.id)),
    );
    const splitHostTab =
      terminalSplitHost?.kind === "ssh"
        ? activeConnectionTabs.find((tab) => tab.id === terminalSplitHost.tabId) || null
        : null;
    if (terminalSplitExists && splitHostTab) {
      const index = splitGroupInsertionIndex(
        activeConnectionTabs,
        "ssh",
        terminalSplitHost,
        terminalSplitMemberKeys,
      );
      items.splice(Math.min(index, items.length), 0, renderTerminalSplitGroupSubtab());
    }
    return items;
  }

  function renderLocalTerminalSubtab(tab: LocalTerminalTab, index: number) {
    const localMenuCtx: TerminalSubtabMenuContext<LocalTerminalTab> = {
      tabs: localTerminalTabs,
      index,
      activate: activateLocalTerminalTab,
      close: (t) => runTerminalInstanceAction("terminal.closeTab", "local", t.id),
      closeOthers: (t) => requestRelativeTerminalClose("local", localTerminalTabs, t.id, "others"),
      closeRight: (t) => requestRelativeTerminalClose("local", localTerminalTabs, t.id, "right"),
      closeAll: () => requestTerminalInstanceClose("local", localTerminalTabs.map((item) => item.id)),
      split: (t, direction) => runTerminalInstanceAction(
        direction === "row" ? "terminal.splitRight" : "terminal.splitDown", "local", t.id,
      ),
      fourPane: (t) => runTerminalInstanceAction("terminal.splitFour", "local", t.id),
      closeHint: closeShortcutBinding,
    };
    const actions = buildTerminalSubtabActions(localMenuCtx, terminalSplitCanAddPane);
    return (
      <TabContextMenu key={tab.id} actions={actions}>
        <div
          className={`subtab-shell ${!terminalSplitActive && tab.id === activeLocalTerminalTabId ? "active" : ""}`}
          data-workbench-tab-active={
            !terminalSplitActive && tab.id === activeLocalTerminalTabId ? "true" : undefined
          }
          onAuxClick={createMiddleClickCloseHandler(() => runTerminalInstanceAction("terminal.closeTab", "local", tab.id))}
        >
          <button
            className="subtab local-terminal-subtab"
            type="button"
            title={`${tab.title} · ${tab.status}`}
            onClick={() => activateLocalTerminalTab(tab)}
          >
            <LocalTerminalIcon className="ui-icon" kind={tab.profileKind} title={tab.title} />
            <span>{tab.title}</span>
          </button>
          <button
            className="subtab-close"
            type="button"
            aria-label={tr("workspace.closeNamed", { name: tab.title })}
            onClick={() => runTerminalInstanceAction("terminal.closeTab", "local", tab.id)}
          >
            <X className="ui-icon" aria-hidden="true" />
          </button>
        </div>
      </TabContextMenu>
    );
  }

  function renderLocalTerminalSubtabs() {
    const visibleTabs = terminalSplitExists
      ? localTerminalTabs.filter(
          (tab) =>
            !terminalSplitMemberKeys.has(
              terminalPaneBindingKey({ kind: "local", tabId: tab.id }),
            ),
        )
      : localTerminalTabs;
    const items = visibleTabs.map((tab) =>
      renderLocalTerminalSubtab(tab, localTerminalTabs.findIndex((item) => item.id === tab.id)),
    );
    if (terminalSplitExists && terminalSplitHost?.kind === "local") {
      const index = splitGroupInsertionIndex(
        localTerminalTabs,
        "local",
        terminalSplitHost,
        terminalSplitMemberKeys,
      );
      items.splice(Math.min(index, items.length), 0, renderTerminalSplitGroupSubtab());
    }
    return items;
  }

  function renderWorkbenchTabScrollControls(
    tabScroll: WorkbenchTabScrollController,
    label: string,
  ) {
    if (!tabScroll.hasOverflow) {
      return null;
    }

    return (
      <div className="workbench-tab-scroll-controls" aria-label={tr("workspace.tabs.scrollControls", { label })}>
        <Tooltip label={tr("workspace.tabs.scrollLeft")}>
          <button
            className="workbench-tab-scroll-button"
            type="button"
            aria-label={tr("workspace.tabs.scrollLeftAria", { label })}
            disabled={!tabScroll.canScrollLeft}
            onClick={tabScroll.scrollLeft}
          >
            <ChevronLeft className="ui-icon" aria-hidden="true" />
          </button>
        </Tooltip>
        <Tooltip label={tr("workspace.tabs.scrollRight")}>
          <button
            className="workbench-tab-scroll-button"
            type="button"
            aria-label={tr("workspace.tabs.scrollRightAria", { label })}
            disabled={!tabScroll.canScrollRight}
            onClick={tabScroll.scrollRight}
          >
            <ChevronRight className="ui-icon" aria-hidden="true" />
          </button>
        </Tooltip>
      </div>
    );
  }

  function renderRemoteFileSubtab(tab: RemoteFileEditorTab, index: number) {
    const savedTabs = activeRemoteFileTabs.filter(isClosableSavedRemoteFileTab);
    const active = isRemoteFileSubtabActive(tab);
    return (
      <TabContextMenu
        key={tab.id}
        actions={[
          {
            hint: "Ctrl+F4",
            label: tr("workspace.tabs.close"),
            onSelect: () => closeRemoteFileTab(tab.id),
          },
          {
            disabled: activeRemoteFileTabs.length <= 1,
            label: tr("workspace.tabs.closeOthers"),
            onSelect: () => closeOtherRemoteFileTabs(tab.id),
          },
          {
            disabled: index >= activeRemoteFileTabs.length - 1,
            label: tr("workspace.tabs.closeRight"),
            onSelect: () => closeRemoteFileTabsToRight(tab.id),
          },
          {
            disabled: savedTabs.length === 0,
            hint: "Ctrl+K U",
            label: tr("workspace.tabs.closeSaved"),
            onSelect: () => closeSavedRemoteFileTabsForConnection(tab.connectionId),
          },
          {
            disabled: activeRemoteFileTabs.length === 0,
            hint: "Ctrl+K W",
            label: tr("workspace.tabs.closeAll"),
            onSelect: () => closeAllRemoteFileTabsForConnection(tab.connectionId),
          },
          {
            hint: "Shift+Alt+C",
            label: tr("workspace.tabs.copyPath"),
            onSelect: () => copyRemotePath(tab.path),
            separatorBefore: true,
          },
          ...(isConnectionTerminalFileUnified(tab.connectionId)
            ? [
                {
                  label: tr("workspace.tabs.restoreSplit"),
                  onSelect: () =>
                    restoreConnectionTerminalFileSplit(tab.connectionId, "file", {
                      connectionId: tab.connectionId,
                      id: tab.id,
                      kind: "file",
                    }),
                },
              ]
            : []),
        ]}
      >
        <div
          className={`subtab-shell file-tab ${active ? "active" : ""}`}
          data-workbench-tab-active={active ? "true" : undefined}
          onAuxClick={createMiddleClickCloseHandler(() => closeRemoteFileTab(tab.id))}
        >
          <button
            className="subtab workbench-draggable-tab"
            type="button"
            title={tab.path}
            onClick={(event) => handleRemoteFileSubtabClick(event, tab)}
            onMouseDown={(event) =>
              handleWorkbenchTabMouseDown(event, {
                connectionId: tab.connectionId,
                id: tab.id,
                kind: "file",
              })
            }
          >
            <RemoteFileIcon className="file-tab-icon" entry={{ name: tab.name, type: "file" }} />
            <span className="file-tab-name">{tab.name}</span>
            {tab.dirty ? <span className="dirty-dot" aria-label={tr("workspace.tabs.modified")} /> : null}
          </button>
          <button
            className="subtab-close"
            type="button"
            aria-label={tr("workspace.closeNamed", { name: tab.name })}
            onClick={() => closeRemoteFileTab(tab.id)}
          >
            <X className="ui-icon" aria-hidden="true" />
          </button>
        </div>
      </TabContextMenu>
    );
  }

  function toggleTerminalSearch(tabId: string | null | undefined) {
    if (!tabId) {
      return;
    }
    setTerminalSearchByTabId((states) => {
      const current = states[tabId] || { caseSensitive: false, open: false, query: "" };
      return {
        ...states,
        [tabId]: {
          ...current,
          open: !current.open,
        },
      };
    });
  }

  function requestTerminalSearchNavigation(
    direction: TerminalSearchNavigationRequest["direction"],
    tabId: string,
  ) {
    setTerminalSearchByTabId((states) => {
      const current = states[tabId] || { caseSensitive: false, open: true, query: "" };
      return { ...states, [tabId]: { ...current, open: true } };
    });
    setTerminalSearchNavigationRequest({ direction, id: Date.now(), tabId });
  }

  function closeTerminalSearch(tabId: string) {
    setTerminalSearchByTabId((states) => {
      const current = states[tabId];
      if (!current?.open) {
        return states;
      }
      return {
        ...states,
        [tabId]: {
          ...current,
          open: false,
        },
      };
    });
  }

  function updateTerminalSearchQuery(tabId: string, query: string) {
    setTerminalSearchByTabId((states) => {
      const current = states[tabId] || { caseSensitive: false, open: true, query: "" };
      return {
        ...states,
        [tabId]: {
          ...current,
          open: true,
          query,
        },
      };
    });
  }

  function toggleTerminalSearchCaseSensitive(tabId: string) {
    setTerminalSearchByTabId((states) => {
      const current = states[tabId] || { caseSensitive: false, open: true, query: "" };
      return {
        ...states,
        [tabId]: {
          ...current,
          caseSensitive: !current.caseSensitive,
          open: true,
        },
      };
    });
  }

  function handleCommandSenderInputChange(value: string) {
    setCommandSenderInput(value);
    setSelectedCommandSnippetId(null);
    setSelectedCommandHistoryId(null);
  }

  function prepareCommandSenderTargets() {
    setMultiExecMode("send");
    void loadCommandLibrary();
    return selectedCommandTargets;
  }

  function openCommandSenderAndPrepareTargets() {
    setCommandSenderOpen(true);
    return prepareCommandSenderTargets();
  }

  function sendTerminalSelectionToAi(tabId: string, selectedText: string) {
    const content = selectedText.trim();
    if (!content) {
      return;
    }
    const sshTab = terminalTabsRef.current.find((tab) => tab.id === tabId);
    const localTab = localTerminalTabsRef.current.find((tab) => tab.id === tabId);
    const sourceConnection = sshTab ? connectionById.get(sshTab.connectionId) || null : null;
    const source = sourceConnection?.name || localTab?.title || sshTab?.title || tr("workspace.ai.selectionSource");
    const directory = terminalDirectories[tabId];
    setAiInitialContexts([
      buildAiContextBlock({
        kind: "terminal_selection",
        title: tr("workspace.ai.selectionTitle"),
        source: directory ? `${source} · ${directory}` : source,
        content,
      }),
    ]);
    setAiContextRequestKey((key) => key + 1);
    setAiAssistantPanelLoaded(true);
    setRightPaneCollapsed(false);
    setRightTool("ai");
  }

  function insertAiCommandToSender(command: string) {
    setCommandSenderInput(command);
    setSelectedCommandSnippetId(null);
    setSelectedCommandHistoryId(null);
    openCommandSenderAndPrepareTargets();
  }

  function saveAiCommandAsSnippet(command: string) {
    setCommandSenderInput(command);
    setSelectedCommandSnippetId(null);
    setSelectedCommandHistoryId(null);
    setCommandSnippetDraft(buildCommandSnippetDraft(command));
    setCommandSnippetFormError(null);
    setCommandSnippetDialogOpen(true);
  }

  async function sendAiCommandToTerminal(command: string) {
    const target = resolveActiveAiCommandTarget();
    if (!target) {
      setCommandSenderLastSentLabel(tr("workspace.command.noWritable"));
      throw new Error(tr("workspace.command.noWritableError"));
    }
    setSelectedCommandSnippetId(null);
    setSelectedCommandHistoryId(null);
    await sendCommandTextToTargets(command, true, null, [target], {
      clearInput: false,
      setSendMode: false,
    });
  }

  function resolveActiveAiCommandTarget(): CommandSenderTarget | null {
    if (activeWorkspaceMode === "local") {
      if (!activeLocalTerminalTab?.sessionId) {
        return null;
      }
      const profile = localTerminalProfiles.find((item) => item.id === activeLocalTerminalTab.profileId);
      return {
        deliveryStatus: "idle",
        description: profile?.name || activeLocalTerminalTab.title,
        historyScope: {
          scope_kind: "local_profile",
          scope_id: activeLocalTerminalTab.profileId,
        },
        key: terminalPaneBindingKey({ kind: "local", tabId: activeLocalTerminalTab.id }),
        kind: "local",
        label: tr("workspace.command.activeTerminal"),
        sessionId: activeLocalTerminalTab.sessionId,
        tabId: activeLocalTerminalTab.id,
        tabTitle: activeLocalTerminalTab.title,
      };
    }

    if (activeWorkspaceMode === "ssh") {
      if (!activeConnectedTerminalTab?.sessionId) {
        return null;
      }
      const connection = connectionById.get(activeConnectedTerminalTab.connectionId) || null;
      if (connection && !isSshConnection(connection)) {
        return null;
      }
      return {
        deliveryStatus: "idle",
        description: connection
          ? formatConnectionAddress(connection)
          : activeConnectedTerminalTab.title,
        historyScope: {
          scope_kind: "ssh_connection",
          scope_id: activeConnectedTerminalTab.connectionId,
        },
        key: terminalPaneBindingKey({ kind: "ssh", tabId: activeConnectedTerminalTab.id }),
        kind: "ssh",
        label: connection?.name || tr("workspace.command.activeTerminal"),
        sessionId: activeConnectedTerminalTab.sessionId,
        tabId: activeConnectedTerminalTab.id,
        tabTitle: activeConnectedTerminalTab.title,
      };
    }

    return null;
  }

  function insertCommandSnippet(snippet: CommandSnippet) {
    setCommandSenderInput(snippet.command);
    setSelectedCommandSnippetId(snippet.id);
    setSelectedCommandHistoryId(null);
    return openCommandSenderAndPrepareTargets();
  }

  function insertCommandHistoryEntry(entry: CommandHistoryEntry) {
    setCommandSenderInput(entry.command);
    setSelectedCommandHistoryId(entry.id);
    setSelectedCommandSnippetId(null);
    return openCommandSenderAndPrepareTargets();
  }

  async function runCommandSnippet(snippet: CommandSnippet) {
    const targets = prepareCommandSenderTargets();
    if (targets.length === 0) {
      setCommandSenderLastSentLabel(tr("workspace.command.chooseTargetSnippet"));
      return;
    }
    await sendCommandTextToTargets(snippet.command, true, snippet.id, targets, {
      clearInput: false,
    });
  }

  async function runCommandHistoryEntry(entry: CommandHistoryEntry) {
    const targets = prepareCommandSenderTargets();
    if (targets.length === 0) {
      setCommandSenderLastSentLabel(tr("workspace.command.chooseTargetHistory"));
      return;
    }
    await sendCommandTextToTargets(entry.command, true, null, targets, {
      clearInput: false,
    });
  }

  function saveHistoryAsSnippet(entry: CommandHistoryEntry) {
    setCommandSnippetDraft(buildCommandSnippetDraft(entry.command));
    setCommandSnippetFormError(null);
    setCommandSnippetDialogOpen(true);
  }

  async function copyCommandLibraryText(command: string, label: string) {
    try {
      await copyText(command);
      setCommandSenderLastSentLabel(tr("workspace.command.copied", { label }));
      setCommandLibraryError(null);
    } catch (error) {
      setCommandLibraryError(tr("workspace.command.copyFailed", { message: formatError(error) }));
    }
  }

  async function recordTerminalInputHistoryCommand(tabId: string, command: string) {
    if (!settings.command.recordTerminalInputHistory || !hasTauriRuntime()) {
      return;
    }

    const scope = commandHistoryScopeForTerminalTab(tabId);
    try {
      const historyEntry = await commandHistoryRecord({
        append_enter: true,
        command,
        scopes: scope ? [scope] : [],
        source: "terminal_input",
        target_count: 1,
      });
      await loadCommandLibrary();
      setSelectedCommandHistoryId(historyEntry.id);
      setCommandLibraryError(null);
      setCommandLibraryUnavailableReason(null);
    } catch (error) {
      handleCommandLibraryOperationError(error);
    }
  }

  function commandHistoryScopeForTerminalTab(tabId: string): CommandHistoryScope | null {
    const localTab = localTerminalTabs.find((tab) => tab.id === tabId);
    if (localTab) {
      return {
        scope_kind: "local_profile",
        scope_id: localTab.profileId,
      };
    }

    const sshTab = terminalTabs.find((tab) => tab.id === tabId);
    if (sshTab) {
      return {
        scope_kind: "ssh_connection",
        scope_id: sshTab.connectionId,
      };
    }

    return null;
  }

  function clearCommandSenderInput() {
    setCommandSenderInput("");
    setSelectedCommandSnippetId(null);
    setSelectedCommandHistoryId(null);
  }

  function openCommandSnippetDialog(snippet?: CommandSnippet | null, defaultGroup?: string) {
    setCommandSnippetDraft(
      snippet
        ? commandSnippetToDraft(snippet)
        : buildCommandSnippetDraft(commandSenderInput, defaultGroup),
    );
    setCommandSnippetFormError(null);
    setCommandSnippetDialogOpen(true);
  }

  function openCommandSnippetGroupCreateDialog(selectAfterSave = false) {
    setCommandSnippetGroupDialog({
      mode: "create",
      selectAfterSave,
      value: "",
    });
  }

  function openCommandSnippetGroupRenameDialog(groupName: string) {
    setCommandSnippetGroupDialog({
      mode: "rename",
      originalName: normalizeCommandSnippetGroupValue(groupName),
      value: normalizeCommandSnippetGroupValue(groupName),
    });
  }

  async function saveCommandSnippetGroupDialog(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!commandSnippetGroupDialog) {
      return;
    }

    const nextGroup = normalizeCommandSnippetGroupValue(commandSnippetGroupDialog.value);
    const originalGroup = normalizeCommandSnippetGroupValue(commandSnippetGroupDialog.originalName);
    if (!nextGroup) {
      setCommandSnippetGroupDialog((state) =>
        state ? { ...state, error: tr("workspace.command.groupNameRequired") } : state,
      );
      return;
    }
    if (
      commandSnippetGroups.some(
        (group) => group === nextGroup && group !== originalGroup,
      )
    ) {
      setCommandSnippetGroupDialog((state) =>
        state ? { ...state, error: tr("workspace.command.groupExists") } : state,
      );
      return;
    }

    if (commandSnippetGroupDialog.mode === "create") {
      setCommandSnippetLocalGroups((groups) => appendCommandSnippetLocalGroup(groups, nextGroup));
      if (commandSnippetGroupDialog.selectAfterSave) {
        setCommandSnippetDraft((draft) => ({ ...draft, group: nextGroup }));
      }
      setCommandSnippetGroupDialog(null);
      return;
    }

    if (!originalGroup || originalGroup === nextGroup) {
      setCommandSnippetGroupDialog(null);
      return;
    }

    const affectedSnippets = commandSnippets.filter(
      (snippet) => normalizeCommandSnippetGroupValue(snippet.group) === originalGroup,
    );
    try {
      const savedSnippets = await Promise.all(
        affectedSnippets.map((snippet) =>
          commandSnippetUpsert(commandSnippetToInput(snippet, nextGroup)),
        ),
      );
      const affectedIds = new Set(affectedSnippets.map((snippet) => snippet.id));
      setCommandSnippets((snippets) =>
        [
          ...snippets.filter((snippet) => !affectedIds.has(snippet.id)),
          ...savedSnippets,
        ].sort(compareCommandSnippets),
      );
      setCommandSnippetLocalGroups((groups) =>
        appendCommandSnippetLocalGroup(
          groups.filter((group) => group !== originalGroup),
          nextGroup,
        ),
      );
      setCommandSnippetDraft((draft) =>
        normalizeCommandSnippetGroupValue(draft.group) === originalGroup
          ? { ...draft, group: nextGroup }
          : draft,
      );
      setCommandSnippetGroupDialog(null);
      setCommandLibraryError(null);
      setCommandLibraryUnavailableReason(null);
    } catch (error) {
      if (isCommandLibraryCommandMissingError(error)) {
        const message = commandLibraryRestartMessage();
        setCommandLibraryUnavailableReason(message);
        setCommandSnippetGroupDialog((state) =>
          state ? { ...state, error: message } : state,
        );
      } else {
        setCommandSnippetGroupDialog((state) =>
          state ? { ...state, error: formatError(error) } : state,
        );
      }
    }
  }

  async function saveCommandSnippetDraft(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setCommandSnippetFormError(null);

    if (commandLibraryUnavailableReason) {
      setCommandSnippetFormError(commandLibraryUnavailableReason);
      return;
    }

    if (!hasTauriRuntime()) {
      setCommandSnippetFormError(tr("workspace.command.saveUnavailable"));
      return;
    }

    try {
      const saved = await commandSnippetUpsert({
        command: commandSnippetDraft.command,
        description: commandSnippetDraft.description || null,
        favorite: commandSnippetDraft.favorite,
        group: normalizeCommandSnippetGroupValue(commandSnippetDraft.group) || null,
        id: commandSnippetDraft.id,
        tags: parseCommandSnippetTags(commandSnippetDraft.tagsText),
        title: commandSnippetDraft.title,
      });
      setCommandSnippets((snippets) => upsertCommandSnippet(snippets, saved));
      setCommandSenderInput(saved.command);
      setSelectedCommandSnippetId(saved.id);
      setSelectedCommandHistoryId(null);
      setCommandSnippetDraft(commandSnippetToDraft(saved));
      setCommandLibraryError(null);
      setCommandLibraryUnavailableReason(null);
      setCommandSnippetDialogOpen(false);
    } catch (error) {
      if (isCommandLibraryCommandMissingError(error)) {
        const message = commandLibraryRestartMessage();
        setCommandLibraryUnavailableReason(message);
        setCommandSnippetFormError(message);
      } else {
        setCommandSnippetFormError(formatError(error));
      }
    }
  }

  async function confirmDeleteCommandSnippetGroup() {
    const groupName = normalizeCommandSnippetGroupValue(pendingCommandSnippetGroupDelete);
    if (!groupName) {
      return;
    }

    const snippetsInGroup = commandSnippets.filter(
      (snippet) => normalizeCommandSnippetGroupValue(snippet.group) === groupName,
    );

    try {
      await Promise.all(
        snippetsInGroup.map((snippet) =>
          commandSnippetDelete(snippet.id),
        ),
      );
      const deletedIds = new Set(snippetsInGroup.map((snippet) => snippet.id));
      setCommandSnippets((snippets) =>
        snippets.filter((snippet) => !deletedIds.has(snippet.id)),
      );
      setCommandSnippetLocalGroups((groups) => groups.filter((group) => group !== groupName));
      if (selectedCommandSnippetId && deletedIds.has(selectedCommandSnippetId)) {
        setSelectedCommandSnippetId(null);
      }
      if (
        commandSnippetDraft.id &&
        deletedIds.has(commandSnippetDraft.id)
      ) {
        setCommandSnippetDraft(buildCommandSnippetDraft(commandSenderInput));
      } else if (normalizeCommandSnippetGroupValue(commandSnippetDraft.group) === groupName) {
        setCommandSnippetDraft((draft) => ({ ...draft, group: commandSnippetRootGroup }));
      }
      setPendingCommandSnippetGroupDelete(null);
      setCommandLibraryError(null);
      setCommandLibraryUnavailableReason(null);
    } catch (error) {
      handleCommandLibraryOperationError(error);
    }
  }

  async function confirmDeleteCommandSnippet() {
    if (!pendingCommandSnippetDelete) {
      return;
    }

    try {
      await commandSnippetDelete(pendingCommandSnippetDelete.id);
      setCommandSnippets((snippets) =>
        snippets.filter((snippet) => snippet.id !== pendingCommandSnippetDelete.id),
      );
      if (selectedCommandSnippetId === pendingCommandSnippetDelete.id) {
        setSelectedCommandSnippetId(null);
      }
      if (commandSnippetDraft.id === pendingCommandSnippetDelete.id) {
        setCommandSnippetDraft(buildCommandSnippetDraft(commandSenderInput));
      }
      setPendingCommandSnippetDelete(null);
      setCommandLibraryError(null);
      setCommandLibraryUnavailableReason(null);
    } catch (error) {
      handleCommandLibraryOperationError(error);
    }
  }

  async function confirmDeleteCommandHistory() {
    if (!pendingCommandHistoryDelete) {
      return;
    }

    try {
      await commandHistoryDelete(pendingCommandHistoryDelete.id);
      setCommandHistoryEntries((entries) =>
        entries.filter((entry) => entry.id !== pendingCommandHistoryDelete.id),
      );
      if (selectedCommandHistoryId === pendingCommandHistoryDelete.id) {
        setSelectedCommandHistoryId(null);
      }
      setPendingCommandHistoryDelete(null);
      setCommandLibraryError(null);
      setCommandLibraryUnavailableReason(null);
    } catch (error) {
      handleCommandLibraryOperationError(error);
    }
  }

  async function confirmClearCommandHistory() {
    try {
      await commandHistoryClear();
      setCommandHistoryEntries([]);
      setSelectedCommandHistoryId(null);
      setCommandLibraryError(null);
      setCommandLibraryUnavailableReason(null);
    } catch (error) {
      handleCommandLibraryOperationError(error);
    }
  }

  function handleCommandLibraryOperationError(error: unknown) {
    if (isCommandLibraryCommandMissingError(error)) {
      setCommandLibraryUnavailableReason(commandLibraryRestartMessage());
      setCommandLibraryError(null);
      return;
    }

    setCommandLibraryError(formatError(error));
  }

  function closeCommandSender() {
    setCommandSenderOpen(false);
    if (multiExecMode === "send") {
      setMultiExecMode("off");
    }
  }

  function openCommandSender() {
    if (commandSenderOpen) {
      closeCommandSender();
      return;
    }
    setCommandSenderOpen(true);
    prepareCommandSenderTargets();
  }

  function toggleCommandSenderAllTargets() {
    setMultiExecTargets(
      commandSenderAllSelected
        ? new Set()
        : new Set(commandSenderTargets.map((target) => target.key)),
    );
  }

  function toggleCommandSenderTarget(target: CommandSenderTarget) {
    setMultiExecTargets((keys) => {
      const next = new Set(keys);
      if (next.has(target.key)) next.delete(target.key);
      else next.add(target.key);
      return next;
    });
  }


  function activateCommandSenderTarget(target: CommandSenderTarget) {
    if (target.kind === "local") {
      const tab = localTerminalTabs.find((item) => item.id === target.tabId);
      if (tab) {
        activateLocalTerminalTab(tab);
      }
      return;
    }

    const tab = terminalTabs.find((item) => item.id === target.tabId);
    if (tab) {
      activateTerminalTab(tab);
    }
  }

  function resolveCurrentMultiExecTarget(key: string) {
    return (
      buildMultiExecTargets({
        localTabs: localTerminalTabsRef.current,
        sshTabs: terminalTabsRef.current,
      }).find((target) => target.key === key) || null
    );
  }

  async function sendCommandTextToTargets(
    command: string,
    appendEnter: boolean,
    snippetId: string | null,
    targetsOverride?: CommandSenderTarget[],
    options: { clearInput?: boolean; setSendMode?: boolean } = {},
  ) {
    const historyCommand = command.trim();
    const targets = targetsOverride ?? selectedCommandTargets;
    if (!historyCommand || targets.length === 0) {
      return;
    }

    if (options.setSendMode ?? true) {
      setMultiExecMode("send");
    }
    const payload = appendEnter ? `${command}\r` : command;
    const targetByKey = new Map(targets.map((target) => [target.key, target]));

    setCommandSenderDeliveryByKey((deliveryByKey) => {
      const nextDeliveryByKey = { ...deliveryByKey };
      targets.forEach((target) => {
        nextDeliveryByKey[target.key] = { status: "idle" };
      });
      return nextDeliveryByKey;
    });

    const deliveries = await writeMultiExecCommand({
      data: payload,
      resolveTarget: resolveCurrentMultiExecTarget,
      targetKeys: targets.map((target) => target.key),
      write: async (sessionId, data) => {
        if (!hasTauriRuntime()) {
          throw new Error(tr("workspace.command.writeUnavailable"));
        }
        await terminalWrite(sessionId, data);
      },
    });

    setCommandSenderDeliveryByKey((deliveryByKey) => {
      const nextDeliveryByKey = { ...deliveryByKey };
      deliveries.forEach((delivery) => {
        nextDeliveryByKey[delivery.key] =
          delivery.status === "failed"
            ? { message: formatError(delivery.error), status: "failed" }
            : delivery.status === "disconnected"
              ? { message: tr("workspace.command.targetDisconnected"), status: "disconnected" }
              : { status: "written" };
      });
      return nextDeliveryByKey;
    });

    const successfulTargets = deliveries.flatMap((delivery) => {
      if (delivery.status !== "written") return [];
      const target = targetByKey.get(delivery.key);
      return target ? [target] : [];
    });
    const successCount = successfulTargets.length;
    const failedCount = deliveries.filter((delivery) => delivery.status === "failed").length;
    const disconnectedKeys = new Set(
      deliveries
        .filter((delivery) => delivery.status === "disconnected")
        .map((delivery) => delivery.key),
    );
    const disconnectedCount = disconnectedKeys.size;

    if (disconnectedCount > 0) {
      setMultiExecTargets(
        (current) => new Set(Array.from(current).filter((key) => !disconnectedKeys.has(key))),
      );
    }

    setCommandSenderLastSentLabel(
      failedCount > 0 || disconnectedCount > 0
        ? tr("workspace.command.sendSummary", { success: successCount, failed: failedCount, disconnected: disconnectedCount })
        : tr("workspace.command.sendSuccess", { count: successCount }),
    );
    if (options.clearInput ?? true) {
      clearCommandSenderInput();
    }

    if (successCount > 0 && historyCommand && hasTauriRuntime()) {
      try {
        const historyEntry = await commandHistoryRecord({
          append_enter: appendEnter,
          command: historyCommand,
          scopes: uniqueCommandHistoryScopes(
            successfulTargets
              .map((target) => target.historyScope)
              .filter((scope): scope is CommandHistoryScope => Boolean(scope)),
          ),
          source: "command_sender",
          target_count: successCount,
        });
        await loadCommandLibrary();
        setSelectedCommandHistoryId(historyEntry.id);

        if (snippetId) {
          const snippet = await commandSnippetMarkUsed(snippetId);
          setCommandSnippets((snippets) => upsertCommandSnippet(snippets, snippet));
        }
        setCommandLibraryError(null);
        setCommandLibraryUnavailableReason(null);
      } catch (error) {
        if (isCommandLibraryCommandMissingError(error)) {
          setCommandLibraryUnavailableReason(commandLibraryRestartMessage());
        } else {
          setCommandLibraryError(formatError(error));
        }
      }
    }
  }

  async function sendCommandToTargets(appendEnter: boolean) {
    if (!commandSenderCanSend) {
      return;
    }

    await sendCommandTextToTargets(commandSenderInput, appendEnter, selectedCommandSnippetId);
  }

  function handleCommandSenderInputKeyDown(event: ReactKeyboardEvent<HTMLTextAreaElement>) {
    if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
      event.preventDefault();
      void sendCommandToTargets(true);
    }
  }

  function activateLocalTerminalTab(tab: LocalTerminalTab) {
    const pane = terminalSplitLayout
      ? findTerminalSplitPaneByBinding(terminalSplitLayout, { kind: "local", tabId: tab.id })
      : null;
    if (pane) {
      activateTerminalSplitTab(pane.id);
      return;
    }
    activateStandaloneLocalTerminalTab(tab);
  }

  function activateStandaloneLocalTerminalTab(tab: LocalTerminalTab) {
    setTerminalSplitTabActive(false);
    setSettingsSectionRequest(undefined);
    dispatchTabs({ type: "tabs/activateLocal", tabId: tab.id });
  }

  function resolveDefaultLocalTerminalProfile() {
    const defaultProfileId = settings.localTerminal.defaultProfileId;
    return (
      localTerminalProfilesRef.current.find((profile) => profile.id === defaultProfileId) ||
      localTerminalProfilesRef.current[0] ||
      null
    );
  }

  function buildLocalTerminalTab(
    tabs: LocalTerminalTab[],
    profile: LocalTerminalProfile,
  ): LocalTerminalTab {
    const sameProfileTabs = tabs.filter((tab) => tab.profileId === profile.id);
    const ordinal = nextOrdinal(sameProfileTabs.map((tab) => tab.ordinal));
    const now = Date.now();
    const nonce = `${now.toString()}-${Math.random().toString(36).slice(2, 8)}`;

    return {
      id: `local-terminal-${nonce}`,
      ordinal,
      profileId: profile.id,
      profileKind: profile.kind,
      requestId: `local-terminal-${nonce}`,
      source: "local",
      sessionId: undefined,
      status: "正在打开",
      title: localTerminalTitle(profile, displayOrdinal(ordinal)),
      warmupOutput: [],
    };
  }

  function closeLocalTerminalTabs(tabIds: string[]) {
    const closingIds = new Set(tabIds);
    tabIds.forEach(stopTerminalWarmupCapture);
    closeRuntimeTerminalSessions(
      localTerminalTabsRef.current.filter((tab) => closingIds.has(tab.id)),
    );
    const nextTabs = localTerminalTabsRef.current.filter((tab) => !closingIds.has(tab.id));
    localTerminalTabsRef.current = nextTabs;
    setLocalTerminalTabs(nextTabs);
    dispatchTabs({
      type: "tabs/closeLocalTerminals",
      closingIds: tabIds,
      snapshot: snapshotFromRefs({ localTerminalTabs: nextTabs.map((tab) => ({ id: tab.id })) }),
    });
  }

  function openLocalTerminalByProfile(
    profile: LocalTerminalProfile | null,
    activate = true,
  ) {
    if (!profile) {
      setLocalTerminalProfilesError(tr("workspace.local.noProfiles"));
      return null;
    }

    const tab = buildLocalTerminalTab(localTerminalTabsRef.current, profile);
    const nextTabs = [...localTerminalTabsRef.current, tab];
    localTerminalTabsRef.current = nextTabs;
    setLocalTerminalTabs(nextTabs);
    if (activate) {
      activateLocalTerminalTab(tab);
    }

    void openRuntimeLocalTerminalSession(tab, "local-preview", () =>
      localTerminalOpen({
        cols: 80,
        cwd: profile.cwd || undefined,
        profile: toLocalTerminalProfileInput(profile),
        request_id: tab.requestId,
        rows: 24,
      }),
    );
    return tab;
  }

  async function openRuntimeLocalTerminalSession(
    tab: LocalTerminalTab,
    previewPrefix: string,
    openSession: () => Promise<string>,
  ) {
    if (!hasTauriRuntime()) {
      await wait(120);
      setLocalTerminalTabs((tabs) => {
        const nextTabs = tabs.map((item) =>
          item.id === tab.id
            ? {
                ...item,
                error: null,
                sessionId: `${previewPrefix}-${Date.now().toString()}`,
                status: "预览",
              }
            : item,
        );
        localTerminalTabsRef.current = nextTabs;
        return nextTabs;
      });
      return;
    }

    try {
      const warmupOutput: number[] = [];
      let stopWarmupCapture: (() => void) | null = null;
      let handoffComplete = false;

      stopWarmupCapture = await listenTerminalOutput((event: TerminalOutputEvent) => {
        if (event.request_id !== tab.requestId) {
          return;
        }
        if (handoffComplete) {
          appendLocalTerminalWarmupOutput(tab.id, event.data);
          return;
        }
        warmupOutput.push(...event.data);
      });
      setTerminalWarmupCaptureStop(tab.id, () => {
        stopWarmupCapture?.();
        stopWarmupCapture = null;
      });

      const sessionId = await openSession();
      if (!localTerminalTabExists(tab.id)) {
        stopTerminalWarmupCapture(tab.id);
        await terminalClose(sessionId).catch(() => undefined);
        return;
      }
      handoffComplete = true;
      setLocalTerminalTabs((tabs) => {
        const nextTabs = tabs.map((item) =>
          item.id === tab.id
            ? {
                ...item,
                error: null,
                sessionId,
                status: "已连接",
                warmupOutput: [...warmupOutput],
              }
            : item,
        );
        localTerminalTabsRef.current = nextTabs;
        return nextTabs;
      });
      window.setTimeout(() => {
        stopTerminalWarmupCapture(tab.id);
      }, 3000);
    } catch (error) {
      stopTerminalWarmupCapture(tab.id);
      setLocalTerminalTabs((tabs) => {
        const nextTabs = tabs.map((item) =>
          item.id === tab.id
            ? {
                ...item,
                error: formatDetailedError(error),
                sessionId: undefined,
                status: "连接失败",
              }
            : item,
        );
        localTerminalTabsRef.current = nextTabs;
        return nextTabs;
      });
      throw error;
    }
  }

  function buildCharacterTerminalTab(
    tabs: LocalTerminalTab[],
    source: "telnet" | "serial",
    title: string,
    profileId: string,
  ): LocalTerminalTab {
    const now = Date.now();
    const nonce = `${now.toString()}-${Math.random().toString(36).slice(2, 8)}`;
    const sameProfileTabs = tabs.filter((tab) => tab.profileId === profileId);
    const ordinal = nextOrdinal(sameProfileTabs.map((tab) => tab.ordinal));
    const displayNumber = displayOrdinal(ordinal);
    return {
      id: `${source}-terminal-${nonce}`,
      ordinal,
      profileId,
      profileKind: source,
      requestId: `${source}-terminal-${nonce}`,
      sessionId: undefined,
      source,
      status: "正在连接",
      title: displayNumber === null ? title : `${title} · ${displayNumber.toString()}`,
      warmupOutput: [],
    };
  }

  function openCharacterTerminalInConnection(
    connection: TelnetConnectionProfile | SerialConnectionProfile,
    activate = true,
  ) {
    const source = connection.protocol;
    const title = connection.name || formatConnectionAddress(connection);
    const tab = buildCharacterTerminalTab(
      localTerminalTabsRef.current,
      source,
      title,
      connection.id,
    );
    const nextTabs = [...localTerminalTabsRef.current, tab];
    localTerminalTabsRef.current = nextTabs;
    setLocalTerminalTabs(nextTabs);
    if (activate) {
      activateLocalTerminalTab(tab);
    }
    void runCharacterConnectionSession(tab, connection);
    return tab;
  }

  function openCharacterConnectionSession(
    connection: TelnetConnectionProfile | SerialConnectionProfile,
  ) {
    const existingTab = localTerminalTabsRef.current.find(
      (tab) => tab.profileId === connection.id,
    );
    if (existingTab) {
      activateLocalTerminalTab(existingTab);
      return;
    }

    openCharacterTerminalInConnection(connection);
  }

  async function runCharacterConnectionSession(
    tab: LocalTerminalTab,
    connection: TelnetConnectionProfile | SerialConnectionProfile,
  ) {
    try {
      if (connection.protocol === "telnet") {
        await openRuntimeLocalTerminalSession(tab, "telnet-preview", () =>
          telnetTerminalOpen({
            backspace_mode: connection.telnet?.backspace_mode || "del",
            enter_mode: connection.telnet?.enter_mode || "crlf",
            host: connection.host,
            port: connection.port || 23,
            request_id: tab.requestId,
          }),
        );
      } else {
        const serial = connection.serial;
        const portName = serial?.port_name || connection.host;
        await openRuntimeLocalTerminalSession(tab, "serial-preview", () =>
          serialTerminalOpen({
            backspace_mode: serial?.backspace_mode || "del",
            baud_rate: serial?.baud_rate || 9600,
            data_bits: serial?.data_bits || "eight",
            flow_control: serial?.flow_control || "none",
            parity: serial?.parity || "none",
            port_name: portName,
            request_id: tab.requestId,
            stop_bits: serial?.stop_bits || "one",
          }),
        );
      }
      void markConnected(connection.id);
    } catch {
      // openRuntimeLocalTerminalSession 已经把错误写入标签状态。
    }
  }

  function localTerminalTabExists(tabId: string) {
    return localTerminalTabsRef.current.some((tab) => tab.id === tabId);
  }

  function openSettingsSection(sectionId?: SettingsSectionId) {
    setSettingsSectionRequest(sectionId);
    setSettingsSectionRequestKey((current) => current + 1);
    if (LoadedSettingsView) {
      dispatchTabs({ type: "tabs/openSettings" });
      return;
    }
    void preloadSettingsViewComponent()
      .then((SettingsComponent) => {
        setLoadedSettingsView(() => SettingsComponent);
        dispatchTabs({ type: "tabs/openSettings" });
      })
      .catch(() => {
        dispatchTabs({ type: "tabs/openSettings" });
      });
  }

  function returnFromSettings() {
    dispatchTabs({ type: "tabs/closeSettings" });
    setSettingsSectionRequest(undefined);
  }

  function openLocalTerminalSettings() {
    openSettingsSection("localTerminal");
  }

  function selectConnection(connection: ConnectionProfile) {
    setSelectedConnectionId(connection.id);
  }

  function openConnectionSession(connection: ConnectionProfile) {
    if (isRdpConnection(connection)) {
      openRdpConnectionSession(connection);
      return;
    }
    if (isVncConnection(connection)) {
      openVncConnectionSession(connection);
      return;
    }
    if (isTelnetConnection(connection) || isSerialConnection(connection)) {
      openCharacterConnectionSession(connection);
      return;
    }

    const pendingTab = pendingTabForConnection(connection.id);
    if (pendingTab) {
      activateTerminalTab(pendingTab);
      return;
    }

    startConnectionStep(connection, "terminal");
  }

  function openNewConnectionSession(connection: ConnectionProfile) {
    return openNewConnectionSessionWithActivation(connection, true);
  }

  function openNewConnectionSessionWithActivation(
    connection: ConnectionProfile,
    activate: boolean,
  ): BatchWorkspaceHandle | null {
    if (isRdpConnection(connection)) return { kind: "rdp", id: startRdpSession(connection, activate).id };
    if (isVncConnection(connection)) return { kind: "vnc", id: startVncSession(connection, activate).id };
    if (isTelnetConnection(connection) || isSerialConnection(connection)) {
      return { kind: "character", id: openCharacterTerminalInConnection(connection, activate).id };
    }
    const tab = startConnectionStep(connection, "terminal", activate);
    return tab ? { kind: "ssh", id: tab.id } : null;
  }

  function openTerminal(connection: ConnectionProfile) {
    if (isRdpConnection(connection)) {
      openRdpConnectionSession(connection);
      return;
    }
    if (isVncConnection(connection)) {
      openVncConnectionSession(connection);
      return;
    }
    if (isTelnetConnection(connection) || isSerialConnection(connection)) {
      openCharacterConnectionSession(connection);
      return;
    }

    startConnectionStep(connection, "terminal");
  }

  function openRdpConnectionSession(connection: ConnectionProfile) {
    const existingSession = preferredRdpSessionForConnection(connection.id);
    if (existingSession) {
      activateRdpSession(existingSession);
      revealNativeRdpHostSession(existingSession);
      return;
    }

    startRdpSession(connection);
  }

  function startRdpSession(connection: ConnectionProfile, activate = true) {
    const session = buildRdpSession(connection);
    setRdpSessions((sessions) => {
      const nextSessions = [...sessions, session];
      rdpSessionsRef.current = nextSessions;
      return nextSessions;
    });
    if (activate) activateRdpSession(session);
    void runRdpSession(session.id, connection);
    return session;
  }

  function revealNativeRdpHostSession(session: RdpSessionTab) {
    if (!hasTauriRuntime()) {
      return;
    }
    const backendSessionId = session.result?.session_id;
    if (!backendSessionId || session.result?.runner !== "mstsc_activex") {
      return;
    }
    void rdpRevealSession(backendSessionId).catch(() => undefined);
  }

  async function runRdpSession(sessionId: string, connection: ConnectionProfile) {
    updateRdpSession(sessionId, (session) => ({
      ...session,
      error: null,
      message: tr("workspace.rdp.launching"),
      preview: null,
      result: null,
      status: "launching",
    }));

    if (!hasTauriRuntime()) {
      await wait(160);
      if (!rdpSessionExists(sessionId)) {
        return;
      }
      updateRdpSession(sessionId, (session) => ({
        ...session,
        message: tr("workspace.rdp.preview"),
        preview: previewRdpLaunchForBrowser(connection, desktopPlatform),
        status: "external",
      }));
      void markConnected(connection.id);
      return;
    }

    try {
      const result = await rdpLaunchConnection(connection.id);
      if (!rdpSessionExists(sessionId)) {
        if (result.session_id) {
          await rdpCloseSession(result.session_id).catch(() => undefined);
        }
        return;
      }
      const nativeActiveX = result.runner === "mstsc_activex" && !result.embedded;
      updateRdpSession(sessionId, (session) => ({
        ...session,
        error: null,
        message:
          result.fallback_reason ||
          (result.embedded
            ? tr("workspace.rdp.embeddedCreated")
            : nativeActiveX
              ? tr("workspace.rdp.nativeOpened")
            : tr("workspace.rdp.externalStarted")),
        result,
        status: result.embedded ? "embedded" : nativeActiveX ? "native" : "external",
      }));
      void markConnected(connection.id);
    } catch (error) {
      if (!rdpSessionExists(sessionId)) {
        return;
      }
      updateRdpSession(sessionId, (session) => ({
        ...session,
        error: formatDetailedError(error),
        message: null,
        status: "error",
      }));
    }
  }

  async function previewRdpSessionLaunch(sessionId: string) {
    const session = rdpSessionsRef.current.find((item) => item.id === sessionId);
    if (!session) {
      return;
    }
    const connection = connectionById.get(session.connectionId);
    if (!connection) {
      updateRdpSession(sessionId, (current) => ({
        ...current,
        message: tr("workspace.vnc.connectionDeleted"),
      }));
      return;
    }

    updateRdpSession(sessionId, (current) => ({
      ...current,
      message: tr("workspace.rdp.previewGenerating"),
    }));

    try {
      const preview = hasTauriRuntime()
        ? await rdpPreviewLaunch(connection.id)
        : previewRdpLaunchForBrowser(connection, desktopPlatform);
      updateRdpSession(sessionId, (current) => ({
        ...current,
        message: tr("workspace.rdp.previewReady"),
        preview,
      }));
    } catch (error) {
      updateRdpSession(sessionId, (current) => ({
        ...current,
        message: tr("workspace.rdp.previewFailed", { message: formatError(error) }),
      }));
    }
  }

  function retryRdpSession(sessionId: string) {
    const session = rdpSessionsRef.current.find((item) => item.id === sessionId);
    const connection = session ? connectionById.get(session.connectionId) : null;
    if (!session || !connection) {
      return;
    }
    activateRdpSession(session);
    void runRdpSession(session.id, connection);
  }

  function activateRdpSession(session: RdpSessionTab) {
    setSettingsSectionRequest(undefined);
    dispatchTabs({ type: "tabs/activateRdp", connectionId: session.connectionId, sessionId: session.id });
    setRightTool("tools");
  }

  function closeRdpSession(sessionId: string) {
    closeRdpSessions([sessionId]);
  }

  function removeRdpSessionsLocally(sessionIds: string[]) {
    if (sessionIds.length === 0) {
      return;
    }

    const closingIds = new Set(sessionIds);
    const nextSessions = rdpSessionsRef.current.filter((session) => !closingIds.has(session.id));
    rdpSessionsRef.current = nextSessions;
    setRdpSessions(nextSessions);
    dispatchTabs({
      type: "tabs/removeRdp",
      closingIds: sessionIds,
      snapshot: snapshotFromRefs({ rdpSessions: nextSessions.map(sessionRef) }),
    });
  }

  function closeRdpSessions(sessionIds: string[]) {
    if (sessionIds.length === 0) {
      return;
    }

    const closingIds = new Set(sessionIds);
    const closingSessions = rdpSessionsRef.current.filter((session) => closingIds.has(session.id));
    if (hasTauriRuntime()) {
      closingSessions.forEach((session) => {
        const backendSessionId = session.result?.session_id;
        if (backendSessionId) {
          void rdpCloseSession(backendSessionId).catch(() => undefined);
        }
      });
    }

    removeRdpSessionsLocally(sessionIds);
  }

  function closeOtherRdpSessions(sessionId: string) {
    const session = rdpSessions.find((item) => item.id === sessionId);
    if (!session) {
      return;
    }
    closeRdpSessions(
      rdpSessions
        .filter((item) => item.connectionId === session.connectionId && item.id !== sessionId)
        .map((item) => item.id),
    );
  }

  function closeRdpSessionsToRight(sessionId: string) {
    const session = rdpSessions.find((item) => item.id === sessionId);
    if (!session) {
      return;
    }
    const sameConnectionSessions = rdpSessions.filter((item) => item.connectionId === session.connectionId);
    const index = sameConnectionSessions.findIndex((item) => item.id === sessionId);
    if (index < 0) {
      return;
    }
    closeRdpSessions(sameConnectionSessions.slice(index + 1).map((item) => item.id));
  }

  function closeAllRdpSessionsForConnection(connectionId: string) {
    closeRdpSessions(rdpSessions.filter((session) => session.connectionId === connectionId).map((session) => session.id));
  }

  function preferredRdpSessionForConnection(connectionId: string) {
    const activeSession = activeRdpSessionId
      ? rdpSessionsRef.current.find(
          (session) => session.id === activeRdpSessionId && session.connectionId === connectionId,
        ) || null
      : null;
    return (
      activeSession ||
      rdpSessionsRef.current.find((session) => session.connectionId === connectionId) ||
      null
    );
  }

  function rdpSessionExists(sessionId: string) {
    return rdpSessionsRef.current.some((session) => session.id === sessionId);
  }

  function buildRdpSession(connection: ConnectionProfile): RdpSessionTab {
    const now = Date.now();
    const index =
      rdpSessionsRef.current.filter((session) => session.connectionId === connection.id).length + 1;
    return {
      connectionId: connection.id,
      createdAt: now,
      id: `rdp-${connection.id}-${now.toString()}`,
      message: null,
      preview: null,
      result: null,
      status: "launching",
      title: index === 1 ? "RDP" : `RDP ${index.toString()}`,
    };
  }

  function updateRdpSession(
    sessionId: string,
    updater: (session: RdpSessionTab) => RdpSessionTab,
  ) {
    setRdpSessions((sessions) => {
      const nextSessions = sessions.map((session) =>
        session.id === sessionId ? updater(session) : session,
      );
      rdpSessionsRef.current = nextSessions;
      return nextSessions;
    });
  }

  function openVncConnectionSession(connection: ConnectionProfile) {
    const existingSession = preferredVncSessionForConnection(connection.id);
    if (existingSession) {
      activateVncSession(existingSession);
      return;
    }

    startVncSession(connection);
  }

  function startVncSession(connection: ConnectionProfile, activate = true) {
    const session = buildVncSession(connection);
    setVncSessions((sessions) => {
      const nextSessions = [...sessions, session];
      vncSessionsRef.current = nextSessions;
      return nextSessions;
    });
    if (activate) activateVncSession(session);
    void runVncSession(session.id, connection);
    return session;
  }

  async function runVncSession(sessionId: string, connection: ConnectionProfile) {
    const renderMode = connection.vnc?.runner.render_mode || defaultVncConfig.runner.render_mode;
    const openInRunnerHost = renderMode === "windowed";
    updateVncSession(sessionId, (session) => ({
      ...session,
      error: null,
      message: openInRunnerHost
        ? tr("workspace.vnc.hostLaunching")
        : tr("workspace.vnc.embeddedLaunching"),
      preview: null,
      result: null,
      status: "launching",
      windowLabel: null,
    }));

    if (!hasTauriRuntime()) {
      await wait(160);
      if (!vncSessionExists(sessionId)) {
        return;
      }
      updateVncSession(sessionId, (session) => ({
        ...session,
        message: openInRunnerHost
          ? tr("workspace.vnc.previewHost")
          : tr("workspace.vnc.previewEmbedded"),
        preview: previewVncLaunchForBrowser(connection),
        status: openInRunnerHost ? "windowed" : "external",
      }));
      void markConnected(connection.id);
      return;
    }

    try {
      const result = await vncLaunchConnection(connection.id);
      if (!vncSessionExists(sessionId)) {
        if (result.session_id) {
          await vncCloseSession(result.session_id).catch(() => undefined);
        }
        return;
      }
      if (result.embedded && openInRunnerHost) {
        try {
          const windowLabel = await openVncRunnerHostWindow(sessionId, connection, result);
          if (!vncSessionExists(sessionId)) {
            await vncCloseSession(result.session_id).catch(() => undefined);
            void emitVncRunnerWindowCloseRequest(windowLabel, {
              window_label: windowLabel,
              workspace_session_id: sessionId,
            }).catch(() => undefined);
            return;
          }
          updateVncSession(sessionId, (session) => ({
            ...session,
            error: null,
            message: result.fallback_reason || tr("workspace.vnc.hostReady"),
            result,
            status: "windowed",
            windowLabel,
          }));
          void markConnected(connection.id);
          return;
        } catch (error) {
          await vncCloseSession(result.session_id).catch(() => undefined);
          updateVncSession(sessionId, (session) => ({
            ...session,
            error: tr("workspace.vnc.hostFailed", { message: formatDetailedError(error) }),
            message: null,
            status: "error",
          }));
          return;
        }
      }
      updateVncSession(sessionId, (session) => ({
        ...session,
        error: null,
        message:
          result.fallback_reason ||
          (result.embedded
            ? tr("workspace.vnc.bridgeReady")
            : tr("workspace.vnc.externalStarted")),
        result,
        status: result.embedded ? "embedded" : "external",
        windowLabel: null,
      }));
      void markConnected(connection.id);
    } catch (error) {
      if (!vncSessionExists(sessionId)) {
        return;
      }
      updateVncSession(sessionId, (session) => ({
        ...session,
        error: formatDetailedError(error),
        message: null,
        status: "error",
      }));
    }
  }

  async function openVncRunnerHostWindow(
    sessionId: string,
    connection: ConnectionProfile,
    result: VncLaunchResult,
  ) {
    const { WebviewWindow } = await import("@tauri-apps/api/webviewWindow");
    const windowLabel = VNC_RUNNER_HOST_WINDOW_LABEL;
    const payload: VncRunnerWindowPayload = {
      config: connection.vnc || defaultVncConfig,
      connection: connectionInfoFromVncProfile(connection) || {
        host: connection.host,
        name: connection.name,
        port: connection.port || 5900,
        username: connection.username,
      },
      result,
      window_label: windowLabel,
      workspace_session_id: sessionId,
    };
    pendingVncRunnerWindowPayloadsRef.current.set(sessionId, payload);

    let host = await WebviewWindow.getByLabel(windowLabel);
    if (!host) {
      vncRunnerWindowReadyRef.current = false;
      host = new WebviewWindow(windowLabel, {
        center: true,
        decorations: false,
        focus: true,
        height: 820,
        minHeight: 480,
        minWidth: 720,
        parent: "main",
        resizable: true,
        title: "NexaTerm VNC",
        url: vncRunnerWindowUrl(),
        visible: true,
        width: 1280,
      });
      await waitForWebviewWindowCreation(host);
    } else {
      vncRunnerWindowReadyRef.current = true;
      await host.unminimize().catch(() => undefined);
      await host.show().catch(() => undefined);
      await host.setFocus().catch(() => undefined);
    }

    if (vncRunnerWindowReadyRef.current) {
      await emitVncRunnerWindowPayload(windowLabel, payload);
      pendingVncRunnerWindowPayloadsRef.current.delete(sessionId);
    }

    return windowLabel;
  }

  async function previewVncSessionLaunch(sessionId: string) {
    const session = vncSessionsRef.current.find((item) => item.id === sessionId);
    if (!session) {
      return;
    }
    const connection = connectionById.get(session.connectionId);
    if (!connection) {
      updateVncSession(sessionId, (current) => ({
        ...current,
        message: tr("workspace.vnc.connectionDeleted"),
      }));
      return;
    }

    updateVncSession(sessionId, (current) => ({
      ...current,
      message: tr("workspace.vnc.previewGenerating"),
    }));

    try {
      const preview = hasTauriRuntime()
        ? await vncPreviewLaunch(connection.id)
        : previewVncLaunchForBrowser(connection);
      updateVncSession(sessionId, (current) => ({
        ...current,
        message: tr("workspace.vnc.previewReady"),
        preview,
      }));
    } catch (error) {
      updateVncSession(sessionId, (current) => ({
        ...current,
        message: tr("workspace.vnc.previewFailed", { message: formatError(error) }),
      }));
    }
  }

  function retryVncSession(sessionId: string) {
    const session = vncSessionsRef.current.find((item) => item.id === sessionId);
    const connection = session ? connectionById.get(session.connectionId) : null;
    if (!session || !connection) {
      return;
    }
    activateVncSession(session);
    void runVncSession(session.id, connection);
  }

  function activateVncSession(session: VncSessionTab) {
    setSettingsSectionRequest(undefined);
    dispatchTabs({ type: "tabs/activateVnc", connectionId: session.connectionId, sessionId: session.id });
    setRightTool("tools");
  }

  function closeVncSession(sessionId: string) {
    closeVncSessions([sessionId]);
  }

  function removeVncSessionsLocally(sessionIds: string[]) {
    if (sessionIds.length === 0) {
      return;
    }

    const closingIds = new Set(sessionIds);
    const nextSessions = vncSessionsRef.current.filter((session) => !closingIds.has(session.id));
    vncSessionsRef.current = nextSessions;
    setVncSessions(nextSessions);
    dispatchTabs({
      type: "tabs/removeVnc",
      closingIds: sessionIds,
      snapshot: snapshotFromRefs({ vncSessions: nextSessions.map(sessionRef) }),
    });
  }

  function closeVncSessions(
    sessionIds: string[],
    options: { notifyRunnerWindow?: boolean } = {},
  ) {
    if (sessionIds.length === 0) {
      return;
    }

    const notifyRunnerWindow = options.notifyRunnerWindow ?? true;
    const closingIds = new Set(sessionIds);
    const closingSessions = vncSessionsRef.current.filter((session) => closingIds.has(session.id));
    closingSessions.forEach((session) => {
      pendingVncRunnerWindowPayloadsRef.current.delete(session.id);
    });
    if (hasTauriRuntime()) {
      closingSessions.forEach((session) => {
        const backendSessionId = session.result?.session_id;
        if (backendSessionId) {
          void vncCloseSession(backendSessionId).catch(() => undefined);
        }
        if (notifyRunnerWindow && session.windowLabel) {
          void emitVncRunnerWindowCloseRequest(session.windowLabel, {
            window_label: session.windowLabel,
            workspace_session_id: session.id,
          }).catch(() => undefined);
        }
      });
    }

    removeVncSessionsLocally(sessionIds);
  }

  function closeOtherVncSessions(sessionId: string) {
    const session = vncSessions.find((item) => item.id === sessionId);
    if (!session) {
      return;
    }
    closeVncSessions(
      vncSessions
        .filter((item) => item.connectionId === session.connectionId && item.id !== sessionId)
        .map((item) => item.id),
    );
  }

  function closeVncSessionsToRight(sessionId: string) {
    const session = vncSessions.find((item) => item.id === sessionId);
    if (!session) {
      return;
    }
    const sameConnectionSessions = vncSessions.filter((item) => item.connectionId === session.connectionId);
    const index = sameConnectionSessions.findIndex((item) => item.id === sessionId);
    if (index < 0) {
      return;
    }
    closeVncSessions(sameConnectionSessions.slice(index + 1).map((item) => item.id));
  }

  function closeAllVncSessionsForConnection(connectionId: string) {
    closeVncSessions(vncSessions.filter((session) => session.connectionId === connectionId).map((session) => session.id));
  }

  function preferredVncSessionForConnection(connectionId: string) {
    const activeSession = activeVncSessionId
      ? vncSessionsRef.current.find(
          (session) => session.id === activeVncSessionId && session.connectionId === connectionId,
        ) || null
      : null;
    return (
      activeSession ||
      vncSessionsRef.current.find((session) => session.connectionId === connectionId) ||
      null
    );
  }

  function vncSessionExists(sessionId: string) {
    return vncSessionsRef.current.some((session) => session.id === sessionId);
  }

  function buildVncSession(connection: ConnectionProfile): VncSessionTab {
    const now = Date.now();
    const index =
      vncSessionsRef.current.filter((session) => session.connectionId === connection.id).length + 1;
    return {
      connectionId: connection.id,
      createdAt: now,
      id: `vnc-${connection.id}-${now.toString()}`,
      message: null,
      preview: null,
      result: null,
      status: "launching",
      title: index === 1 ? "VNC" : `VNC ${index.toString()}`,
    };
  }

  function updateVncSession(
    sessionId: string,
    updater: (session: VncSessionTab) => VncSessionTab,
  ) {
    setVncSessions((sessions) => {
      const nextSessions = sessions.map((session) =>
        session.id === sessionId ? updater(session) : session,
      );
      vncSessionsRef.current = nextSessions;
      return nextSessions;
    });
  }

  function closeTerminal(tabId: string) {
    closeTerminalTabs([tabId]);
  }

  function closeRuntimeTerminalSessions(tabs: Array<{ sessionId?: string }>) {
    const sessionIds = new Set(
      tabs.map((tab) => tab.sessionId).filter((sessionId): sessionId is string => Boolean(sessionId)),
    );
    sessionIds.forEach((sessionId) => {
      void terminalClose(sessionId).catch(() => undefined);
    });
  }

  function invalidateDockerExecConnection(connectionId: string) {
    if (!hasTauriRuntime()) {
      return;
    }
    void dockerExecInvalidateConnection(connectionId).catch(() => undefined);
  }

  function closeTerminalTabs(tabIds: string[]) {
    const closingIds = new Set(tabIds);
    const closingTabs = terminalTabsRef.current.filter((tab) => closingIds.has(tab.id));
    const closingTabIds = closingTabs.map((tab) => tab.id);
    closingTabIds.forEach(stopTerminalWarmupCapture);
    closeRuntimeTerminalSessions(closingTabs);
    setTerminalDirectories((directories) => removeDirectoryState(directories, closingTabIds));
    const nextTabs = terminalTabsRef.current.filter((tab) => !closingIds.has(tab.id));
    const finalClosedConnectionIds = new Set(
      closingTabs
        .map((tab) => tab.connectionId)
        .filter((connectionId) => !nextTabs.some((tab) => tab.connectionId === connectionId)),
    );
    finalClosedConnectionIds.forEach(invalidateDockerExecConnection);
    releaseTemporaryQuickConnectRefs(finalTemporaryContextRefs(closingTabs, nextTabs));
    setTemporaryConnections((items) => items.filter((item) => !finalClosedConnectionIds.has(item.id)));
    terminalTabsRef.current = nextTabs;
    setTerminalTabs(nextTabs);
    // 文件列表按原实现取渲染态 remoteFileTabs（closeConnectionSessions / deleteConnection 用清理后的列表）。
    dispatchTabs({
      type: "tabs/closeTerminals",
      closingTabs: closingTabs.map(sessionRef),
      snapshot: snapshotFromRefs({ terminalTabs: nextTabs.map(sessionRef) }),
    });
  }

  /** 顶栏实例标签点击（WF-01 切片 3）：按项类型走现有 activate*；分屏组回到分屏面。 */
  function selectWorkspaceItem(itemId: string) {
    const item = workspaceItems.find((candidate) => candidate.id === itemId);
    switch (item?.kind) {
      case "home":
        openHome();
        return;
      case "split":
        activateTerminalSplitTab();
        return;
      case "ssh": {
        const tab = terminalTabsRef.current.find((candidate) => candidate.id === item.tabId);
        if (tab) {
          activateTerminalTab(tab);
        }
        return;
      }
      case "local": {
        const tab = localTerminalTabsRef.current.find((candidate) => candidate.id === item.tabId);
        if (tab) {
          activateLocalTerminalTab(tab);
        }
        return;
      }
      case "rdp": {
        const session = rdpSessionsRef.current.find((candidate) => candidate.id === item.sessionId);
        if (session) {
          activateRdpSession(session);
        }
        return;
      }
      case "vnc": {
        const session = vncSessionsRef.current.find((candidate) => candidate.id === item.sessionId);
        if (session) {
          activateVncSession(session);
        }
        return;
      }
      case undefined:
        return;
    }
  }

  /**
   * 执行关闭计划：分屏组只重置布局（其终端已由 connectionIds / sshTabIds / localTabIds 覆盖），
   * 连接级关闭连带远程文件，其余按实例类型分派到 WF-00B 现有关闭路径。
   */
  function executeClosePlan(plan: ClosePlan) {
    for (const transferId of plan.transferIdsToCancel ?? []) requestCancelTransfer(transferId);
    for (const paneId of plan.splitPaneIds ?? []) {
      removeTerminalSplitPaneLayout(paneId);
    }
    if (plan.splitGroup) {
      resetTerminalSplitState();
    }
    if (plan.connectionIds.length > 0) {
      closeConnectionSessions(plan.connectionIds);
    }
    if (plan.sshTabIds.length > 0) {
      closeTerminalTabs(plan.sshTabIds);
    }
    if (plan.localTabIds.length > 0) {
      closeLocalTerminalTabs(plan.localTabIds);
    }
    closeRdpSessions(plan.rdpSessionIds);
    closeVncSessions(plan.vncSessionIds);
  }

  /**
   * 顶栏实例标签关闭（关闭 / 关闭其他 / 关闭右侧 / 全部关闭）：把选中项翻译成关闭请求，
   * 交给 `closeRequestController` 计算计划——需要确认时先弹一次统一确认，确认后按当时状态重算再一次执行（未保存确认见 WS-F08）。
   */
  function closeWorkspaceItems(targetId: string, scope: CloseScope) {
    const request = closeRequestFromItems(closeScopeItemIds(workspaceItems, targetId, scope), workspaceItems);
    closeRequestController.request(request);
  }

  function closeConnectionSessions(connectionIds: string[]) {
    const closingConnectionIds = new Set(connectionIds);
    const remainingRemoteFileTabs = clearRemoteFileSessionStateForConnections(closingConnectionIds);
    connectionIds.forEach((connectionId) => {
      invalidateDockerExecConnection(connectionId);
      if (hasTauriRuntime()) {
        void tunnelStopConnection(connectionId).catch(() => undefined);
      }
    });
    closeRdpSessions(
      rdpSessionsRef.current
        .filter((session) => closingConnectionIds.has(session.connectionId))
        .map((session) => session.id),
    );
    closeVncSessions(
      vncSessionsRef.current
        .filter((session) => closingConnectionIds.has(session.connectionId))
        .map((session) => session.id),
    );
    const closingTabs = terminalTabsRef.current.filter((tab) => closingConnectionIds.has(tab.connectionId));
    const closingTabIds = closingTabs.map((tab) => tab.id);
    closingTabIds.forEach(stopTerminalWarmupCapture);
    closeRuntimeTerminalSessions(closingTabs);
    setTerminalDirectories((directories) => removeDirectoryState(directories, closingTabIds));
    forgetActiveConnectionTabs(connectionIds);
    const nextTabs = terminalTabsRef.current.filter((tab) => !closingConnectionIds.has(tab.connectionId));
    terminalTabsRef.current = nextTabs;
    setTerminalTabs(nextTabs);
    dispatchTabs({
      type: "tabs/closeConnections",
      connectionIds,
      snapshot: snapshotFromRefs({ remoteFileTabs: remainingRemoteFileTabs.map(sessionRef), terminalTabs: nextTabs.map(sessionRef) }),
      variant: "sessions",
    });
  }

  function openTerminalInActiveConnection() {
    if (isSshConnection(activeConnection)) {
      openTerminalInConnection(activeConnection);
    }
  }

  function openTerminalInConnection(connection: ConnectionProfile, activate = true) {
    const tab = buildDirectTerminalTab(terminalTabsRef.current, connection);
    const nextTabs = [...terminalTabsRef.current, tab];
    terminalTabsRef.current = nextTabs;
    setTerminalTabs(nextTabs);
    if (activate) {
      activateTerminalTab(tab);
    }
    void runDirectTerminalTab(tab, connection);
    return tab;
  }

  function handleTerminalSplitSessionSelect(
    paneId: string,
    option: TerminalSplitSessionOption,
  ) {
    if (option.binding) {
      assignTerminalSplitBinding(paneId, option.binding);
      return;
    }

    if (option.connectionId) {
      const connection = connectionById.get(option.connectionId) || null;
      if (isSshConnection(connection)) {
        const tab = startConnectionStep(connection, "terminal", false);
        if (tab) assignTerminalSplitBinding(paneId, { kind: "ssh", tabId: tab.id });
        return;
      }
      if (isTelnetConnection(connection) || isSerialConnection(connection)) {
        const tab = openCharacterTerminalInConnection(connection, false);
        assignTerminalSplitBinding(paneId, { kind: "local", tabId: tab.id });
      }
      return;
    }

    if (option.value === "action:new-local") {
      const tab = openLocalTerminalByProfile(resolveDefaultLocalTerminalProfile(), false);
      if (tab) {
        assignTerminalSplitBinding(paneId, { kind: "local", tabId: tab.id });
      }
      return;
    }

    if (option.value !== "action:new-ssh") {
      return;
    }
    const currentPane = terminalSplitPanes.find((pane) => pane.id === paneId);
    const paneConnection =
      currentPane?.binding?.kind === "ssh"
        ? terminalTabs.find((tab) => tab.id === currentPane.binding?.tabId)?.connectionId || null
        : null;
    const connection =
      (paneConnection ? connectionById.get(paneConnection) || null : null) || activeConnection;
    if (!isSshConnection(connection)) {
      return;
    }
    const tab = openTerminalInConnection(connection, false);
    assignTerminalSplitBinding(paneId, { kind: "ssh", tabId: tab.id });
  }

  function openDockerContainerTerminal(container: DockerContainerSummary) {
    if (!isSshConnection(activeConnection)) {
      return;
    }
    const title = tr("workspace.docker.containerTitle", { name: container.name || shortDockerRuntimeId(container.id) });
    const tab = buildDirectTerminalTab(terminalTabsRef.current, activeConnection, title);
    const command = `docker exec -it ${quotePosixShellForTerminal(container.id)} sh\r`;
    setTerminalTabs((tabs) => {
      const nextTabs = [...tabs, tab];
      terminalTabsRef.current = nextTabs;
      return nextTabs;
    });
    activateTerminalTab(tab);
    void runDirectTerminalTab(tab, activeConnection, command);
  }

  async function runDirectTerminalTab(
    tab: TerminalTab,
    connection: ConnectionProfile,
    initialCommand?: string,
  ) {
    if (!tab.requestId) {
      return;
    }

    if (!hasTauriRuntime()) {
      await wait(120);
      if (!terminalTabExists(tab.id)) {
        return;
      }
      setTerminalTabs((tabs) => {
        const nextTabs = tabs.map((item) =>
          item.id === tab.id
            ? {
                ...item,
                error: null,
                requestId: tab.requestId,
                sessionId: `preview-${Date.now().toString()}`,
                status: "预览",
                warmupOutput: [],
              }
            : item,
        );
        terminalTabsRef.current = nextTabs;
        return nextTabs;
      });
      void markConnected(connection.id);
      return;
    }

    const warmupOutput: number[] = [];
    let stopWarmupCapture: (() => void) | null = null;
    let handoffComplete = false;

    try {
      stopWarmupCapture = await listenTerminalOutput((event: TerminalOutputEvent) => {
        if (event.request_id !== tab.requestId) {
          return;
        }
        if (handoffComplete) {
          appendTerminalWarmupOutput(tab.id, event.data);
          return;
        }
        warmupOutput.push(...event.data);
      });
      setTerminalWarmupCaptureStop(tab.id, () => {
        stopWarmupCapture?.();
        stopWarmupCapture = null;
      });

      const sessionId = await terminalConnect({
        cols: 80,
        connection_id: connection.id,
        host: connection.host,
        port: connection.port,
        request_id: tab.requestId,
        rows: 24,
        username: connection.username,
      });

      if (!terminalTabExists(tab.id)) {
        stopTerminalWarmupCapture(tab.id);
        await terminalClose(sessionId).catch(() => {});
        return;
      }

      handoffComplete = true;
      setTerminalTabs((tabs) => {
        const nextTabs = tabs.map((item) =>
          item.id === tab.id
            ? {
                ...item,
                error: null,
                requestId: tab.requestId,
                sessionId,
                status: "已连接",
                warmupOutput,
              }
            : item,
        );
        terminalTabsRef.current = nextTabs;
        return nextTabs;
      });
      void refreshConnectedProfile(connection.id, { connection_id: connection.id });
      if (initialCommand) {
        void terminalWrite(sessionId, initialCommand).catch((error) => {
          setTerminalTabs((tabs) => {
            const nextTabs = tabs.map((item) =>
              item.id === tab.id
                ? {
                    ...item,
                    error: tr("workspace.command.sendFailed", { message: formatError(error) }),
                  }
                : item,
            );
            terminalTabsRef.current = nextTabs;
            return nextTabs;
          });
        });
      }
      window.setTimeout(() => {
        stopTerminalWarmupCapture(tab.id);
      }, 3000);
    } catch (error) {
      stopTerminalWarmupCapture(tab.id);
      if (!terminalTabExists(tab.id)) {
        return;
      }
      setTerminalTabs((tabs) => {
        const nextTabs = tabs.map((item) =>
          item.id === tab.id
            ? {
                ...item,
                error: formatError(error),
                sessionId: undefined,
                status: "连接失败",
                warmupOutput,
              }
            : item,
        );
        terminalTabsRef.current = nextTabs;
        return nextTabs;
      });
    }
  }

  async function moveConnectionToGroup(connection: ConnectionProfile, groupName: string | null) {
    await connectionGroupCatalog.assign(connection, groupName);
  }

  async function toggleConnectionFavorite(connection: ConnectionProfile) {
    await setFavorite(connection.id, !connection.is_favorite);
  }

  function openCredentialSettings() {
    closeConnectionDialog();
    openSettingsSection("credentials");
  }

  async function saveConnectionFromDialog(
    input: ConnectionProfileInput,
    intent: ConnectionSaveIntent,
  ) {
    const saved = await saveConnection(input);
    if (intent === "save-and-connect") openNewConnectionSession(saved);
  }

  async function testConnectionFromDialog(input: ConnectionProfileInput) {
    if (!hasTauriRuntime()) {
      await wait(260);
      return;
    }
    await connectionTestProfile(input);
  }

  async function saveCredentialFromSettings(input: CredentialProfileInput) {
    await upsertCredential(input);
  }

  async function deleteCredentialFromSettings(credential: CredentialProfile) {
    await removeCredential(credential.id);
  }

  function startConnectionStep(
    connection: ConnectionProfile,
    mode: ConnectionStepMode,
    activate = true,
    reuseTabId?: string,
  ) {
    if (isRdpConnection(connection)) {
      openRdpConnectionSession(connection);
      return undefined;
    }
    if (isVncConnection(connection)) {
      openVncConnectionSession(connection);
      return undefined;
    }

    const authKind = connection.prompt_auth_kind || connection.inline_auth_kind || "password";
    const step: ConnectionStepState = {
      authKind,
      connection,
      error: null,
      hostKey: null,
      hostKeyDecision: null,
      id: Date.now(),
      logs: [
        `${mode === "terminal" ? tr("workspace.connection.openTerminal") : tr("workspace.connection.test")}：${formatConnectionAddress(connection)}`,
      ],
      mode,
      password: "",
      privateKeyPassphrase: "",
      privateKeyPath: "",
      promptTarget: connection.credential_mode === "prompt" ? credentialPromptTargetFromConnection(connection) : null, runtimeCredentials: {},
      temporary: connection.created_at === "temporary",
      temporaryContextRef: connection.created_at === "temporary" ? connection.id : null,
      temporaryCredentialsReady: false,
      oldHostKeyFingerprint: null,
      sessionId: null,
      status: connection.credential_mode === "prompt" ? "prompt" : "idle",
    };
    const existingTab = reuseTabId ? terminalTabsRef.current.find((item) => item.id === reuseTabId) || null : null;
    const builtTab = buildConnectingTab(terminalTabsRef.current, connection, step);
    const tab = existingTab ? { ...builtTab, id: existingTab.id, ordinal: existingTab.ordinal } : builtTab;
    setTerminalTabs((tabs) => {
      const nextTabs = existingTab ? tabs.map((item) => item.id === existingTab.id ? tab : item) : [...tabs, tab];
      terminalTabsRef.current = nextTabs;
      return nextTabs;
    });
    if (activate) {
      dispatchTabs({ type: "tabs/startConnecting", connectionId: connection.id, tabId: tab.id });
    }
    if (connection.credential_mode !== "prompt") {
      void runConnectionStep(tab.id, step);
    }
    return tab;
  }

  async function runConnectionStep(tabId: string, step: ConnectionStepState) {
    const runningStep: ConnectionStepState = {
      ...step,
      ...(step.temporary ? { password: "", privateKeyPassphrase: "", privateKeyPath: "" } : {}),
      activeStepIndex: 1,
      errorDetail: null,
      error: null,
      hostKey: null,
      hostKeyDecision: null,
      logs: [...step.logs, tr("workspace.connection.readConfig"), tr("workspace.connection.network")],
      oldHostKeyFingerprint: null,
      sessionId: null,
      status: "running",
    };
    updateConnectingTabStep(tabId, runningStep);

    if (!hasTauriRuntime()) {
      await wait(260);
      if (!connectingTabExists(tabId)) {
        return;
      }
      const previewStep = {
        ...runningStep,
        logs: [...runningStep.logs, tr("workspace.connection.browserSkip"), tr("workspace.connection.stepComplete")],
        status: "success" as ConnectionStepStatus,
      };
      if (step.mode === "terminal") {
        if (!step.temporary) void markConnected(step.connection.id);
        replaceConnectingTabWithTerminal(tabId, `preview-${Date.now().toString()}`);
      } else {
        updateConnectingTabStep(tabId, previewStep);
      }
      return;
    }

    const prepareRequestId = `prepare-${crypto.randomUUID()}`;
    const warmupOutput: number[] = [];
    let stopWarmupCapture: (() => void) | null = null;
    let handoffComplete = false;

    try {
      if (step.temporary && step.temporaryContextRef && !step.temporaryCredentialsReady) {
        await prepareTemporaryQuickConnectCredentials(step.temporaryContextRef, step.connection.username, step);
        runningStep.temporaryCredentialsReady = true;
        updateConnectingTabStep(tabId, runningStep);
      }
      if (step.mode === "terminal") {
        stopWarmupCapture = await listenTerminalOutput((event: TerminalOutputEvent) => {
          if (event.request_id !== prepareRequestId) {
            return;
          }
          if (handoffComplete) {
            appendTerminalWarmupOutput(tabId, event.data);
            return;
          }
          warmupOutput.push(...event.data);
        });
        setTerminalWarmupCaptureStop(tabId, () => {
          stopWarmupCapture?.();
          stopWarmupCapture = null;
        });
      }

      const runtimeCredential = buildRuntimeCredentialRequest(step.connection.id, step.runtimeCredentials);
      if (step.mode === "test") {
        await connectionTest(runtimeCredential);
        if (!connectingTabExists(tabId)) {
          return;
        }
        void probeSystem(runtimeCredential).catch(() => null);
        updateConnectingTabStep(tabId, {
          ...runningStep,
          logs: [...runningStep.logs, tr("workspace.connection.authPassed"), tr("workspace.connection.testPassed")],
          status: "success",
        });
        return;
      }

      const sessionId =
        step.temporary && step.temporaryContextRef
          ? await connectTemporaryQuickTerminal(step.temporaryContextRef, prepareRequestId)
          : await terminalConnect({
              auth_kind: runtimeCredential.auth_kind,
              cols: 80,
              connection_id: step.connection.id,
              host: step.connection.host,
              password: runtimeCredential.password,
              port: step.connection.port,
              private_key_path: runtimeCredential.private_key_path,
              private_key_passphrase: runtimeCredential.private_key_passphrase,
              request_id: prepareRequestId,
              runtime_credentials: runtimeCredential.runtime_credentials,
              rows: 24,
              username: step.connection.username,
            });
      if (!connectingTabExists(tabId)) {
        stopTerminalWarmupCapture(tabId);
        await terminalClose(sessionId).catch(() => {});
        return;
      }
      if (!step.temporary) void refreshConnectedProfile(step.connection.id, runtimeCredential);
      handoffComplete = true;
      replaceConnectingTabWithTerminal(tabId, sessionId, [...warmupOutput], prepareRequestId);
      window.setTimeout(() => {
        stopTerminalWarmupCapture(tabId);
      }, 3000);
    } catch (nextError) {
      stopTerminalWarmupCapture(tabId);
      if (!connectingTabExists(tabId)) {
        return;
      }
      const errorDetail = describeConnectionStepError(nextError);
      const hostKeyError = parseHostKeyError(nextError);
      if (hostKeyError) {
        updateConnectingTabStep(tabId, {
          ...runningStep,
          error: errorDetail.message,
          errorDetail,
          hostKey: hostKeyError.hostKey,
          hostKeyDecision: hostKeyError.decision,
          logs: [...runningStep.logs, tr("workspace.connection.waitHostKey")],
          oldHostKeyFingerprint: hostKeyError.oldFingerprint,
          status: "waiting_host_key",
        });
        return;
      }
      const requestedPrompt = parseCredentialPromptTarget(nextError);
      if (requestedPrompt) {
        const promptTarget = { ...requestedPrompt, name: connectionById.get(requestedPrompt.connectionId)?.name };
        updateConnectingTabStep(tabId, { ...runningStep, authKind: promptTarget.authKind, error: errorDetail.message, errorDetail, promptTarget, password: "", privateKeyPassphrase: "", privateKeyPath: "", logs: [...runningStep.logs, tr("workspace.connection.waitCredentials", { name: promptTarget.name || promptTarget.connectionId })], status: "prompt" });
        return;
      }
      const nodeFailure = parseSshNodeFailure(nextError);
      const retryProfile = nodeFailure?.stage === "auth" ? connectionById.get(nodeFailure.connectionId) : step.connection.credential_mode === "prompt" && connectionStepErrorIndex(errorDetail.code) === 3 ? step.connection : null;
      if (retryProfile?.credential_mode === "prompt") {
        const promptTarget = credentialPromptTargetFromConnection(retryProfile);
        updateConnectingTabStep(tabId, { ...runningStep, authKind: promptTarget.authKind, error: errorDetail.message, errorDetail, promptTarget, password: "", privateKeyPassphrase: "", privateKeyPath: "", logs: [...runningStep.logs, tr("workspace.connection.authRetry", { name: promptTarget.name })], status: "prompt" });
        return;
      }
      const nodeLabel = nodeFailure ? connectionById.get(nodeFailure.connectionId)?.name || nodeFailure.connectionId : "";
      const contextualErrorDetail = nodeLabel ? { ...errorDetail, message: `${nodeLabel}：${errorDetail.message}` } : errorDetail;
      updateConnectingTabStep(tabId, {
        ...runningStep,
        error: contextualErrorDetail.message,
        errorDetail: contextualErrorDetail,
        logs: appendUniqueLogs(runningStep.logs, [
          contextualErrorDetail.message,
          contextualErrorDetail.rawMessage,
        ]),
        status: "error",
      });
    }
  }

  function retryConnectionStep(tabId: string, step: ConnectionStepState) {
    if (step.temporary && isQuickConnectCredentialError(step.errorDetail?.code)) {
      updateConnectingTabStep(tabId, { ...resetConnectionStepForRetry(step), status: "prompt", temporaryCredentialsReady: false });
      return;
    }
    void runConnectionStep(tabId, resetConnectionStepForRetry(step));
  }

  async function trustHostKeyAndRetry(tabId: string, step: ConnectionStepState) {
    if (!step.hostKey) {
      return;
    }
    const nextStep: ConnectionStepState = {
      ...step,
      logs: [
        ...step.logs,
        step.hostKeyDecision === "changed"
          ? tr("workspace.connection.trustUpdated")
          : tr("workspace.connection.trusted"),
      ],
      status: "running",
    };
    updateConnectingTabStep(tabId, nextStep);
    try {
      await knownHostTrust(step.hostKey);
      await runConnectionStep(tabId, nextStep);
    } catch (nextError) {
      if (!connectingTabExists(tabId)) {
        return;
      }
      const errorDetail = describeConnectionStepError(nextError);
      updateConnectingTabStep(tabId, {
        ...nextStep,
        error: errorDetail.message,
        errorDetail,
        logs: appendUniqueLogs(nextStep.logs, [
          errorDetail.message,
          errorDetail.rawMessage,
        ]),
        status: "error",
      });
    }
  }

  function submitPromptCredential(
    tabId: string,
    step: ConnectionStepState,
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();
    const runtimeCredentials = upsertRuntimeCredential(step.runtimeCredentials, step.promptTarget?.connectionId || step.connection.id, step.authKind, step.password, step.privateKeyPath, step.privateKeyPassphrase);
    void runConnectionStep(tabId, { ...step, runtimeCredentials, logs: [...step.logs, tr("workspace.connection.credentialsEntered")] });
  }

  function handlePaneResizeStart(
    side: ResizablePaneSide,
    event: ReactPointerEvent<HTMLDivElement>,
  ) {
    if (side === "left" && leftPaneCollapsed) {
      return;
    }
    if (side === "right" && (rightPaneCollapsed || !showWorkspaceToolPane)) {
      return;
    }

    event.preventDefault();
    const startX = event.clientX;
    const startWidth = side === "left" ? leftPaneWidth : rightPaneWidth;
    const oppositeWidth = side === "left"
      ? (showWorkspaceToolPane && !rightPaneCollapsed ? rightPaneWidth : 0)
      : (leftPaneCollapsed ? 0 : leftPaneWidth);

    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    setResizingPane(side);

    let animationFrameId: number | null = null;
    let latestClientX = startX;

    function applyResize(currentX: number) {
      const deltaX = currentX - startX;
      const rawWidth = side === "left" ? startWidth + deltaX : startWidth - deltaX;
      const containerWidth = getWorkspaceWidth(workspaceShellRef.current);
      const nextWidth = clampPaneWidth(side, rawWidth, containerWidth, oppositeWidth);

      if (side === "left") {
        setLeftPaneWidth(nextWidth);
        return;
      }

      setRightPaneWidth(nextWidth);
    }

    function scheduleResize() {
      if (animationFrameId !== null) {
        return;
      }

      animationFrameId = window.requestAnimationFrame(() => {
        animationFrameId = null;
        applyResize(latestClientX);
      });
    }

    function handlePointerMove(pointerEvent: PointerEvent) {
      latestClientX = pointerEvent.clientX;
      scheduleResize();
    }

    function finishResize(pointerEvent?: PointerEvent) {
      if (animationFrameId !== null) {
        window.cancelAnimationFrame(animationFrameId);
        animationFrameId = null;
      }
      if (pointerEvent) {
        applyResize(pointerEvent.clientX);
      }
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      setResizingPane(null);
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", finishResize);
      window.removeEventListener("pointercancel", finishResize);
    }

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", finishResize, { once: true });
    window.addEventListener("pointercancel", finishResize, { once: true });
  }

  function handlePaneResizeKeyDown(
    side: ResizablePaneSide,
    event: ReactKeyboardEvent<HTMLDivElement>,
  ) {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") {
      return;
    }

    event.preventDefault();
    const direction = event.key === "ArrowRight" ? 1 : -1;
    if (side === "left") {
      resizePaneByKeyboard("left", direction * paneKeyboardResizeStep);
      return;
    }

    resizePaneByKeyboard("right", -direction * paneKeyboardResizeStep);
  }

  function resizePaneByKeyboard(side: ResizablePaneSide, delta: number) {
    const containerWidth = getWorkspaceWidth(workspaceShellRef.current);

    if (side === "left") {
      const oppositeWidth = showWorkspaceToolPane && !rightPaneCollapsed ? rightPaneWidth : 0;
      setLeftPaneWidth((width) => clampPaneWidth("left", width + delta, containerWidth, oppositeWidth));
      return;
    }

    const oppositeWidth = leftPaneCollapsed ? 0 : leftPaneWidth;
    setRightPaneWidth((width) => clampPaneWidth("right", width + delta, containerWidth, oppositeWidth));
  }

  function handleEditorTerminalResizeStart(event: ReactPointerEvent<HTMLDivElement>) {
    if (activeRemoteFileTabs.length === 0) {
      return;
    }

    event.preventDefault();
    const container = event.currentTarget.parentElement;
    const containerHeight = getElementHeight(container);
    if (containerHeight <= 0) {
      return;
    }

    const editorPaneHeight =
      container?.querySelector<HTMLElement>(".remote-editor-pane")?.getBoundingClientRect().height ||
      (containerHeight * editorTerminalSplitPercent) / 100;
    const startY = event.clientY;

    document.body.style.cursor = "row-resize";
    document.body.style.userSelect = "none";
    setResizingPane("editor-terminal");

    let animationFrameId: number | null = null;
    let latestClientY = startY;

    function applyResize(currentY: number) {
      const deltaY = currentY - startY;
      const nextPercent = ((editorPaneHeight + deltaY) / containerHeight) * 100;
      setEditorTerminalSplitPercent(clampEditorTerminalSplitPercent(nextPercent));
    }

    function scheduleResize() {
      if (animationFrameId !== null) {
        return;
      }

      animationFrameId = window.requestAnimationFrame(() => {
        animationFrameId = null;
        applyResize(latestClientY);
      });
    }

    function handlePointerMove(pointerEvent: PointerEvent) {
      latestClientY = pointerEvent.clientY;
      scheduleResize();
    }

    function finishResize(pointerEvent?: PointerEvent) {
      if (animationFrameId !== null) {
        window.cancelAnimationFrame(animationFrameId);
        animationFrameId = null;
      }
      if (pointerEvent) {
        applyResize(pointerEvent.clientY);
      }
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      setResizingPane(null);
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", finishResize);
      window.removeEventListener("pointercancel", finishResize);
    }

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", finishResize, { once: true });
    window.addEventListener("pointercancel", finishResize, { once: true });
  }

  function handleEditorTerminalResizeKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (event.key !== "ArrowUp" && event.key !== "ArrowDown") {
      return;
    }

    event.preventDefault();
    const direction = event.key === "ArrowDown" ? 1 : -1;
    setEditorTerminalSplitPercent((percent) =>
      clampEditorTerminalSplitPercent(percent + (direction * editorTerminalKeyboardResizeStep)),
    );
  }

  function renderCommandLibraryPanel() {
    return (
      <Suspense fallback={<p className="file-panel-empty">{tr("workspace.loading.commands")}</p>}>
        <CommandLibraryPanel
          activeHistoryId={selectedCommandHistoryId}
          activeSnippetId={selectedCommandSnippetId}
          error={commandLibraryError}
          historyEntries={commandHistoryEntries}
          historyScopeOptions={commandHistoryScopeOptions}
          historyScopeValue={commandHistoryScopeKey}
          loading={commandLibraryLoading}
          groups={commandSnippetGroups}
          snippets={commandSnippets}
          unavailableReason={commandLibraryUnavailableReason}
          onClearHistory={() => setCommandHistoryClearOpen(true)}
          onCopyHistory={(entry) => void copyCommandLibraryText(entry.command, tr("workspace.command.copyHistory"))}
          onCopySnippet={(snippet) => void copyCommandLibraryText(snippet.command, tr("workspace.command.copySnippet", { name: snippet.title }))}
          onCreateGroup={() => openCommandSnippetGroupCreateDialog()}
          onCreateSnippet={(group) => openCommandSnippetDialog(null, group)}
          onDeleteGroup={(group) => setPendingCommandSnippetGroupDelete(group)}
          onDeleteHistory={setPendingCommandHistoryDelete}
          onDeleteSnippet={setPendingCommandSnippetDelete}
          onEditSnippet={openCommandSnippetDialog}
          onHistoryToSnippet={saveHistoryAsSnippet}
          onHistoryScopeChange={setCommandHistoryScopeKey}
          onInsertHistory={insertCommandHistoryEntry}
          onInsertSnippet={insertCommandSnippet}
          onRenameGroup={openCommandSnippetGroupRenameDialog}
          onRunHistory={(entry) => void runCommandHistoryEntry(entry)}
          onRunSnippet={(snippet) => void runCommandSnippet(snippet)}
        />
      </Suspense>
    );
  }

  function renderCommandSenderPanel() {
    if (!commandSenderOpen) {
      return null;
    }

    return (
      <section className="command-sender-panel" aria-label={tr("workspace.command.panelAria")}>
        <div className="command-sender-console">
          <header className="command-sender-console-head">
            <div className="command-sender-title">
              <span>{tr("workspace.command.panelTitle")}</span>
            </div>
            <div className="command-select-row">
              <AppSelect
                ariaLabel={tr("workspace.command.modeAria")}
                className="command-toolbar-app-select command-send-mode-select"
                value="sequential"
                options={[
                  {
                    label: (
                      <span className="command-select-label">
                        <Send className="ui-icon" aria-hidden="true" />
                        <span>{tr("workspace.command.lineMode")}</span>
                      </span>
                    ),
                    value: "sequential",
                  },
                ]}
                onChange={() => undefined}
              />
            </div>
            <span />
            <div className="command-sender-head-actions">
              <span className="command-last-sent">{commandSenderLastSentLabel}</span>
              <button
                className="command-console-toggle command-sender-close"
                type="button"
                aria-label={tr("workspace.command.close")}
                onClick={closeCommandSender}
              >
                <X className="ui-icon" aria-hidden="true" />
                <span className="command-close-text">{tr("workspace.command.close")}</span>
              </button>
            </div>
          </header>

          <div className="command-sender-console-body">
            <aside className="command-sender-block command-target-pane" aria-label={tr("workspace.command.targetsAria")}>
              <div className="command-sender-label">
                <span className="command-target-title">
                  <span>{tr("workspace.command.targets")}</span>
                  <span className="command-target-count">
                    {tr("workspace.command.selected", { selected: commandSenderSelectedCount, total: commandSenderTargets.length })}
                  </span>
                </span>
                <span className="command-target-tools">
                  <label
                    className="command-target-select-all"
                    data-state={
                      commandSenderAllSelected
                        ? "checked"
                        : commandSenderPartiallySelected
                          ? "mixed"
                          : "unchecked"
                    }
                  >
                    <input
                      type="checkbox"
                      checked={commandSenderAllSelected}
                      onChange={toggleCommandSenderAllTargets}
                    />
                    <span>{commandSenderAllSelected ? tr("workspace.command.clearSelection") : tr("workspace.command.selectAll")}</span>
                  </label>
                </span>
              </div>

              <div className="command-target-list">
                {commandSenderTargets.length === 0 ? (
                  <p className="command-sender-empty">{tr("workspace.command.noTargets")}</p>
                ) : (
                  commandSenderTargets.map((target) => {
                    const selected = selectedCommandTargetKeySet.has(target.key);
                    const hasDelivery = target.deliveryStatus !== "idle";
                    return (
                      <div
                        className={`command-target command-sender-target ${
                          selected ? "selected" : ""
                        } ${hasDelivery ? "has-delivery" : ""} ${
                          target.deliveryStatus === "failed" || target.deliveryStatus === "disconnected"
                            ? "has-failed-delivery"
                            : ""
                        }`}
                        data-delivery={target.deliveryStatus}
                        key={target.key}
                      >
                        <label className="command-target-select">
                          <input
                            className="command-target-checkbox"
                            type="checkbox"
                            checked={selected}
                            onChange={() => toggleCommandSenderTarget(target)}
                          />
                          <span className="command-target-copy">
                            <strong>{target.label}</strong>
                            <span>{target.description}</span>
                          </span>
                        </label>
                        <span className="command-target-meta">
                          <span className="command-target-terminal-shell">
                            <SquareTerminal className="ui-icon" aria-hidden="true" />
                            <span className="command-target-terminal-instance">{target.tabTitle}</span>
                          </span>
                          <span className="command-target-state">
                            {target.deliveryStatus === "disconnected" ? tr("workspace.command.disconnected") : tr("workspace.command.online")}
                          </span>
                          <button
                            className={`command-target-delivery command-sender-status ${target.deliveryStatus}`}
                            type="button"
                            title={target.deliveryMessage || tr("workspace.command.openTarget")}
                            onClick={() => activateCommandSenderTarget(target)}
                          >
                            {commandSenderDeliveryLabel(target.deliveryStatus)}
                          </button>
                        </span>
                      </div>
                    );
                  })
                )}
              </div>
            </aside>

            <section className="command-sender-block command-compose-pane" aria-label={tr("workspace.command.composeAria")}>
              <div className="command-compose-label">{tr("workspace.command.command")}</div>
              <textarea
                className="command-input command-sender-input"
                value={commandSenderInput}
                placeholder={tr("workspace.command.placeholder")}
                spellCheck={false}
                onChange={(event) =>
                  handleCommandSenderInputChange(event.currentTarget.value)
                }
                onKeyDown={handleCommandSenderInputKeyDown}
              />
              {commandLibraryError ? (
                <div className="command-library-error" role="status">
                  {commandLibraryError}
                </div>
              ) : null}
              {commandLibraryUnavailableReason ? (
                <div className="command-library-notice" role="status">
                  {commandLibraryUnavailableReason}
                </div>
              ) : null}
              {commandSenderRisky ? (
                <div className="command-risk-warning command-sender-risk-warning show" role="status">
                  {tr("workspace.command.risk")}
                </div>
              ) : null}
              <div className="command-compose-footer command-sender-actions">
                <div className="command-send-result">
                  {commandSenderInput.trim()
                    ? commandSenderSelectedCount > 0
                      ? tr("workspace.command.targetsReady", { count: commandSenderSelectedCount })
                      : tr("workspace.command.chooseTarget")
                    : tr("workspace.command.waitInput")}
                </div>
                <div className="command-actions">
                  <button
                    className="primary-button command-sender-primary"
                    type="button"
                    disabled={!commandSenderCanSend}
                    onClick={() => void sendCommandToTargets(true)}
                  >
                    <CornerDownLeft className="ui-icon" aria-hidden="true" />
                    <span>{tr("workspace.command.sendEnter")}</span>
                  </button>
                  <button
                    className="secondary-button command-sender-secondary"
                    type="button"
                    disabled={!commandSenderCanSend}
                    onClick={() => void sendCommandToTargets(false)}
                  >
                    {tr("workspace.command.sendNoEnter")}
                  </button>
                  <button
                    className="secondary-button clear-command-button command-sender-secondary"
                    type="button"
                    disabled={!commandSenderInput}
                    onClick={clearCommandSenderInput}
                  >
                    <Trash2 className="ui-icon" aria-hidden="true" />
                    <span>{tr("workspace.command.clear")}</span>
                  </button>
                </div>
              </div>
            </section>
          </div>
        </div>
      </section>
    );
  }

  return (
    <div
      className="app-shell"
      data-home-active={showingHome}
      data-local-terminal-active={showingLocalTerminal}
      data-density={settings.appearance.density}
      data-left-collapsed={leftPaneCollapsed}
      data-pane-resizing={resizingPane || undefined}
      data-platform={desktopPlatform}
      data-right-collapsed={rightPaneCollapsed}
      data-theme-mode={settings.appearance.themeMode}
      data-window-material={effectiveWindowMaterial}
      style={appShellStyle}
    >
      {secretVault.requiresUnlock ? (
        <SecretVaultGate
          error={secretVault.error}
          loading={secretVault.loading}
          masterPasswordEnabled={settings.security.masterPasswordEnabled}
          onRetry={secretVault.retry}
          onUnlock={secretVault.unlock}
          status={secretVault.status}
          unlocking={secretVault.unlocking}
        />
      ) : null}

      <AppTitlebar
        activeItemId={activeWorkspaceItemId}
        appUpdateNotice={
          appUpdate.workspaceNoticeVisible
            ? {
                label: appUpdate.workspaceNoticeLabel || tr("workspace.update.available"),
                onDismiss: appUpdate.dismissWorkspaceNotice,
                onOpen: () => openSettingsSection("basic"),
              }
            : null
        }
        items={titlebarItems}
        closeShortcutBinding={closeShortcutBinding}
        leftPaneCollapsed={leftPaneCollapsed}
        newSession={newSessionEntry}
        onCloseAll={() => closeWorkspaceItems(HOME_ITEM_ID, "all")}
        onCloseItem={(itemId) => {
          void actionExecutor.run({
            actionId: "workspace.closeItem",
            source: "context-menu",
            target: { kind: "item", itemId },
          });
        }}
        onCloseOthers={(itemId) => closeWorkspaceItems(itemId, "others")}
        onCloseToRight={(itemId) => closeWorkspaceItems(itemId, "right")}
        onSelectItem={selectWorkspaceItem}
        onToggleLeftPane={() => setLeftPaneCollapsed((collapsed) => !collapsed)}
      />
      <AppActionBar executor={actionExecutor} newSession={newSessionEntry} />

      <main className="workspace-shell" ref={workspaceShellRef} hidden={activeView === "settings"}>
        <WorkspaceSidebar
          activeView={workspaceSidebarView}
          fileContext={workspaceSidebarFileContext}
          files={workspaceSidebarFileContext ? (
            <RemoteFilesView key={workspaceSidebarFileContext.tabId} active={!leftPaneCollapsed && workspaceSidebarView === "files"} connection={connectionById.get(workspaceSidebarFileContext.connectionId) || null}
              locateRequest={remoteFileLocateRequest} refreshRequest={remoteFileRefreshRequest} nativeDropTargetPath={nativeFileDropTargetPath}
              stateKey={`ssh-file-panel:${workspaceSidebarFileContext.tabId}`} terminalPath={workspaceSidebarFileContext.path}
              transferPanel={<RemoteFileTransferPanel onCancel={requestCancelTransfer} onCopyPath={copyRemotePath} onRemove={removeRemoteFileTransfer} onRetry={retryRemoteFileTransfer} onOpenLocalPath={openLocalTransferPath} onRevealLocalPath={revealLocalTransferPath} />}
              onCopyPath={copyRemotePath} onCreateDirectory={requestCreateRemoteDirectory} onCreateFile={requestCreateRemoteFile}
              onDeleteEntries={requestDeleteRemoteEntries} onDeleteEntry={requestDeleteRemoteEntry} onDownloadEntries={downloadRemoteFiles} onDownloadEntry={downloadRemoteFile}
              onOpenFile={openRemoteFile} onRenameEntry={requestRenameRemoteEntry} onShowProperties={showRemoteFileProperties}
              onUploadDirectory={uploadRemoteDirectory} onUploadFile={uploadRemoteFile} onUploadItems={uploadRemoteItems}
              resolveTerminalPath={() => resolveTerminalLocatePath(workspaceSidebarFileContext.tabId)} />
          ) : null}
          onViewChange={setWorkspaceSidebarView}
          sessions={
            <ConnectionPane
              batchConnect={{ ...batchConnect, openConnectionIds: batchOpenConnectionIds }}
              connections={connections}
              error={error || connectionGroupCatalog.error}
              loading={loading}
              onConnect={openConnectionSession}
              onCreate={createConnection}
              onDelete={deleteConnection}
              onDuplicate={duplicateConnection}
              onEdit={editConnection}
              groups={connectionGroupCatalog.groups}
              groupReady={connectionGroupCatalog.ready}
              migration={connectionGroupCatalog.migration}
              onResolveMigration={connectionGroupCatalog.resolveMigration}
              groupBusy={connectionGroupCatalog.busy}
              onSaveGroup={connectionGroupCatalog.save}
              onDeleteGroup={connectionGroupCatalog.remove}
              onMoveConnectionToGroup={moveConnectionToGroup}
              onOpen={openTerminal}
              onOpenSearch={() => setConnectionSearchOpen(true)}
              onOpenSettings={() => openSettingsSection()}
              onPreloadCreate={preloadCreateConnectionDialog}
              onRefresh={reload}
              onSelect={selectConnection}
              onToggleFavorite={toggleConnectionFavorite}
              recentConnectionLimit={settings.basic.recentConnectionLimit}
              selectedId={activeConnectionSelectionId}
            />
          }
        />

        {!leftPaneCollapsed ? (
          <div
            className="pane-resizer left-pane-resizer"
            role="separator"
            aria-label={tr("workspace.layout.resizeLeft")}
            aria-orientation="vertical"
            aria-valuemin={minLeftPaneWidth}
            aria-valuemax={maxLeftPaneWidth}
            aria-valuenow={leftPaneWidth}
            tabIndex={0}
            onDoubleClick={() => setLeftPaneWidth(defaultLeftPaneWidth)}
            onKeyDown={(event) => handlePaneResizeKeyDown("left", event)}
            onPointerDown={(event) => handlePaneResizeStart("left", event)}
          />
        ) : null}

        <section className={`main-workbench ${showMultiExecBar ? "multi-exec-open" : ""}`} aria-label={tr("workspace.aria")}>
          <ConnectionHome
            connections={connections}
            error={error}
            groups={connectionGroupCatalog}
            loading={loading}
            onConnect={openConnectionSession}
            onCreateConnection={() => createConnection()}
            onDelete={deleteConnection}
            onEdit={editConnection}
            onExportConnections={() => setConnectionTransferMode("export")}
            onImportConnections={() => setConnectionTransferMode("import")}
            onPreloadCreateConnection={preloadCreateConnectionDialog}
            onRefresh={reload}
            hidden={!showingHome}
          />

          {hasSessionWorkspace ? (
            <section
              className={`session-workbench ${showingHome ? "is-hidden" : ""}`}
              data-editor-open={
                activeRemoteFileTabs.length > 0 && !isActiveTerminalFileUnified ? "true" : "false"
              }
              data-workbench-tab-dragging={workbenchTabMouseDrag?.active ? "true" : undefined}
              aria-label={tr("workspace.aria.editorTerminal")}
              aria-hidden={showingHome}
            >
              {activeRemoteFileTabs.length > 0 && !isActiveTerminalFileUnified ? (
                <section className="remote-editor-pane" aria-label={tr("workspace.aria.remoteEditor")}>
                  <nav
                    className="remote-editor-tabs"
                    aria-label={tr("workspace.aria.remoteTabs")}
                    data-workbench-tab-drop-zone="file"
                    data-workbench-tab-drop-active={workbenchTabDropZone === "file" ? "true" : undefined}
                  >
                    <div className="workbench-tab-scroll-list" ref={remoteEditorTabScroll.ref}>
                      {activeRemoteFileTabs.map(renderRemoteFileSubtab)}
                    </div>
                    {renderWorkbenchTabScrollControls(remoteEditorTabScroll, tr("workspace.aria.remoteTabs"))}
                  </nav>

                  <section className="remote-editor-stack" aria-label={tr("workspace.aria.fileEditor")}>
                    <Suspense fallback={<RemoteEditorLoadingFallback />}>
                      {remoteFileTabs.map((tab) => (
                        <RemoteFileEditor
                          active={isRemoteFileEditorActive(tab.id)}
                          desktopPlatform={desktopPlatform}
                          fontFamily={terminalFontFamily}
                          fontSize={settings.appearance.terminalFontSize}
                          key={tab.id}
                          tab={tab}
                          themeMode={settings.appearance.themeMode}
                          onChange={handleRemoteFileChange}
                          onClose={closeRemoteFileTab}
                          onDiscard={discardRemoteFileChanges}
                          onLocateFolder={locateRemoteFileFolder}
                          onReload={reloadRemoteFile}
                          onSave={saveRemoteFile}
                        />
                      ))}
                    </Suspense>
                  </section>
                </section>
              ) : null}

              {activeRemoteFileTabs.length > 0 && !isActiveTerminalFileUnified ? (
                <div
                  className="editor-terminal-resizer"
                  role="separator"
                  aria-label={tr("workspace.layout.resizeEditor")}
                  aria-orientation="horizontal"
                  aria-valuemin={minEditorTerminalSplitPercent}
                  aria-valuemax={maxEditorTerminalSplitPercent}
                  aria-valuenow={editorTerminalSplitPercent}
                  tabIndex={0}
                  onDoubleClick={() => setEditorTerminalSplitPercent(defaultEditorTerminalSplitPercent)}
                  onKeyDown={handleEditorTerminalResizeKeyDown}
                  onPointerDown={handleEditorTerminalResizeStart}
                />
              ) : null}

              <section
                className={`terminal-workbench-pane ${showTerminalCommandSenderPanel ? "command-sender-open" : ""} ${
                  terminalSplitActive ? "terminal-split-active" : ""
                } ${showTerminalWorkbench ? "" : "is-hidden"}`}
                data-workbench-surface={activeWorkbenchSurface}
                data-terminal-tone={terminalTone}
                aria-label={tr("workspace.aria.terminalArea")}
                aria-hidden={!showTerminalWorkbench}
              >
                <nav
                  className={`terminal-subtabs ${isActiveTerminalFileUnified ? "unified-subtabs" : ""}`}
                  aria-label={isActiveTerminalFileUnified ? tr("workspace.aria.unifiedTabs") : tr("workspace.aria.terminalTabs")}
                  data-workbench-tab-drop-zone="terminal"
                  data-workbench-tab-drop-active={workbenchTabDropZone === "terminal" ? "true" : undefined}
                >
                  <div className="workbench-tab-scroll-list" ref={sshTerminalTabScroll.ref}>
                    {activeWorkspaceMode === "local"
                      ? renderLocalTerminalSubtabs()
                      : renderSshTerminalSubtabs()}
                    {isActiveTerminalFileUnified ? activeRemoteFileTabs.map(renderRemoteFileSubtab) : null}
                    {activeWorkspaceMode === "local" ? (
                      <>
                        <Tooltip label={tr("workspace.terminal.newDefault")}>
                          <button
                            className="add-subtab"
                            type="button"
                            aria-label={tr("workspace.terminal.newDefault")}
                            disabled={!defaultLocalTerminalProfile}
                            onClick={() =>
                              void openLocalTerminalByProfile(resolveDefaultLocalTerminalProfile())
                            }
                          >
                            <Plus className="ui-icon" aria-hidden="true" />
                          </button>
                        </Tooltip>
                        <LocalTerminalLauncher
                          disabled={localTerminalProfiles.length === 0}
                          loading={localTerminalProfilesLoading}
                          profiles={localTerminalProfiles}
                          onOpenProfile={(profile) => void openLocalTerminalByProfile(profile)}
                        />
                        {localTerminalProfilesError ? (
                          <div className="local-terminal-subtabs-meta">
                            <button
                              className="local-terminal-inline-action"
                              type="button"
                              onClick={openLocalTerminalSettings}
                            >
                              {localTerminalProfilesError}
                            </button>
                          </div>
                        ) : null}
                      </>
                    ) : activeConnectedTerminalTab ? (
                      <Tooltip label={tr("workspace.terminal.newSameConnection")}>
                        <button
                          className="add-subtab"
                          type="button"
                          aria-label={tr("workspace.terminal.newSameConnection")}
                          onClick={openTerminalInActiveConnection}
                        >
                          <Plus className="ui-icon" aria-hidden="true" />
                        </button>
                      </Tooltip>
                    ) : null}
                  </div>
                  {renderWorkbenchTabScrollControls(sshTerminalTabScroll, tr("workspace.tabs.terminal"))}
                  <div className="terminal-subtab-actions">
                    <TerminalSplitMenu
                      autoCreateSameSession={terminalSplitAutoCreateSameSession}
                      canAddPane={terminalSplitCanAddPane}
                      disabled={!fallbackTerminalSplitBinding()}
                      onAutoCreateSameSessionChange={setTerminalSplitAutoCreateSameSession}
                      onSplitDown={() => startTerminalSplit("column")}
                      onSplitFour={startTerminalFourPaneLayout}
                      onSplitRight={() => startTerminalSplit("row")}
                    />
                    {terminalSplitActive ? (
                      <>
                        <TerminalSplitSyncMenu
                          enabled={terminalSplitSyncEnabled}
                          panes={terminalSplitSyncPaneOptions}
                          participantKeys={terminalSplitSyncParticipantKeys}
                          onEnabledChange={setTerminalSplitSyncState}
                          onParticipantChange={setTerminalSplitSyncParticipant}
                        />
                        <Tooltip label={tr("workspace.split.equalize")}>
                          <button
                            className="add-subtab terminal-split-equalize"
                            type="button"
                            aria-label={tr("workspace.split.equalize")}
                            onClick={equalizeTerminalSplitPanes}
                          >
                            <LayoutGrid className="ui-icon" aria-hidden="true" />
                          </button>
                        </Tooltip>
                        {terminalSplitSyncError ? (
                          <Tooltip label={terminalSplitSyncError}>
                            <span
                              className="terminal-split-sync-error"
                              role="status"
                              aria-label={terminalSplitSyncError}
                            >
                              <CircleAlert className="ui-icon" aria-hidden="true" />
                            </span>
                          </Tooltip>
                        ) : null}
                      </>
                    ) : null}
                    {!terminalSplitActive && activeTerminalToolbarTabId ? (
                      <>
                        <Tooltip label={activeTerminalToolbarSearch?.open ? tr("workspace.terminal.searchClose") : tr("workspace.terminal.search")}>
                          <button
                            className={`add-subtab terminal-search-toggle ${
                              activeTerminalToolbarSearch?.open ? "active" : ""
                            }`}
                            type="button"
                            aria-label={tr("workspace.terminal.search")}
                            aria-expanded={Boolean(activeTerminalToolbarSearch?.open)}
                            onClick={() => toggleTerminalSearch(activeTerminalToolbarTabId)}
                          >
                            <Search className="ui-icon" aria-hidden="true" />
                          </button>
                        </Tooltip>
                        <Tooltip label={tr("workspace.terminal.clear")}>
                          <button
                            className="add-subtab terminal-clear-button"
                            type="button"
                            aria-label={tr("workspace.terminal.clear")}
                            onClick={() => clearTerminalTab(activeTerminalToolbarTabId)}
                          >
                            <Eraser className="ui-icon" aria-hidden="true" />
                          </button>
                        </Tooltip>
                      </>
                    ) : null}
                    {showTerminalScopedActions && commandSenderTargets.length > 0 ? (
                      <Tooltip label="Command Sender">
                        <button
                          className={`add-subtab command-sender-toggle ${commandSenderOpen ? "active" : ""}`}
                          type="button"
                          aria-label={tr("workspace.command.open")}
                          aria-expanded={commandSenderOpen}
                          onClick={openCommandSender}
                        >
                          <Send className="ui-icon" aria-hidden="true" />
                        </button>
                      </Tooltip>
                    ) : null}
                    <Tooltip label={rightPaneCollapsed ? tr("workspace.right.expand") : tr("workspace.right.collapse")}>
                      <button
                        className="add-subtab terminal-subtab-panel-toggle"
                        type="button"
                        aria-label={rightPaneCollapsed ? tr("workspace.right.expand") : tr("workspace.right.collapse")}
                        aria-expanded={!rightPaneCollapsed}
                        onClick={() => setRightPaneCollapsed((collapsed) => !collapsed)}
                      >
                        {rightPaneCollapsed ? (
                          <PanelRightOpen className="ui-icon" aria-hidden="true" />
                        ) : (
                          <PanelRightClose className="ui-icon" aria-hidden="true" />
                        )}
                      </button>
                    </Tooltip>
                  </div>
                </nav>

                <section
                  className={`terminal-stack ${isActiveTerminalFileUnified ? "terminal-file-unified-stack" : ""} ${
                    terminalSplitActive ? "terminal-split-stack" : ""
                  }`}
                  data-unified-active-kind={activeUnifiedTabKind || undefined}
                  aria-label={isActiveTerminalFileUnified ? tr("workspace.aria.terminalAndEditor") : tr("workspace.aria.terminal")}
                >
                  {terminalSplitActive && terminalSplitLayout ? (
                    <TerminalSplitLayout
                      focusedPaneId={focusedTerminalPaneId || terminalSplitPanes[0]?.id || ""}
                      layout={terminalSplitLayout}
                      pickerOpenRequest={terminalSplitPickerOpenRequest}
                      sessionOptions={terminalSplitSessionOptions}
                      syncEnabled={terminalSplitSyncEnabled}
                      syncParticipantKeys={terminalSplitSyncParticipantKeys}
                      onClearPane={clearTerminalSplitPane}
                      onClosePane={closeTerminalSplitPane}
                      onFocusPane={focusTerminalSplitPane}
                      onPickerOpenChange={handleTerminalSplitPickerOpenChange}
                      onRatioChange={updateTerminalSplitRatio}
                      onResizeEnd={() => setTerminalSplitLayoutRevision((revision) => revision + 1)}
                      onSelectSession={handleTerminalSplitSessionSelect}
                      onToggleSearch={toggleTerminalSplitPaneSearch}
                    />
                  ) : null}
                  {isActiveTerminalFileUnified ? (
                    <Suspense fallback={<RemoteEditorLoadingFallback />}>
                      {remoteFileTabs.map((tab) => (
                        <RemoteFileEditor
                          active={isRemoteFileEditorActive(tab.id)}
                          desktopPlatform={desktopPlatform}
                          fontFamily={terminalFontFamily}
                          fontSize={settings.appearance.terminalFontSize}
                          key={tab.id}
                          tab={tab}
                          themeMode={settings.appearance.themeMode}
                          onChange={handleRemoteFileChange}
                          onClose={closeRemoteFileTab}
                          onDiscard={discardRemoteFileChanges}
                          onLocateFolder={locateRemoteFileFolder}
                          onReload={reloadRemoteFile}
                          onSave={saveRemoteFile}
                        />
                      ))}
                    </Suspense>
                  ) : null}
                  {terminalTabs.map((tab) => {
                    const tabStep = tab.type === "connecting" ? tab.connectionStep : null;
                    return tabStep ? (
                      <ConnectionStepPanel
                        key={tab.id}
                        step={tabStep}
                        active={isTerminalPanelActive(tab.id)}
                        {...terminalSplitStatusProps({ kind: "ssh", tabId: tab.id })}
                        onCancel={() => closeTerminal(tab.id)}
                        onEdit={(connection) => {
                          editConnection(connection);
                        }}
                        onPromptUsernameChange={(username) => updateConnectingTabStep(tab.id, { ...tabStep, connection: { ...tabStep.connection, username } })}
                        onPromptAuthKindChange={(authKind) =>
                          updateConnectingTabStep(tab.id, {
                            ...tabStep,
                            authKind,
                            password: "",
                            privateKeyPath: "",
                          })
                        }
                        onPromptPasswordChange={(password) =>
                          updateConnectingTabStep(tab.id, { ...tabStep, password })
                        }
                        onPromptPrivateKeyPathChange={(privateKeyPath) =>
                          updateConnectingTabStep(tab.id, { ...tabStep, privateKeyPath })
                        }
                        onPromptPrivateKeyPassphraseChange={(privateKeyPassphrase) =>
                          updateConnectingTabStep(tab.id, {
                            ...tabStep,
                            privateKeyPassphrase,
                          })
                        }
                        onRetry={() => retryConnectionStep(tab.id, tabStep)}
                        onSubmitPrompt={(event) =>
                          submitPromptCredential(tab.id, tabStep, event)
                        }
                        onTrustHostKey={() => void trustHostKeyAndRetry(tab.id, tabStep)}
                      />
                    ) : tab.type === "terminal" && tab.sessionId ? (
                      <Suspense
                        key={tab.id}
                        fallback={
                          <DirectTerminalStatusPanel
                            active={isTerminalPanelActive(tab.id)}
                            {...terminalSplitStatusProps({ kind: "ssh", tabId: tab.id })}
                            connection={connectionById.get(tab.connectionId) || null}
                            error={null}
                            status={tr("workspace.terminal.loading")}
                            title={tab.title}
                          />
                        }
                      >
                        <TerminalPanel
                          active={isTerminalPanelActive(tab.id)}
                          {...terminalSplitContentProps({ kind: "ssh", tabId: tab.id })}
                          clearRequestId={
                            terminalClearRequest?.tabId === tab.id ? terminalClearRequest.id : 0
                          }
                          connection={connectionById.get(tab.connectionId) || null}
                          ctrlVPaste={settings.localTerminal.ctrlVPaste}
                          cursorBlink={settings.appearance.cursorBlink}
                          cursorStyle={settings.appearance.cursorStyle}
                          fontFamily={terminalFontFamily}
                          fontSize={settings.appearance.terminalFontSize}
                          initialSessionId={tab.sessionId}
                          initialOutput={tab.warmupOutput}
                          initialRequestId={tab.requestId}
                          onCurrentDirectoryChange={updateTerminalDirectory}
                          onPromptDirectorySnapshotChange={updateTerminalPromptDirectorySnapshotReader}
                          onRecentOutput={appendTerminalRecentOutput}
                          onSearchClose={closeTerminalSearch}
                          onSearchCaseSensitiveToggle={toggleTerminalSearchCaseSensitive}
                          onSearchQueryChange={updateTerminalSearchQuery}
                          onSendSelectionToAi={sendTerminalSelectionToAi}
                          onSessionIdChange={updateTerminalRuntimeSession}
                          onStatusChange={updateTabStatus}
                          onTerminalInputCommand={
                            settings.command.recordTerminalInputHistory
                              ? (tabId, command) => void recordTerminalInputHistoryCommand(tabId, command)
                              : undefined
                          }
                          onUserInput={handleMultiExecUserInput}
                          onWarmupCaptureReady={stopTerminalWarmupCapture}
                          searchCaseSensitive={Boolean(terminalSearchByTabId[tab.id]?.caseSensitive)}
                          searchNavigationRequest={terminalSearchNavigationRequest}
                          searchOpen={Boolean(terminalSearchByTabId[tab.id]?.open)}
                          searchQuery={terminalSearchByTabId[tab.id]?.query || ""}
                          tabId={tab.id}
                          theme={terminalColorScheme.theme}
                          title={tab.title}
                        />
                      </Suspense>
                    ) : tab.type === "terminal" ? (
                      <DirectTerminalStatusPanel
                        active={isTerminalPanelActive(tab.id)}
                        {...terminalSplitStatusProps({ kind: "ssh", tabId: tab.id })}
                        connection={connectionById.get(tab.connectionId) || null}
                        error={tab.error || null}
                        onRetry={() => retryRestoredSshTab(tab.id)}
                        status={tab.status}
                        title={tab.title}
                      />
                    ) : null;
                  })}
                  {showingLocalTerminal && !terminalSplitActive && localTerminalTabs.length === 0 ? (
                    <LocalTerminalEmptyPanel
                      active
                      error={localTerminalProfilesError}
                      loading={localTerminalProfilesLoading}
                      profileName={defaultLocalTerminalProfile?.name || null}
                      onOpenDefault={() =>
                        void openLocalTerminalByProfile(resolveDefaultLocalTerminalProfile())
                      }
                      onOpenSettings={openLocalTerminalSettings}
                    />
                  ) : null}
                  {localTerminalTabs.map((tab) =>
                        tab.sessionId ? (
                          <Suspense
                            key={tab.id}
                            fallback={
                              <LocalTerminalStatusPanel
                                active={isTerminalPanelActive(tab.id, "local")}
                                {...terminalSplitStatusProps({ kind: "local", tabId: tab.id })}
                                error={null}
                                profile={
                                  tab.source === "local"
                                    ? localTerminalProfiles.find((profile) => profile.id === tab.profileId) || null
                                    : null
                                }
                                source={tab.source || "local"}
                                status={tr("workspace.terminal.loading")}
                                title={tab.title}
                                onOpenSettings={openLocalTerminalSettings}
                              />
                            }
                          >
                            <TerminalPanel
                              active={isTerminalPanelActive(tab.id, "local")}
                              {...terminalSplitContentProps({ kind: "local", tabId: tab.id })}
                              autoConnect={false}
                              clearRequestId={
                                terminalClearRequest?.tabId === tab.id ? terminalClearRequest.id : 0
                              }
                              connection={null}
                              ctrlVPaste={settings.localTerminal.ctrlVPaste}
                              cursorBlink={settings.appearance.cursorBlink}
                              cursorStyle={settings.appearance.cursorStyle}
                              fontFamily={terminalFontFamily}
                              fontSize={settings.appearance.terminalFontSize}
                              initialSessionId={tab.sessionId}
                              initialOutput={tab.warmupOutput}
                              initialRequestId={tab.requestId}
                              onRecentOutput={appendTerminalRecentOutput}
                              onSearchClose={closeTerminalSearch}
                              onSearchCaseSensitiveToggle={toggleTerminalSearchCaseSensitive}
                              onSearchQueryChange={updateTerminalSearchQuery}
                              onSendSelectionToAi={sendTerminalSelectionToAi}
                              onStatusChange={updateLocalTerminalTabStatus}
                              onTerminalInputCommand={
                                settings.command.recordTerminalInputHistory
                                  ? (tabId, command) =>
                                      void recordTerminalInputHistoryCommand(tabId, command)
                                  : undefined
                              }
                              onUserInput={handleMultiExecUserInput}
                              onWarmupCaptureReady={stopTerminalWarmupCapture}
                              searchCaseSensitive={Boolean(terminalSearchByTabId[tab.id]?.caseSensitive)}
                              searchNavigationRequest={terminalSearchNavigationRequest}
                              searchOpen={Boolean(terminalSearchByTabId[tab.id]?.open)}
                              searchQuery={terminalSearchByTabId[tab.id]?.query || ""}
                              tabId={tab.id}
                              theme={terminalColorScheme.theme}
                              title={tab.title}
                              windowsPty={windowsPtyInfo}
                            />
                          </Suspense>
                        ) : (
                          <LocalTerminalStatusPanel
                            active={isTerminalPanelActive(tab.id, "local")}
                            {...terminalSplitStatusProps({ kind: "local", tabId: tab.id })}
                            error={tab.error || null}
                            profile={
                              tab.source === "local"
                                ? localTerminalProfiles.find((profile) => profile.id === tab.profileId) || null
                                : null
                            }
                            source={tab.source || "local"}
                            status={tab.status}
                            title={tab.title}
                            key={tab.id}
                            onOpenSettings={openLocalTerminalSettings}
                            onRetry={() => retryRestoredLocalTab(tab.id)}
                          />
                        ),
                      )}
                  {showUnifiedSplitDropZones ? (
                    <div className="workbench-split-drop-zones" aria-hidden="true">
                      <div
                        className="workbench-split-drop-zone"
                        data-workbench-tab-drop-zone="split-file"
                        data-workbench-tab-drop-active={
                          workbenchTabDropZone === "split-file" ? "true" : undefined
                        }
                      />
                      <div
                        className="workbench-split-drop-zone"
                        data-workbench-tab-drop-zone="split-terminal"
                        data-workbench-tab-drop-active={
                          workbenchTabDropZone === "split-terminal" ? "true" : undefined
                        }
                      />
                    </div>
                  ) : null}
                </section>
                {showTerminalCommandSenderPanel ? renderCommandSenderPanel() : null}
              </section>

              {workbenchTabMouseDrag?.active ? (
                <div
                  className="workbench-tab-drag-preview"
                  style={{
                    left: `${Math.max(8, workbenchTabMouseDrag.currentX - workbenchTabMouseDrag.grabOffsetX)}px`,
                    top: `${Math.max(8, workbenchTabMouseDrag.currentY - workbenchTabMouseDrag.grabOffsetY)}px`,
                    width: `${Math.min(Math.max(workbenchTabMouseDrag.previewWidth, 96), 220)}px`,
                  }}
                >
                  <span>{getWorkbenchTabDragLabel(workbenchTabMouseDrag.payload)}</span>
                </div>
              ) : null}

              <section
                className={`terminal-workbench-pane rdp-workbench-pane ${
                  showRdpWorkspace ? "" : "is-hidden"
                }`}
                data-workbench-surface="panel"
                aria-label={tr("workspace.rdp.area")}
                aria-hidden={!showRdpWorkspace}
              >
                <nav className="terminal-subtabs rdp-subtabs" aria-label={tr("workspace.rdp.tabs")}>
                  <div className="workbench-tab-scroll-list" ref={rdpTabScroll.ref}>
                    {activeRdpSessions.map((session, index) => (
                      <TabContextMenu
                        key={session.id}
                        actions={[
                          {
                            hint: "Ctrl+F4",
                            label: tr("workspace.tabs.close"),
                            onSelect: () => closeRdpSession(session.id),
                          },
                          {
                            disabled: activeRdpSessions.length <= 1,
                            label: tr("workspace.tabs.closeOthers"),
                            onSelect: () => closeOtherRdpSessions(session.id),
                          },
                          {
                            disabled: index >= activeRdpSessions.length - 1,
                            label: tr("workspace.tabs.closeRight"),
                            onSelect: () => closeRdpSessionsToRight(session.id),
                          },
                          {
                            disabled: activeRdpSessions.length === 0,
                            hint: "Ctrl+K W",
                            label: tr("workspace.tabs.closeAll"),
                            onSelect: () => closeAllRdpSessionsForConnection(session.connectionId),
                          },
                        ]}
                      >
                        <div
                          className={`subtab-shell ${session.id === activeRdpSession?.id ? "active" : ""}`}
                          data-workbench-tab-active={session.id === activeRdpSession?.id ? "true" : undefined}
                        >
                          <button
                            className="subtab rdp-subtab"
                            type="button"
                            title={`${session.title} · ${rdpStatusLabel(session.status)}`}
                            onClick={() => activateRdpSession(session)}
                          >
                            <MonitorPlay className="ui-icon" aria-hidden="true" />
                            <span>{session.title}</span>
                          </button>
                          <button
                            className="subtab-close"
                            type="button"
                            aria-label={tr("workspace.closeNamed", { name: session.title })}
                            onClick={() => closeRdpSession(session.id)}
                          >
                            <X className="ui-icon" aria-hidden="true" />
                          </button>
                        </div>
                      </TabContextMenu>
                    ))}
                  </div>
                  {renderWorkbenchTabScrollControls(rdpTabScroll, tr("workspace.rdp.tabs"))}
                  <div className="terminal-subtab-actions">
                    <Tooltip label={rightPaneCollapsed ? tr("workspace.right.expand") : tr("workspace.right.collapse")}>
                      <button
                        className="add-subtab terminal-subtab-panel-toggle"
                        type="button"
                        aria-label={rightPaneCollapsed ? tr("workspace.right.expand") : tr("workspace.right.collapse")}
                        aria-expanded={!rightPaneCollapsed}
                        onClick={() => setRightPaneCollapsed((collapsed) => !collapsed)}
                      >
                        {rightPaneCollapsed ? (
                          <PanelRightOpen className="ui-icon" aria-hidden="true" />
                        ) : (
                          <PanelRightClose className="ui-icon" aria-hidden="true" />
                        )}
                      </button>
                    </Tooltip>
                  </div>
                </nav>

                <section className="rdp-stack" aria-label={tr("workspace.rdp.state")}>
                  {rdpSessions.map((session) => (
                    <RdpSessionStatusPanel
                      active={showRdpWorkspace && session.id === activeRdpSession?.id}
                      connection={connectionById.get(session.connectionId) || null}
                      key={session.id}
                      session={session}
                      onEmbeddedViewportRef={setRdpEmbeddedViewportRef}
                      onEmbeddedViewportResize={syncRdpEmbeddedBounds}
                      onClose={() => closeRdpSession(session.id)}
                      onCopyCommand={() => void copyText(rdpSessionCommandText(session))}
                      onCopyRdpFile={() => void copyText(rdpSessionFileText(session))}
                      onPreview={() => void previewRdpSessionLaunch(session.id)}
                      onRetry={() => retryRdpSession(session.id)}
                    />
                  ))}
                </section>
              </section>

              <section
                className={`terminal-workbench-pane rdp-workbench-pane vnc-workbench-pane ${
                  showVncWorkspace ? "" : "is-hidden"
                }`}
                data-workbench-surface="panel"
                aria-label={tr("workspace.vnc.area")}
                aria-hidden={!showVncWorkspace}
              >
                <nav className="terminal-subtabs rdp-subtabs vnc-subtabs" aria-label={tr("workspace.vnc.tabs")}>
                  <div className="workbench-tab-scroll-list" ref={vncTabScroll.ref}>
                    {activeVncSessions.map((session, index) => (
                      <TabContextMenu
                        key={session.id}
                        actions={[
                          {
                            hint: "Ctrl+F4",
                            label: tr("workspace.tabs.close"),
                            onSelect: () => closeVncSession(session.id),
                          },
                          {
                            disabled: activeVncSessions.length <= 1,
                            label: tr("workspace.tabs.closeOthers"),
                            onSelect: () => closeOtherVncSessions(session.id),
                          },
                          {
                            disabled: index >= activeVncSessions.length - 1,
                            label: tr("workspace.tabs.closeRight"),
                            onSelect: () => closeVncSessionsToRight(session.id),
                          },
                          {
                            disabled: activeVncSessions.length === 0,
                            hint: "Ctrl+K W",
                            label: tr("workspace.tabs.closeAll"),
                            onSelect: () => closeAllVncSessionsForConnection(session.connectionId),
                          },
                        ]}
                      >
                        <div
                          className={`subtab-shell ${session.id === activeVncSession?.id ? "active" : ""}`}
                          data-workbench-tab-active={session.id === activeVncSession?.id ? "true" : undefined}
                        >
                          <button
                            className="subtab rdp-subtab vnc-subtab"
                            type="button"
                            title={`${session.title} · ${vncStatusLabel(session.status)}`}
                            onClick={() => activateVncSession(session)}
                          >
                            <MonitorPlay className="ui-icon" aria-hidden="true" />
                            <span>{session.title}</span>
                          </button>
                          <button
                            className="subtab-close"
                            type="button"
                            aria-label={tr("workspace.closeNamed", { name: session.title })}
                            onClick={() => closeVncSession(session.id)}
                          >
                            <X className="ui-icon" aria-hidden="true" />
                          </button>
                        </div>
                      </TabContextMenu>
                    ))}
                  </div>
                  {renderWorkbenchTabScrollControls(vncTabScroll, tr("workspace.vnc.tabs"))}
                  <div className="terminal-subtab-actions">
                    <Tooltip label={rightPaneCollapsed ? tr("workspace.right.expand") : tr("workspace.right.collapse")}>
                      <button
                        className="add-subtab terminal-subtab-panel-toggle"
                        type="button"
                        aria-label={rightPaneCollapsed ? tr("workspace.right.expand") : tr("workspace.right.collapse")}
                        aria-expanded={!rightPaneCollapsed}
                        onClick={() => setRightPaneCollapsed((collapsed) => !collapsed)}
                      >
                        {rightPaneCollapsed ? (
                          <PanelRightOpen className="ui-icon" aria-hidden="true" />
                        ) : (
                          <PanelRightClose className="ui-icon" aria-hidden="true" />
                        )}
                      </button>
                    </Tooltip>
                  </div>
                </nav>

                <section className="rdp-stack vnc-stack" aria-label={tr("workspace.vnc.state")}>
                  {vncSessions.map((session) => (
                    <VncSessionStatusPanel
                      active={showVncWorkspace && session.id === activeVncSession?.id}
                      connection={connectionById.get(session.connectionId) || null}
                      key={session.id}
                      session={session}
                      onClose={() => closeVncSession(session.id)}
                      onCopyCommand={() => void copyText(vncSessionCommandText(session))}
                      onMessage={(message) =>
                        updateVncSession(session.id, (current) => ({
                          ...current,
                          message,
                        }))
                      }
                      onError={(message) => {
                        if (session.result?.session_id) {
                          void vncCloseSession(session.result.session_id).catch(() => undefined);
                        }
                        updateVncSession(session.id, (current) => ({
                          ...current,
                          error: message,
                          message: null,
                          status: "error",
                        }));
                      }}
                      onPreview={() => void previewVncSessionLaunch(session.id)}
                      onRetry={() => retryVncSession(session.id)}
                    />
                  ))}
                </section>
              </section>

            </section>
          ) : null}
          {showMultiExecBar ? (
            <MultiExecBar error={terminalSplitSyncError} mode={multiExecMode}
              selectedKeys={multiExecTargets} targets={multiExecRuntimeTargets}
              onClose={toggleMultiExecBar} onStop={() => setTerminalSplitSyncState(false)}
              onStartLive={() => setTerminalSplitSyncState(true)} onToggleTarget={setTerminalSplitSyncParticipant}
              onOpenCommandSender={() => {
                if (!showTerminalWorkbench || isUnifiedFileTabActive) {
                  const target = selectedCommandTargets[0] || commandSenderTargets[0];
                  if (target) activateCommandSenderTarget(target);
                }
                openCommandSenderAndPrepareTargets();
              }} />
          ) : null}
        </section>

        {showWorkspaceToolPane && !rightPaneCollapsed ? (
          <div
            className="pane-resizer right-pane-resizer"
            role="separator"
            aria-label={tr("workspace.layout.resizeRight")}
            aria-orientation="vertical"
            aria-valuemin={minRightPaneWidth}
            aria-valuemax={maxRightPaneWidth}
            aria-valuenow={rightPaneWidth}
            tabIndex={0}
            onDoubleClick={() => setRightPaneWidth(defaultRightPaneWidth)}
            onKeyDown={(event) => handlePaneResizeKeyDown("right", event)}
            onPointerDown={(event) => handlePaneResizeStart("right", event)}
          />
        ) : null}

        {showWorkspaceToolPane ? (
          <Suspense
            fallback={
              <aside className="tool-pane" aria-label={tr("workspace.right.aria")}>
                <p className="file-panel-empty">{tr("workspace.loading.tools")}</p>
              </aside>
            }
          >
            {showingRdp || showingVnc ? (
              <RemoteFilePanel
                active={!rightPaneCollapsed}
                activeTool={rightTool}
                availableTools={["tools"]}
                connection={remoteFileConnection}
                key={remoteFilePanelKey}
                nativeDropTargetPath={nativeFileDropTargetPath}
                onToolChange={setRightTool}
                toolsPanel={
                  showingRdp ? (
                    <RdpSessionToolPanel
                      connection={activeConnection}
                      session={activeRdpSession}
                      onCopyCommand={(session) => void copyText(rdpSessionCommandText(session))}
                      onCopyRdpFile={(session) => void copyText(rdpSessionFileText(session))}
                      onPreview={(session) => void previewRdpSessionLaunch(session.id)}
                      onRetry={(session) => retryRdpSession(session.id)}
                    />
                  ) : (
                    <VncSessionToolPanel
                      connection={activeConnection}
                      session={activeVncSession}
                      onCopyCommand={(session) => void copyText(vncSessionCommandText(session))}
                      onPreview={(session) => void previewVncSessionLaunch(session.id)}
                      onRetry={(session) => retryVncSession(session.id)}
                    />
                  )
                }
              />
            ) : showingLocalTerminal ? (
              <RemoteFilePanel
                active={!rightPaneCollapsed}
                activeTool={rightTool}
                availableTools={["commands", "ai"]}
                connection={null}
                commandPanel={renderCommandLibraryPanel()}
                aiPanel={aiAssistantPanelNode}
                onToolChange={setRightTool}
              />
            ) : (
              <div className="remote-file-panel-stack">
                {sshRemoteFilePanelStack.length > 0 ? (
                  sshRemoteFilePanelStack.map((panel) => {
                    const panelConnection = connectionById.get(panel.connectionId) || null;

                    return (
                      <RemoteFilePanel
                        active={panel.active}
                        activeTool={rightTool}
                        availableTools={["monitor", "commands", "tools", "tunnels", "ai"]}
                        connection={panelConnection}
                        key={panel.key}
                        monitorPanel={
                          panel.active && rightTool === "monitor" ? (
                            <Suspense fallback={<p className="file-panel-empty">{tr("workspace.loading.monitor")}</p>}>
                              <MonitorPanel active connection={panelConnection} />
                            </Suspense>
                          ) : null
                        }
                        aiPanel={panel.active ? aiAssistantPanelNode : null}
                        commandPanel={panel.active && rightTool === "commands" ? renderCommandLibraryPanel() : null}
                        tunnelPanel={
                          panel.active && rightTool === "tunnels" ? (
                            <Suspense fallback={<p className="file-panel-empty">{tr("workspace.loading.tunnels")}</p>}>
                              <TunnelPanel
                                activeConnectionId={panel.connectionId}
                                connections={connections.filter(isSshConnection)}
                              />
                            </Suspense>
                          ) : null
                        }
                        toolsPanel={
                          panel.renderDockerTools ? (
                            <Suspense fallback={<p className="file-panel-empty">{tr("workspace.loading.docker")}</p>}>
                              <DockerToolPanel
                                active={panel.active && rightTool === "tools"}
                                activeConnectionId={panel.connectionId}
                                connection={panelConnection}
                                connections={connections}
                                onCopyText={copyText}
                                onOpenContainerTerminal={openDockerContainerTerminal}
                              />
                            </Suspense>
                          ) : null
                        }
                        onToolChange={setRightTool}
                      />
                    );
                  })
                ) : (
                  <RemoteFilePanel
                    active={!rightPaneCollapsed}
                    activeTool={rightTool}
                    availableTools={["monitor", "commands", "tools", "tunnels", "ai"]}
                    connection={remoteFileConnection}
                    aiPanel={aiAssistantPanelNode}
                    tunnelPanel={
                      rightTool === "tunnels" && isSshConnection(activeConnection) ? (
                        <Suspense fallback={<p className="file-panel-empty">{tr("workspace.loading.tunnels")}</p>}>
                          <TunnelPanel
                            activeConnectionId={activeConnection.id}
                            connections={connections.filter(isSshConnection)}
                          />
                        </Suspense>
                      ) : null
                    }
                    onToolChange={setRightTool}
                  />
                )}
              </div>
            )}
          </Suspense>
        ) : null}

        {dialogOpen && LoadedConnectionDialog ? (
          <LoadedConnectionDialog
            allowPasswordReveal={effectiveAllowPasswordReveal}
            connection={editingConnection}
            connections={connections}
            credentials={credentials}
            defaultGroup={pendingConnectionGroupId}
            duplicate={duplicatingConnection}
            groups={connectionGroupCatalog.groups}
            initialProtocol={pendingConnectionProtocol}
            onClose={closeConnectionDialog}
            onDelete={deleteConnection}
            onManageCredentials={openCredentialSettings}
            onSave={saveConnectionFromDialog}
            onTest={testConnectionFromDialog}
            onTrustHostKey={knownHostTrust}
            open={dialogOpen}
          />
        ) : dialogOpen ? (
          <Suspense fallback={null}>
            <ConnectionDialog
              allowPasswordReveal={effectiveAllowPasswordReveal}
              connection={editingConnection}
              connections={connections}
              credentials={credentials}
              defaultGroup={pendingConnectionGroupId}
              duplicate={duplicatingConnection}
              groups={connectionGroupCatalog.groups}
              initialProtocol={pendingConnectionProtocol}
              onClose={closeConnectionDialog}
              onDelete={deleteConnection}
              onManageCredentials={openCredentialSettings}
              onSave={saveConnectionFromDialog}
              onTest={testConnectionFromDialog}
              onTrustHostKey={knownHostTrust}
              open={dialogOpen}
            />
          </Suspense>
        ) : null}
      </main>

      {connectionTransferMode ? (
        <Suspense fallback={null}>
          <ConnectionTransferDialog
            mode={connectionTransferMode}
            open
            onImported={async () => {
              await Promise.all([reload(), reloadCredentials()]);
            }}
            onOpenChange={(open) => {
              if (!open) {
                setConnectionTransferMode(null);
              }
            }}
          />
        </Suspense>
      ) : null}

      {connectionSearchOpen ? (
        <Suspense fallback={<ConnectionSearchDialogFallback />}>
          <ConnectionSearchDialog
            activeConnectionId={activeConnectionId}
            connections={connections}
            open={connectionSearchOpen}
            query={connectionSearchQuery}
            onOpenChange={setConnectionSearchOpen}
            onQueryChange={setConnectionSearchQuery}
            onQuickConnect={(target) => void openQuickConnect(target)}
            onSelectConnection={openConnectionSession}
          />
        </Suspense>
      ) : null}

      <Dialog.Root
        open={commandSnippetDialogOpen}
        onOpenChange={(open) => {
          setCommandSnippetDialogOpen(open);
          if (!open) {
            setCommandSnippetFormError(null);
          }
        }}
      >
        <Dialog.Portal>
          <Dialog.Overlay className="dialog-backdrop" />
          <Dialog.Content
            className="command-snippet-dialog"
            onInteractOutside={(event) => event.preventDefault()}
            onPointerDownOutside={(event) => event.preventDefault()}
          >
            <header className="command-snippet-dialog-head">
              <div>
                <Dialog.Title asChild>
                  <h2>{commandSnippetDraft.id ? tr("workspace.snippet.edit") : tr("workspace.snippet.saveTitle")}</h2>
                </Dialog.Title>
                <Dialog.Description className="dialog-subtitle">
                  {tr("workspace.snippet.description")}
                </Dialog.Description>
              </div>
              <Dialog.Close asChild>
                <button className="icon-button" type="button" aria-label={tr("workspace.snippet.close")}>
                  <X className="ui-icon" aria-hidden="true" />
                </button>
              </Dialog.Close>
            </header>

            <div className="command-snippet-dialog-body">
              <form className="command-snippet-form" onSubmit={(event) => void saveCommandSnippetDraft(event)}>
                <label className="command-snippet-field">
                  <span>{tr("workspace.snippet.folder")}</span>
                  <div className="command-snippet-group-control">
                    <AppSelect
                      ariaLabel={tr("workspace.snippet.folderAria")}
                      className="command-snippet-group-select"
                      menuMinWidth={180}
                      options={commandSnippetGroupOptions}
                      value={commandSnippetDraft.group}
                      onChange={(group) =>
                        setCommandSnippetDraft((draft) => ({
                          ...draft,
                          group,
                        }))
                      }
                    />
                    <Tooltip label={tr("workspace.snippet.newGroup")}>
                      <button
                        className="command-snippet-group-add"
                        type="button"
                        aria-label={tr("workspace.snippet.newGroupAria")}
                        onClick={() => openCommandSnippetGroupCreateDialog(true)}
                      >
                        <Plus className="ui-icon" aria-hidden="true" />
                      </button>
                    </Tooltip>
                  </div>
                </label>
                <label className="command-snippet-field">
                  <span>{tr("workspace.snippet.title")}</span>
                  <input
                    value={commandSnippetDraft.title}
                    onChange={(event) => {
                      const value = event.target?.value;
                      if (value !== undefined) {
                        setCommandSnippetDraft((draft) => ({
                          ...draft,
                          title: value,
                        }));
                      }
                    }}
                  />
                </label>
                <label className="command-snippet-field command-snippet-command-field">
                  <span>{tr("workspace.snippet.command")}</span>
                  <textarea
                    value={commandSnippetDraft.command}
                    spellCheck={false}
                    onChange={(event) => {
                      const value = event.target?.value;
                      if (value !== undefined) {
                        setCommandSnippetDraft((draft) => ({
                          ...draft,
                          command: value,
                        }));
                      }
                    }}
                  />
                </label>
                <label className="command-snippet-field">
                  <span>{tr("workspace.snippet.descriptionField")}</span>
                  <input
                    value={commandSnippetDraft.description}
                    onChange={(event) => {
                      const value = event.target?.value;
                      if (value !== undefined) {
                        setCommandSnippetDraft((draft) => ({
                          ...draft,
                          description: value,
                        }));
                      }
                    }}
                  />
                </label>
                <label className="command-snippet-field">
                  <span>{tr("workspace.snippet.tags")}</span>
                  <input
                    value={commandSnippetDraft.tagsText}
                    placeholder={tr("workspace.snippet.tagsPlaceholder")}
                    onChange={(event) => {
                      const value = event.target?.value;
                      if (value !== undefined) {
                        setCommandSnippetDraft((draft) => ({
                          ...draft,
                          tagsText: value,
                        }));
                      }
                    }}
                  />
                </label>
                <label className="command-snippet-favorite">
                  <input
                    type="checkbox"
                    checked={commandSnippetDraft.favorite}
                    onChange={(event) => {
                      const checked = event.target?.checked;
                      if (checked !== undefined) {
                        setCommandSnippetDraft((draft) => ({
                          ...draft,
                          favorite: checked,
                        }));
                      }
                    }}
                  />
                  <Star className="ui-icon" aria-hidden="true" />
                  <span>{tr("workspace.snippet.favorite")}</span>
                </label>
                {commandSnippetFormError ? (
                  <p className="command-snippet-form-error">{commandSnippetFormError}</p>
                ) : null}
                <footer className="command-snippet-form-actions">
                  <Dialog.Close asChild>
                    <button className="secondary-button" type="button">{tr("workspace.snippet.cancel")}</button>
                  </Dialog.Close>
                  <button className="primary-button" type="submit">
                    <CheckCircle2 className="ui-icon" aria-hidden="true" />
                    <span>{tr("workspace.snippet.save")}</span>
                  </button>
                </footer>
              </form>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      <Dialog.Root
        open={Boolean(commandSnippetGroupDialog)}
        onOpenChange={(open) => {
          if (!open) {
            setCommandSnippetGroupDialog(null);
          }
        }}
      >
        <Dialog.Portal>
          <Dialog.Overlay className="dialog-backdrop" />
          <Dialog.Content
            className="command-snippet-group-dialog"
            onInteractOutside={(event) => event.preventDefault()}
            onPointerDownOutside={(event) => event.preventDefault()}
          >
            <header className="command-snippet-dialog-head">
              <div>
                <Dialog.Title asChild>
                  <h2>
                    {commandSnippetGroupDialog?.mode === "rename"
                      ? tr("workspace.snippet.groupRename")
                      : tr("workspace.snippet.groupNew")}
                  </h2>
                </Dialog.Title>
                <Dialog.Description className="dialog-subtitle">
                  {tr("workspace.snippet.groupDescription")}
                </Dialog.Description>
              </div>
              <Dialog.Close asChild>
                <button className="icon-button" type="button" aria-label={tr("workspace.snippet.groupClose")}>
                  <X className="ui-icon" aria-hidden="true" />
                </button>
              </Dialog.Close>
            </header>

            <form className="command-snippet-group-form" onSubmit={(event) => void saveCommandSnippetGroupDialog(event)}>
              <label className="command-snippet-field">
                <span>{tr("workspace.snippet.groupName")}</span>
                <input
                  autoFocus
                  value={commandSnippetGroupDialog?.value || ""}
                  onChange={(event) => {
                    const value = event.target?.value;
                    if (value !== undefined) {
                      setCommandSnippetGroupDialog((state) =>
                        state ? { ...state, error: null, value } : state,
                      );
                    }
                  }}
                />
              </label>
              {commandSnippetGroupDialog?.error ? (
                <p className="command-snippet-form-error">{commandSnippetGroupDialog.error}</p>
              ) : null}
              <footer className="command-snippet-form-actions">
                <Dialog.Close asChild>
                  <button className="secondary-button" type="button">{tr("workspace.snippet.cancel")}</button>
                </Dialog.Close>
                <button className="primary-button" type="submit">
                  <CheckCircle2 className="ui-icon" aria-hidden="true" />
                  <span>{tr("workspace.snippet.groupSave")}</span>
                </button>
              </footer>
            </form>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      <ConfirmDialog
        confirmLabel={tr("workspace.delete")}
        description={
          pendingCommandSnippetDelete
            ? tr("workspace.snippet.deleteDescription", { name: pendingCommandSnippetDelete.title })
            : ""
        }
        open={Boolean(pendingCommandSnippetDelete)}
        title={tr("workspace.snippet.deleteTitle")}
        onConfirm={confirmDeleteCommandSnippet}
        onOpenChange={(open) => {
          if (!open) {
            setPendingCommandSnippetDelete(null);
          }
        }}
      />

      <ConfirmDialog
        confirmLabel={tr("workspace.delete")}
        description={
          pendingCommandSnippetGroupDelete
            ? tr("workspace.snippet.deleteGroupDescription", { name: pendingCommandSnippetGroupDelete, count: commandSnippets
                .filter(
                  (snippet) =>
                    normalizeCommandSnippetGroupValue(snippet.group) ===
                    normalizeCommandSnippetGroupValue(pendingCommandSnippetGroupDelete),
                )
                .length })
            : ""
        }
        open={Boolean(pendingCommandSnippetGroupDelete)}
        title={tr("workspace.snippet.deleteGroupTitle")}
        onConfirm={confirmDeleteCommandSnippetGroup}
        onOpenChange={(open) => {
          if (!open) {
            setPendingCommandSnippetGroupDelete(null);
          }
        }}
      />

      <ConfirmDialog
        confirmLabel={tr("workspace.delete")}
        description={
          pendingCommandHistoryDelete
            ? tr("workspace.history.deleteDescription", { command: truncateCommandLabel(pendingCommandHistoryDelete.command, 48) })
            : ""
        }
        open={Boolean(pendingCommandHistoryDelete)}
        title={tr("workspace.history.deleteTitle")}
        onConfirm={confirmDeleteCommandHistory}
        onOpenChange={(open) => {
          if (!open) {
            setPendingCommandHistoryDelete(null);
          }
        }}
      />

      <ConfirmDialog
        confirmLabel={tr("workspace.clear")}
        description={tr("workspace.history.clearDescription")}
        open={commandHistoryClearOpen}
        title={tr("workspace.history.clearTitle")}
        onConfirm={confirmClearCommandHistory}
        onOpenChange={setCommandHistoryClearOpen}
      />

      <ConfirmDialog
        confirmLabel={tr("workspace.discard")}
        description={
          pendingRemoteFileCloseTab
            ? tr("workspace.file.closeModifiedDescription", { name: pendingRemoteFileCloseTab.name })
            : ""
        }
        open={Boolean(pendingRemoteFileCloseTab)}
        title={tr("workspace.file.closeModifiedTitle")}
        onConfirm={() => {
          if (pendingRemoteFileCloseTab) {
            closeRemoteFileTabNow(pendingRemoteFileCloseTab.id);
          }
        }}
        onOpenChange={(open) => {
          if (!open) {
            setPendingRemoteFileCloseId(null);
          }
        }}
      />

      <ConfirmDialog
        cancelLabel={t("common.cancel")}
        confirmLabel={closeConfirmCopy?.confirmLabel ?? ""}
        description={closeConfirmCopy?.description ?? ""}
        open={Boolean(closeRequestController.pending)}
        title={closeConfirmCopy?.title ?? ""}
        onConfirm={closeRequestController.confirm}
        onOpenChange={(open) => {
          if (!open) {
            closeRequestController.cancel();
          }
        }}
      />

      <ConfirmDialog
        confirmLabel={tr("workspace.delete")}
        description={
          remoteFileDeleteTarget
            ? remoteFileDeleteDescription(
                remoteFileDeleteEntries,
                remoteFileDeleteAffectedTabs.length,
                remoteFileDeleteDirtyCount,
              )
            : ""
        }
        open={Boolean(remoteFileDeleteTarget)}
        title={remoteFileDeleteEntries.length > 1 ? tr("workspace.file.deleteSelectedTitle") : tr("workspace.file.deleteTitle")}
        onConfirm={confirmRemoteFileDelete}
        onOpenChange={(open) => {
          if (!open) {
            setRemoteFileDeleteTarget(null);
          }
        }}
      />

      <Dialog.Root
        open={Boolean(pendingRemoteFileConflictTab)}
        onOpenChange={(open) => {
          if (!open) {
            setPendingRemoteFileConflictId(null);
          }
        }}
      >
        <Dialog.Portal>
          <Dialog.Overlay className="dialog-backdrop confirm-backdrop" />
          <Dialog.Content
            className="confirm-dialog remote-file-conflict"
            onInteractOutside={(event) => event.preventDefault()}
            onPointerDownOutside={(event) => event.preventDefault()}
          >
            <div className="confirm-dialog-icon" aria-hidden="true">
              <RefreshCw className="ui-icon" />
            </div>
            <div className="confirm-dialog-copy">
              <Dialog.Title className="confirm-dialog-title">{tr("workspace.file.conflictTitle")}</Dialog.Title>
              <Dialog.Description className="confirm-dialog-description">
                {pendingRemoteFileConflictTab
                  ? tr("workspace.file.conflictDescription", { name: pendingRemoteFileConflictTab.name })
                  : ""}
              </Dialog.Description>
              {pendingRemoteFileConflictTab?.error ? (
                <p className="remote-file-dialog-error">{pendingRemoteFileConflictTab.error}</p>
              ) : null}
            </div>
            <footer className="confirm-dialog-actions remote-file-conflict-actions">
              <button
                type="button"
                onClick={() => {
                  if (pendingRemoteFileConflictTab) {
                    reloadRemoteFile(pendingRemoteFileConflictTab.id);
                  }
                  setPendingRemoteFileConflictId(null);
                }}
              >
                {tr("workspace.file.reload")}
              </button>
              <button
                className="danger-button"
                type="button"
                onClick={() => {
                  if (pendingRemoteFileConflictTab) {
                    saveRemoteFile(pendingRemoteFileConflictTab.id, true);
                  }
                  setPendingRemoteFileConflictId(null);
                }}
              >
                {tr("workspace.file.overwrite")}
              </button>
              <Dialog.Close asChild>
                <button type="button">{tr("workspace.file.cancel")}</button>
              </Dialog.Close>
            </footer>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      <Dialog.Root
        open={Boolean(remoteFileTextAction)}
        onOpenChange={(open) => {
          if (!open) {
            setRemoteFileTextAction(null);
            setRemoteFileTextValue("");
            setRemoteFileTextError(null);
          }
        }}
      >
        <Dialog.Portal>
          <Dialog.Overlay className="dialog-backdrop" />
          <Dialog.Content
            asChild
            onInteractOutside={(event) => event.preventDefault()}
            onPointerDownOutside={(event) => event.preventDefault()}
          >
            <form className="remote-file-text-dialog" onSubmit={submitRemoteFileTextAction}>
              <header className="dialog-head">
                <div className="dialog-title-group">
                  <Dialog.Title asChild>
                    <strong>{remoteFileTextAction ? remoteFileActionTitle(remoteFileTextAction) : tr("workspace.file.dialogFallback")}</strong>
                  </Dialog.Title>
                  <Dialog.Description className="dialog-subtitle">
                    {remoteFileTextAction ? remoteFileActionDescription(remoteFileTextAction) : ""}
                  </Dialog.Description>
                </div>
                <Dialog.Close asChild>
                  <button className="icon-button dialog-close-button" type="button" aria-label={tr("workspace.file.close")}>
                    <X className="ui-icon" aria-hidden="true" />
                  </button>
                </Dialog.Close>
              </header>
              <div className="dialog-body">
                <label className="remote-file-name-field">
                  <span>{tr("workspace.file.name")}</span>
                  <input
                    autoFocus
                    spellCheck={false}
                    value={remoteFileTextValue}
                    onChange={(event) => setRemoteFileTextValue(event.target.value)}
                  />
                </label>
                {remoteFileTextError ? (
                  <p className="remote-file-dialog-error">{remoteFileTextError}</p>
                ) : null}
              </div>
              <footer className="dialog-actions remote-file-text-actions">
                <span />
                <Dialog.Close asChild>
                  <button type="button">{tr("workspace.file.cancel")}</button>
                </Dialog.Close>
                <button className="primary-button" type="submit">
                  {tr("workspace.file.confirm")}
                </button>
              </footer>
            </form>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      <Dialog.Root
        open={Boolean(remoteFileProperties)}
        onOpenChange={(open) => {
          if (!open) {
            setRemoteFileProperties(null);
          }
        }}
      >
        <Dialog.Portal>
          <Dialog.Overlay className="dialog-backdrop" />
          <Dialog.Content className="remote-file-properties-dialog">
            <header className="dialog-head">
              <div className="dialog-title-group">
                <Dialog.Title asChild>
                  <strong>{tr("workspace.file.properties")}</strong>
                </Dialog.Title>
                <Dialog.Description className="dialog-subtitle">
                  {remoteFileProperties?.entry.path || ""}
                </Dialog.Description>
              </div>
              <Dialog.Close asChild>
                <button className="icon-button dialog-close-button" type="button" aria-label={tr("workspace.file.close")}>
                  <X className="ui-icon" aria-hidden="true" />
                </button>
              </Dialog.Close>
            </header>
            <div className="dialog-body">
              {remoteFileProperties?.loading ? (
                <p className="file-panel-empty">{tr("workspace.file.loadingProperties")}</p>
              ) : remoteFileProperties?.error ? (
                <p className="remote-file-dialog-error">{remoteFileProperties.error}</p>
              ) : remoteFileProperties?.metadata ? (
                <RemoteFilePropertiesTable metadata={remoteFileProperties.metadata} />
              ) : null}
            </div>
            <footer className="dialog-actions remote-file-text-actions">
              <span />
              <button
                type="button"
                onClick={() => {
                  if (remoteFileProperties?.entry.path) {
                    copyRemotePath(remoteFileProperties.entry.path);
                  }
                }}
              >
                {tr("workspace.file.copyPath")}
              </button>
              <Dialog.Close asChild>
                <button className="primary-button" type="button">{tr("workspace.file.close")}</button>
              </Dialog.Close>
            </footer>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      <Dialog.Root
        open={Boolean(transferConflictPrompt)}
        onOpenChange={(open) => {
          if (!open) {
            settleTransferConflictPrompt(null);
          }
        }}
      >
        <Dialog.Portal>
          <Dialog.Overlay className="dialog-backdrop confirm-backdrop" />
          <Dialog.Content
            className="confirm-dialog transfer-conflict-dialog"
            onInteractOutside={(event) => event.preventDefault()}
            onPointerDownOutside={(event) => event.preventDefault()}
          >
            <div className="confirm-dialog-icon" aria-hidden="true">
              <RefreshCw className="ui-icon" />
            </div>
            <div className="confirm-dialog-copy">
              <Dialog.Title className="confirm-dialog-title">{tr("workspace.file.conflictPolicy")}</Dialog.Title>
              <Dialog.Description className="confirm-dialog-description">
                {transferConflictPrompt ? transferConflictPrompt.description : ""}
              </Dialog.Description>
            </div>
            <footer className="confirm-dialog-actions transfer-conflict-actions">
              <button type="button" onClick={() => settleTransferConflictPrompt("rename")}>
                {tr("workspace.file.rename")}
              </button>
              <button type="button" onClick={() => settleTransferConflictPrompt("skip")}>
                {tr("workspace.file.skip")}
              </button>
              <button className="danger-button" type="button" onClick={() => settleTransferConflictPrompt("overwrite")}>
                {tr("workspace.file.overwriteAction")}
              </button>
              <button type="button" onClick={() => settleTransferConflictPrompt(null)}>
                {tr("workspace.file.cancel")}
              </button>
            </footer>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      {shouldRenderSettingsView ? (
        <Suspense fallback={<SettingsViewFallback hidden={activeView !== "settings"} />}>
          <SettingsViewComponent
            appUpdate={appUpdate}
            activeSection={settingsSectionRequest}
            activeSectionRequestKey={settingsSectionRequestKey}
            connections={connections}
            credentials={credentials}
            credentialError={credentialError}
            credentialLoading={credentialLoading}
            effectiveWindowMaterial={effectiveWindowMaterial}
            hidden={activeView !== "settings"}
            secretVaultBusy={secretVault.unlocking}
            secretVaultError={secretVault.error}
            settings={settings}
            supportedWindowMaterials={supportedWindowMaterials}
            onDeleteCredential={deleteCredentialFromSettings}
            onDisableMasterPassword={async () => {
              const nextStatus = await secretVault.disableMasterPassword();
              return Boolean(nextStatus?.unlocked);
            }}
            onEnableMasterPassword={async (masterPassword) => {
              const nextStatus = await secretVault.enableMasterPassword(masterPassword);
              return Boolean(nextStatus?.unlocked);
            }}
            onUnlockSecuritySettings={async (masterPassword) => {
              const nextStatus = await secretVault.unlock(masterPassword);
              return Boolean(nextStatus?.unlocked);
            }}
            onReset={reset}
            onReturnWorkspace={returnFromSettings}
            onSaveCredential={saveCredentialFromSettings}
            onUpdateAppearance={updateAppearance}
            onUpdateBasic={updateBasic}
            onUpdateCommand={updateCommand}
            onUpdateFileTransfer={updateFileTransfer}
            onUpdateLocalTerminal={updateLocalTerminal}
            onUpdateSecurity={updateSecurity}
            onUpdateShortcuts={updateShortcuts}
            onUpdateTerminalTheme={updateTerminalTheme}
          />
        </Suspense>
      ) : null}
    </div>
  );

  function closeConnectionDialog() {
    setDialogOpen(false);
    setPendingConnectionGroupId(null);
    setPendingConnectionProtocol(null);
    setDuplicatingConnection(false);
  }
}

function ConnectionSearchDialogFallback() {
  return (
    <Dialog.Root open>
      <Dialog.Overlay className="dialog-backdrop connection-search-backdrop" />
      <Dialog.Content className="connection-search-dialog" aria-label={tr("workspace.loading.connectionSearch")}>
        <header className="connection-search-head">
          <div>
            <Dialog.Title className="connection-search-title">{tr("workspace.loading.connectionSearchTitle")}</Dialog.Title>
            <Dialog.Description className="sr-only">{tr("workspace.loading.connectionSearchDescription")}</Dialog.Description>
          </div>
        </header>
        <p className="file-panel-empty">{tr("workspace.loading.connectionSearchBody")}</p>
      </Dialog.Content>
    </Dialog.Root>
  );
}

function SettingsViewFallback({ hidden }: { hidden: boolean }) {
  return (
    <section className="settings-view" hidden={hidden} aria-label={tr("workspace.loading.settings")} aria-hidden={hidden}>
      <aside className="settings-sidebar app-sidebar" aria-label={tr("workspace.loading.settingsCategories")} />
      <main className="settings-content">
        <section className="settings-page-section">
          <p className="file-panel-empty">{tr("workspace.loading.settingsBody")}</p>
        </section>
      </main>
    </section>
  );
}

function RemoteEditorLoadingFallback() {
  return (
    <div className="remote-editor-loading" aria-live="polite" aria-label={tr("workspace.loading.editorAria")}>
      <div>
        <Loader2 className="ui-icon spin" aria-hidden="true" />
        <span>{tr("workspace.loading.editor")}</span>
      </div>
    </div>
  );
}

function removeConnectionRecordEntries<T>(
  records: Record<string, T>,
  closingConnectionIds: Set<string>,
) {
  let changed = false;
  const nextRecords: Record<string, T> = {};

  Object.entries(records).forEach(([connectionId, value]) => {
    if (closingConnectionIds.has(connectionId)) {
      changed = true;
      return;
    }
    nextRecords[connectionId] = value;
  });

  return changed ? nextRecords : records;
}

function RdpSessionStatusPanel({
  active,
  connection,
  session,
  onEmbeddedViewportRef,
  onEmbeddedViewportResize,
  onClose,
  onCopyCommand,
  onCopyRdpFile,
  onPreview,
  onRetry,
}: {
  active: boolean;
  connection: ConnectionProfile | null;
  session: RdpSessionTab;
  onEmbeddedViewportRef: (sessionId: string, node: HTMLDivElement | null) => void;
  onEmbeddedViewportResize: (
    session: RdpSessionTab,
    bounds: RdpEmbeddedBounds | null,
    active: boolean,
  ) => void;
  onClose: () => void;
  onCopyCommand: () => void;
  onCopyRdpFile: () => void;
  onPreview: () => void;
  onRetry: () => void;
}) {
  const embeddedViewportRef = useRef<HTMLDivElement | null>(null);
  const hasCommand = rdpSessionHasCommandText(session);
  const hasRdpFile = rdpSessionHasRdpFileText(session);
  const runner = session.result?.runner || session.preview?.runner || connection?.rdp?.runner.preferred_runner || null;
  const primaryDetail = rdpSessionPrimaryDetail(session);
  const showEmbeddedViewport = session.status === "embedded";
  const setEmbeddedViewport = useCallback(
    (node: HTMLDivElement | null) => {
      embeddedViewportRef.current = node;
      onEmbeddedViewportRef(session.id, node);
    },
    [onEmbeddedViewportRef, session.id],
  );

  useLayoutEffect(() => {
    if (!session.result?.embedded) {
      return undefined;
    }

    const emitBounds = () => {
      const bounds = active
        ? measureRdpEmbeddedViewport(embeddedViewportRef.current)
        : null;
      onEmbeddedViewportResize(session, bounds, active);
    };
    const viewport = embeddedViewportRef.current;
    const observer =
      viewport && typeof ResizeObserver !== "undefined"
        ? new ResizeObserver(emitBounds)
        : null;
    if (observer && viewport) {
      observer.observe(viewport);
    }
    window.addEventListener("resize", emitBounds);
    const frameId = window.requestAnimationFrame(emitBounds);

    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", emitBounds);
      window.cancelAnimationFrame(frameId);
    };
  }, [active, onEmbeddedViewportResize, session]);

  return (
    <section
      className={`rdp-session-status ${session.status} ${active ? "" : "is-hidden"}`}
      aria-label={`${session.title} ${tr("workspace.rdp.state")}`}
      aria-hidden={!active}
    >
      <div className="rdp-session-shell">
        <header className="rdp-session-head">
          <div className="rdp-session-heading">
            <span className="rdp-session-icon" aria-hidden="true">
              {session.status === "launching" ? (
                <Loader2 className="ui-icon spin" />
              ) : session.status === "error" ? (
                <CircleAlert className="ui-icon" />
              ) : session.status === "embedded" || session.status === "native" ? (
                <MonitorPlay className="ui-icon" />
              ) : (
                <ExternalLink className="ui-icon" />
              )}
            </span>
            <span>
              <strong>{connection?.name || session.title}</strong>
              <small>
                {connection ? `RDP · ${formatConnectionAddress(connection)}` : tr("workspace.rdp.connectionUnavailable")}
              </small>
            </span>
          </div>
          <div className="rdp-session-actions">
            <button type="button" onClick={onPreview}>
              <FileText className="ui-icon" aria-hidden="true" />
              <span>{tr("workspace.rdp.preview")}</span>
            </button>
            <button type="button" disabled={!hasCommand} onClick={onCopyCommand}>
              <Clipboard className="ui-icon" aria-hidden="true" />
              <span>{tr("workspace.snippet.command")}</span>
            </button>
            <button type="button" disabled={!hasRdpFile} onClick={onCopyRdpFile}>
              <FileText className="ui-icon" aria-hidden="true" />
              <span>RDP</span>
            </button>
            <button type="button" onClick={onRetry}>
              <RefreshCw className="ui-icon" aria-hidden="true" />
              <span>{tr("workspace.rdp.retry")}</span>
            </button>
            <button type="button" aria-label={tr("workspace.closeNamed", { name: session.title })} onClick={onClose}>
              <X className="ui-icon" aria-hidden="true" />
            </button>
          </div>
        </header>

        <div className="rdp-session-summary">
          <span className={`rdp-session-badge ${session.status}`}>
            {rdpStatusLabel(session.status)}
          </span>
          <span>{formatRdpRunnerKind(runner)}</span>
          {session.result?.process_id ? <span>PID {session.result.process_id.toString()}</span> : null}
          {session.result?.rdp_file_path ? <span title={session.result.rdp_file_path}>{tr("workspace.rdp.tempFile")}</span> : null}
        </div>

        {session.message ? (
          <p className="rdp-session-message">{session.message}</p>
        ) : null}

        {session.error ? (
          <pre className="rdp-session-error" role="alert">{session.error}</pre>
        ) : null}

        {showEmbeddedViewport ? (
          <div className="rdp-embedded-placeholder" ref={setEmbeddedViewport}>
            <MonitorPlay className="ui-icon" aria-hidden="true" />
            <span>
              <strong>
                {session.status === "embedded" ? tr("workspace.rdp.embeddedArea") : tr("workspace.rdp.embeddedPreparing")}
              </strong>
              <small>
                {session.status === "embedded"
                  ? tr("workspace.rdp.nativeOwned")
                  : tr("workspace.rdp.mounting")}
              </small>
            </span>
          </div>
        ) : (
          <div className="rdp-session-preview-grid">
            <section className="rdp-session-preview-card">
              <strong>{primaryDetail.title}</strong>
              <code>{primaryDetail.value}</code>
            </section>
            {session.preview?.rdp_file_content ? (
              <section className="rdp-session-preview-card">
                <strong>{tr("workspace.rdp.generated")}</strong>
                <pre>{session.preview.rdp_file_content}</pre>
              </section>
            ) : null}
            {session.preview?.warnings.length ? (
              <section className="rdp-session-preview-card subtle">
                <strong>{tr("workspace.rdp.hint")}</strong>
                {session.preview.warnings.map((warning) => (
                  <small key={warning}>{warning}</small>
                ))}
              </section>
            ) : null}
          </div>
        )}
      </div>
    </section>
  );
}

function RdpSessionToolPanel({
  connection,
  session,
  onCopyCommand,
  onCopyRdpFile,
  onPreview,
  onRetry,
}: {
  connection: ConnectionProfile | null;
  session: RdpSessionTab | null;
  onCopyCommand: (session: RdpSessionTab) => void;
  onCopyRdpFile: (session: RdpSessionTab) => void;
  onPreview: (session: RdpSessionTab) => void;
  onRetry: (session: RdpSessionTab) => void;
}) {
  if (!connection || !session) {
    return (
      <section className="rdp-tool-panel">
        <p className="file-panel-empty">{tr("workspace.rdp.empty")}</p>
      </section>
    );
  }

  const hasCommand = rdpSessionHasCommandText(session);
  const hasRdpFile = rdpSessionHasRdpFileText(session);
  const runner = session.result?.runner || session.preview?.runner || connection.rdp?.runner.preferred_runner || null;
  const display = connection.rdp?.display;
  const resources = connection.rdp?.resources;

  return (
    <section className="rdp-tool-panel" aria-label={tr("workspace.rdp.tools")}>
      <header className="rdp-tool-head">
        <span>
          <strong>{connection.name}</strong>
          <small>{formatConnectionAddress(connection)}</small>
        </span>
        <span className={`rdp-session-badge ${session.status}`}>{rdpStatusLabel(session.status)}</span>
      </header>

      <div className="rdp-tool-actions">
        <button type="button" onClick={() => onPreview(session)}>
          <FileText className="ui-icon" aria-hidden="true" />
          {tr("workspace.rdp.preview")}
        </button>
        <button type="button" disabled={!hasCommand} onClick={() => onCopyCommand(session)}>
          <Clipboard className="ui-icon" aria-hidden="true" />
          {tr("workspace.rdp.copyCommand")}
        </button>
        <button type="button" disabled={!hasRdpFile} onClick={() => onCopyRdpFile(session)}>
          <Clipboard className="ui-icon" aria-hidden="true" />
          {tr("workspace.rdp.copyFile")}
        </button>
        <button type="button" onClick={() => onRetry(session)}>
          <RefreshCw className="ui-icon" aria-hidden="true" />
          {tr("workspace.rdp.retry")}
        </button>
      </div>

      <dl className="rdp-tool-facts">
        <div>
          <dt>Runner</dt>
          <dd>{formatRdpRunnerKind(runner)}</dd>
        </div>
        <div>
          <dt>{tr("workspace.rdp.mode")}</dt>
          <dd>{rdpRenderModeLabel(connection.rdp?.runner.render_mode || "embedded")}</dd>
        </div>
        <div>
          <dt>{tr("workspace.rdp.display")}</dt>
          <dd>{rdpDisplaySummary(display)}</dd>
        </div>
        <div>
          <dt>{tr("workspace.rdp.resources")}</dt>
          <dd>{rdpResourceSummary(resources)}</dd>
        </div>
      </dl>

      {session.error ? (
        <pre className="rdp-tool-error">{session.error}</pre>
      ) : null}

      {session.preview || session.result ? (
        <section className="rdp-tool-preview">
          <strong>{tr("workspace.rdp.launchMaterial")}</strong>
          <code>{rdpSessionCommandText(session) || tr("workspace.rdp.noExternalCommand")}</code>
          {session.preview?.setup_hint || session.result?.setup_hint ? (
            <small>{session.preview?.setup_hint || session.result?.setup_hint}</small>
          ) : null}
          {session.preview?.fallback_reason || session.result?.fallback_reason ? (
            <small>{session.preview?.fallback_reason || session.result?.fallback_reason}</small>
          ) : null}
        </section>
      ) : (
        <p className="rdp-tool-note">{tr("workspace.rdp.toolNote")}</p>
      )}
    </section>
  );
}

function VncSessionStatusPanel({
  active,
  connection,
  session,
  onClose,
  onCopyCommand,
  onError,
  onMessage,
  onPreview,
  onRetry,
}: {
  active: boolean;
  connection: ConnectionProfile | null;
  session: VncSessionTab;
  onClose: () => void;
  onCopyCommand: () => void;
  onError: (message: string) => void;
  onMessage: (message: string) => void;
  onPreview: () => void;
  onRetry: () => void;
}) {
  const hasCommand = vncSessionHasCommandText(session);
  const runner = session.result?.runner || session.preview?.runner || connection?.vnc?.runner.preferred_runner || null;
  const primaryDetail = vncSessionPrimaryDetail(session);
  const config = connection?.vnc || defaultVncConfig;
  const showEmbeddedViewer =
    session.status === "embedded" &&
    Boolean(session.result?.embedded && session.result.websocket_url);

  return (
    <section
      className={`rdp-session-status vnc-session-status ${session.status} ${active ? "" : "is-hidden"}`}
      aria-label={`${session.title} ${tr("workspace.vnc.state")}`}
      aria-hidden={!active}
    >
      <div className="rdp-session-shell vnc-session-shell">
        <header className="rdp-session-head">
          <div className="rdp-session-heading">
            <span className="rdp-session-icon" aria-hidden="true">
              {session.status === "launching" ? (
                <Loader2 className="ui-icon spin" />
              ) : session.status === "error" ? (
                <CircleAlert className="ui-icon" />
              ) : session.status === "embedded" || session.status === "windowed" ? (
                <MonitorPlay className="ui-icon" />
              ) : (
                <ExternalLink className="ui-icon" />
              )}
            </span>
            <span>
              <strong>{connection?.name || session.title}</strong>
              <small>
                {connection ? `VNC · ${formatConnectionAddress(connection)}` : tr("workspace.vnc.connectionUnavailable")}
              </small>
            </span>
          </div>
          <div className="rdp-session-actions">
            <button type="button" onClick={onPreview}>
              <FileText className="ui-icon" aria-hidden="true" />
              <span>{tr("workspace.rdp.preview")}</span>
            </button>
            <button type="button" disabled={!hasCommand} onClick={onCopyCommand}>
              <Clipboard className="ui-icon" aria-hidden="true" />
              <span>{tr("workspace.snippet.command")}</span>
            </button>
            <button type="button" onClick={onRetry}>
              <RefreshCw className="ui-icon" aria-hidden="true" />
              <span>{tr("workspace.rdp.retry")}</span>
            </button>
            <button type="button" aria-label={tr("workspace.closeNamed", { name: session.title })} onClick={onClose}>
              <X className="ui-icon" aria-hidden="true" />
            </button>
          </div>
        </header>

        <div className="rdp-session-summary">
          <span className={`rdp-session-badge ${session.status}`}>
            {vncStatusLabel(session.status)}
          </span>
          <span>{formatVncRunnerKind(runner)}</span>
          {session.result?.process_id ? <span>PID {session.result.process_id.toString()}</span> : null}
          {session.result?.embedded ? <span>{tr("workspace.vnc.bridge")}</span> : null}
        </div>

        {session.message ? (
          <p className="rdp-session-message">{session.message}</p>
        ) : null}

        {session.error ? (
          <pre className="rdp-session-error" role="alert">{session.error}</pre>
        ) : null}

        {showEmbeddedViewer && session.result ? (
          <Suspense fallback={<p className="file-panel-empty">{tr("workspace.vnc.loading")}</p>}>
            <VncViewerSurface
              active={active}
              config={config}
              connection={connectionInfoFromVncProfile(connection)}
              result={session.result}
              onError={onError}
              onMessage={onMessage}
            />
          </Suspense>
        ) : (
          <div className="rdp-session-preview-grid">
            <section className="rdp-session-preview-card">
              <strong>{primaryDetail.title}</strong>
              <code>{primaryDetail.value}</code>
            </section>
            {session.preview?.warnings.length || session.result?.warnings.length ? (
              <section className="rdp-session-preview-card subtle">
                <strong>{tr("workspace.rdp.hint")}</strong>
                {(session.preview?.warnings || session.result?.warnings || []).map((warning) => (
                  <small key={warning}>{warning}</small>
                ))}
              </section>
            ) : null}
          </div>
        )}
      </div>
    </section>
  );
}

function VncSessionToolPanel({
  connection,
  session,
  onCopyCommand,
  onPreview,
  onRetry,
}: {
  connection: ConnectionProfile | null;
  session: VncSessionTab | null;
  onCopyCommand: (session: VncSessionTab) => void;
  onPreview: (session: VncSessionTab) => void;
  onRetry: (session: VncSessionTab) => void;
}) {
  if (!connection || !session) {
    return (
      <section className="rdp-tool-panel vnc-tool-panel">
        <p className="file-panel-empty">{tr("workspace.vnc.empty")}</p>
      </section>
    );
  }

  const hasCommand = vncSessionHasCommandText(session);
  const runner = session.result?.runner || session.preview?.runner || connection.vnc?.runner.preferred_runner || null;
  const display = connection.vnc?.display;
  const input = connection.vnc?.input;

  return (
    <section className="rdp-tool-panel vnc-tool-panel" aria-label={tr("workspace.vnc.tools")}>
      <header className="rdp-tool-head">
        <span>
          <strong>{connection.name}</strong>
          <small>{formatConnectionAddress(connection)}</small>
        </span>
        <span className={`rdp-session-badge ${session.status}`}>{vncStatusLabel(session.status)}</span>
      </header>

      <div className="rdp-tool-actions">
        <button type="button" onClick={() => onPreview(session)}>
          <FileText className="ui-icon" aria-hidden="true" />
          {tr("workspace.rdp.preview")}
        </button>
        <button type="button" disabled={!hasCommand} onClick={() => onCopyCommand(session)}>
          <Clipboard className="ui-icon" aria-hidden="true" />
          {tr("workspace.rdp.copyCommand")}
        </button>
        <button type="button" onClick={() => onRetry(session)}>
          <RefreshCw className="ui-icon" aria-hidden="true" />
          {tr("workspace.rdp.retry")}
        </button>
      </div>

      <dl className="rdp-tool-facts">
        <div>
          <dt>Runner</dt>
          <dd>{formatVncRunnerKind(runner)}</dd>
        </div>
        <div>
          <dt>{tr("workspace.rdp.mode")}</dt>
          <dd>{vncRenderModeLabel(connection.vnc?.runner.render_mode || "embedded")}</dd>
        </div>
        <div>
          <dt>{tr("workspace.rdp.display")}</dt>
          <dd>{vncDisplaySummary(display)}</dd>
        </div>
        <div>
          <dt>{tr("workspace.vnc.input")}</dt>
          <dd>{vncInputSummary(input)}</dd>
        </div>
      </dl>

      {session.error ? (
        <pre className="rdp-tool-error">{session.error}</pre>
      ) : null}

      {session.preview || session.result ? (
        <section className="rdp-tool-preview">
          <strong>{tr("workspace.rdp.launchMaterial")}</strong>
          <code>{vncSessionCommandText(session) || tr("workspace.vnc.noExternalCommand")}</code>
          {session.preview?.setup_hint || session.result?.setup_hint ? (
            <small>{session.preview?.setup_hint || session.result?.setup_hint}</small>
          ) : null}
          {session.preview?.fallback_reason || session.result?.fallback_reason ? (
            <small>{session.preview?.fallback_reason || session.result?.fallback_reason}</small>
          ) : null}
        </section>
      ) : (
        <p className="rdp-tool-note">{tr("workspace.vnc.toolNote")}</p>
      )}
    </section>
  );
}

function LocalTerminalEmptyPanel({
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

function LocalTerminalStatusPanel({
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
  const failed = status === "连接失败";
  const subject = source === "telnet" ? tr("workspace.local.telnetSession") : source === "serial" ? tr("workspace.local.serialSession") : tr("workspace.local.subject");
  const description = profile ? `${profile.name} · ${profile.command}` : title;

  return (
    <section
      className={`terminal-direct-status local-terminal-status ${failed ? "is-error" : "is-loading"} ${
        visible ? "" : "is-hidden"
      } ${className || ""}`}
      aria-label={`${title} ${tr("workspace.local.state")}`}
      aria-hidden={!visible}
      style={style}
      onPointerDown={onPaneFocus}
    >
      <div>
        {failed ? (
          <CircleAlert className="ui-icon" aria-hidden="true" />
        ) : (
          <Loader2 className="ui-icon spin" aria-hidden="true" />
        )}
        <strong>{failed ? tr("workspace.local.openFailed", { subject }) : localTerminalStatusLabel(status)}</strong>
        <span>{description}</span>
        {error ? <small>{error}</small> : null}
        {failed && onRetry ? (
          <div className="local-terminal-status-actions">
            <button className="primary-button" type="button" onClick={onRetry}>
              <RefreshCw className="ui-icon" aria-hidden="true" />
              {tr("workspace.rdp.retry")}
            </button>
            {source === "local" ? <button type="button" onClick={onOpenSettings}>{tr("workspace.local.openSettings")}</button> : null}
          </div>
        ) : null}
      </div>
    </section>
  );
}

function LocalTerminalLauncher({
  disabled,
  loading,
  profiles,
  onOpenProfile,
}: {
  disabled: boolean;
  loading: boolean;
  profiles: LocalTerminalProfile[];
  onOpenProfile: (profile: LocalTerminalProfile) => void;
}) {
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const [open, setOpen] = useState(false);
  const menuDisabled = disabled || loading;

  function chooseProfile(profile: LocalTerminalProfile) {
    setOpen(false);
    onOpenProfile(profile);
    window.requestAnimationFrame(() => triggerRef.current?.focus());
  }

  return (
    <div className="local-terminal-launcher">
      <Tooltip label={loading ? tr("workspace.local.detectingTypes") : tr("workspace.local.chooseType")}>
        <button
          ref={triggerRef}
          className="add-subtab local-terminal-launch-button"
          type="button"
          aria-label={loading ? tr("workspace.local.detectingTypes") : tr("workspace.local.chooseType")}
          aria-expanded={open}
          aria-haspopup="menu"
          disabled={menuDisabled}
          onClick={() => setOpen((value) => !value)}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              setOpen(false);
            }
          }}
        >
          <ChevronDown className="ui-icon" aria-hidden="true" />
        </button>
      </Tooltip>
      <AnchoredSurfacePortal
        anchorRef={triggerRef}
        ariaLabel={tr("workspace.local.chooseTypeAria")}
        className="local-terminal-profile-menu dropdown-menu-content"
        desiredHeight={420}
        minHeight={180}
        open={open}
        role="menu"
        width={320}
        onOpenChange={setOpen}
      >
        {profiles.map((profile, index) => (
          <button
            className="local-terminal-profile-menu-item dropdown-menu-item"
            key={profile.id}
            type="button"
            role="menuitem"
            onClick={() => chooseProfile(profile)}
          >
            <span className="local-terminal-menu-label">
              <LocalTerminalIcon className="ui-icon" kind={profile.kind} title={profile.name} />
              <span>{profile.name}</span>
            </span>
            {index < 9 ? (
              <span className="local-terminal-menu-shortcut">
                Ctrl+Shift+{(index + 1).toString()}
              </span>
            ) : null}
          </button>
        ))}
      </AnchoredSurfacePortal>
    </div>
  );
}

function DirectTerminalStatusPanel({
  active,
  className,
  connection,
  error,
  onPaneFocus,
  onRetry,
  status,
  style,
  title,
  visible = active,
}: {
  active: boolean;
  className?: string;
  connection: ConnectionProfile | null;
  error: string | null;
  onPaneFocus?: () => void;
  onRetry?: () => void;
  status: string;
  style?: CSSProperties;
  title: string;
  visible?: boolean;
}) {
  const failed = status === "连接失败";

  return (
    <section
      className={`terminal-direct-status ${failed ? "is-error" : "is-loading"} ${
        visible ? "" : "is-hidden"
      } ${className || ""}`}
      aria-label={`${title} ${tr("workspace.local.state")}`}
      aria-hidden={!visible}
      style={style}
      onPointerDown={onPaneFocus}
    >
      <div>
        {failed ? (
          <CircleAlert className="ui-icon" aria-hidden="true" />
        ) : (
          <Loader2 className="ui-icon spin" aria-hidden="true" />
        )}
        <strong>{failed ? tr("workspace.connection.failed") : tr("workspace.local.adding")}</strong>
        <span>
          {connection
            ? `${connection.username}@${connection.host}:${connection.port.toString()}`
            : tr("workspace.local.currentConnection")}
        </span>
        {error ? <small>{error}</small> : null}
        {failed && onRetry ? <button className="primary-button" type="button" onClick={onRetry}><RefreshCw className="ui-icon" aria-hidden="true" />{tr("workspace.rdp.retry")}</button> : null}
      </div>
    </section>
  );
}

function localTerminalStatusLabel(status: string) {
  if (status === "正在打开") return tr("workspace.local.status.opening");
  if (status === "预览") return tr("workspace.local.status.preview");
  if (status === "已连接") return tr("workspace.local.status.connected");
  if (status === "正在连接") return tr("workspace.local.status.connecting");
  if (status === "连接失败") return tr("workspace.connection.failed");
  return status;
}

function ConnectionStepPanel({
  active,
  className,
  step,
  onPaneFocus,
  onCancel,
  onEdit,
  onPromptUsernameChange,
  onPromptAuthKindChange,
  onPromptPasswordChange,
  onPromptPrivateKeyPathChange,
  onPromptPrivateKeyPassphraseChange,
  onRetry,
  onSubmitPrompt,
  onTrustHostKey,
  style,
  visible = active,
}: {
  active: boolean;
  className?: string;
  step: ConnectionStepState;
  onPaneFocus?: () => void;
  onCancel: () => void;
  onEdit: (connection: ConnectionProfile) => void;
  onPromptUsernameChange: (username: string) => void;
  onPromptAuthKindChange: (authKind: ConnectionAuthKind) => void;
  onPromptPasswordChange: (password: string) => void;
  onPromptPrivateKeyPathChange: (path: string) => void;
  onPromptPrivateKeyPassphraseChange: (passphrase: string) => void;
  onRetry: () => void;
  onSubmitPrompt: (event: FormEvent<HTMLFormElement>) => void;
  onTrustHostKey: () => void;
  style?: CSSProperties;
  visible?: boolean;
}) {
  const { t } = useI18n();
  const hostKeyChanged = step.hostKeyDecision === "changed";
  const activeStepIndex = currentConnectionStepIndex(step);
  const closeLabel = step.status === "running" ? tr("workspace.connection.cancel") : tr("workspace.connection.close");
  const progressPercent = Math.max(8, Math.min(100, ((activeStepIndex + 1) / 5) * 100));
  const showStepDetail = step.status !== "idle" && step.status !== "running";
  const stepItems = [
    {
      description: tr("workspace.connection.step.readDescription"),
      label: tr("workspace.connection.step.read"),
    },
    {
      description: tr("workspace.connection.step.networkDescription", { host: step.connection.host, port: step.connection.port }),
      label: tr("workspace.connection.step.network"),
    },
    {
      description: tr("workspace.connection.step.hostKeyDescription"),
      label: tr("workspace.connection.step.hostKey"),
    },
    {
      description: connectionStepAuthDescription(step),
      label: tr("workspace.connection.step.auth"),
    },
    {
      description:
        step.mode === "terminal" ? tr("workspace.connection.step.finishTerminal") : tr("workspace.connection.step.finishTest"),
      label: step.mode === "terminal" ? tr("workspace.connection.step.openTerminal") : tr("workspace.connection.step.finish"),
    },
  ];

  return (
    <section
      className={`connection-step-page ${visible ? "" : "is-hidden"} ${className || ""}`}
      data-step-status={step.status}
      aria-label={tr("workspace.connection.stepsAria")}
      aria-hidden={!visible}
      style={style}
      onPointerDown={onPaneFocus}
    >
      <div className="connection-step-body">
        <section className="connection-step-shell">
          <div className="connection-step-actions">
            {step.status === "success" && !step.temporary ? (
              <button
                type="button"
                aria-label={tr("workspace.connection.edit")}
                onClick={() => onEdit(step.connection)}
              >
                <Pencil className="ui-icon" aria-hidden="true" />
                <span>{tr("workspace.connection.editShort")}</span>
              </button>
            ) : null}
            <button type="button" aria-label={closeLabel} onClick={onCancel}>
              <X className="ui-icon" aria-hidden="true" />
              <span>{closeLabel}</span>
            </button>
          </div>

          <header className="connection-step-hero">
            <div className={`connection-step-orb ${step.status}`} aria-hidden="true">
              {step.status === "error" ? (
                <AlertTriangle className="ui-icon" />
              ) : step.status === "success" ? (
                <CheckCircle2 className="ui-icon" />
              ) : (
                <List className="ui-icon" />
              )}
            </div>
            <h2>{step.connection.name}</h2>
            <p>{formatConnectionAddress(step.connection)}</p>
            <span className={`connection-step-state ${step.status}`} aria-live="polite">
              {connectionStepStatusTitle(step)}
            </span>
          </header>

          <ol className="connection-step-list" aria-label={tr("workspace.connection.stagesAria")}>
            {stepItems.map((item, index) => {
              const state = connectionStepItemState(step, index, activeStepIndex);
              return (
                <li className={state} key={item.label}>
                  <span className="connection-step-marker">
                    {state === "active" && step.status === "running" ? (
                      <Loader2 className="ui-icon spin" aria-hidden="true" />
                    ) : state === "done" ? (
                      <CheckCircle2 className="ui-icon" aria-hidden="true" />
                    ) : state === "error" ? (
                      <AlertTriangle className="ui-icon" aria-hidden="true" />
                    ) : (
                      <i aria-hidden="true">{(index + 1).toString()}</i>
                    )}
                  </span>
                  <span>
                    <strong>{item.label}</strong>
                    <small>{item.description}</small>
                  </span>
                  <em>{connectionStepItemLabel(state, step.status)}</em>
                </li>
              );
            })}
          </ol>

          <div
            className="connection-step-progress"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(progressPercent)}
            style={
              {
                "--connection-step-progress": `${progressPercent.toString()}%`,
              } as CSSProperties
            }
          >
            <span />
          </div>

          {showStepDetail ? (
            <section
              className={`connection-step-detail ${step.status === "error" ? "is-error" : ""}`}
            >
              {step.status !== "error" ? (
                <div className="connection-step-detail-head">
                  <span>
                    <strong>{connectionStepPanelTitle(step)}</strong>
                    <small>{connectionStepPanelDescription(step)}</small>
                  </span>
                </div>
              ) : null}

              {step.status === "prompt" ? (
                <form className="connection-prompt-form" onSubmit={onSubmitPrompt}>
                  <header>
                    <KeyRound className="ui-icon" aria-hidden="true" />
                    <span>
                      <strong>{step.promptTarget?.connectionId !== step.connection.id ? tr("workspace.connection.jumpCredentials") : tr("workspace.connection.credentials")}</strong>
                      <small>{step.promptTarget ? tr("workspace.connection.credentialsTarget", { name: step.promptTarget.name || step.promptTarget.connectionId, user: step.promptTarget.username, host: step.promptTarget.host, port: step.promptTarget.port }) : tr("workspace.connection.credentialsHint")}</small>
                    </span>
                  </header>
                  {step.temporary ? (
                    <label>
                      <span>{t("quickConnect.username")}</span>
                      <input required value={step.connection.username} placeholder={t("quickConnect.usernamePlaceholder")}
                        onChange={(event) => onPromptUsernameChange(event.currentTarget.value)} />
                    </label>
                  ) : null}
                  <label>
                    <span>{tr("workspace.connection.authMethod")}</span>
                    <AppSelect
                      ariaLabel={tr("workspace.connection.authMethod")}
                      value={step.authKind}
                      options={connectionPromptAuthKindOptions()}
                      onChange={onPromptAuthKindChange}
                    />
                  </label>
                  {step.authKind === "password" ? (
                    <label>
                      <span>{tr("workspace.connection.password")}</span>
                      <input
                        type="password"
                        value={step.password}
                        onChange={(event) => onPromptPasswordChange(event.currentTarget.value)}
                      />
                    </label>
                  ) : (
                    <>
                      <label>
                        <span>{tr("workspace.connection.privateKey")}</span>
                        <input
                          value={step.privateKeyPath}
                          placeholder="~/.ssh/id_ed25519"
                          onChange={(event) =>
                            onPromptPrivateKeyPathChange(event.currentTarget.value)
                          }
                        />
                      </label>
                      <label>
                        <span>{tr("workspace.connection.passphrase")}</span>
                        <input
                          type="password"
                          value={step.privateKeyPassphrase}
                          onChange={(event) =>
                            onPromptPrivateKeyPassphraseChange(event.currentTarget.value)
                          }
                        />
                      </label>
                    </>
                  )}
                  <button className="primary-button" type="submit">
                    {tr("workspace.connection.continue")}
                  </button>
                </form>
              ) : null}

              {step.status === "waiting_host_key" && step.hostKey ? (
                <div className="host-key-confirm">
                  <header>
                    <LockKeyhole className="ui-icon" aria-hidden="true" />
                    <span>
                      <strong>{tr("workspace.connection.hostKeyConfirm")}</strong>
                      <small>
                        {hostKeyChanged ? tr("workspace.connection.hostKeyChanged") : step.hostKey.key_algorithm}
                      </small>
                    </span>
                  </header>
                  {hostKeyChanged && step.oldHostKeyFingerprint ? (
                    <code>{tr("workspace.connection.oldFingerprint", { value: step.oldHostKeyFingerprint })}</code>
                  ) : null}
                  <code>{step.hostKey.fingerprint_sha256}</code>
                  {step.error ? <p className="form-error">{step.error}</p> : null}
                  <button className="primary-button" type="button" onClick={onTrustHostKey}>
                    {hostKeyChanged ? tr("workspace.connection.updateTrust") : tr("workspace.connection.trust")}
                  </button>
                </div>
              ) : null}

              {step.status === "success" && step.mode === "test" ? (
                <div className="connection-step-success">
                  <CheckCircle2 className="ui-icon" aria-hidden="true" />
                  <span>{tr("workspace.connection.testSuccess")}</span>
                </div>
              ) : null}

              {step.status === "error" ? (
                <div className="connection-step-error" role="alert">
                  <header>
                    <AlertTriangle className="ui-icon" aria-hidden="true" />
                    <strong>
                      {step.errorDetail?.rawMessage || step.errorDetail?.message || step.error || tr("workspace.connection.errorFallback")}
                    </strong>
                  </header>
                  {step.errorDetail?.suggestion ? (
                    <p className="connection-step-error-tip">{step.errorDetail.suggestion}</p>
                  ) : null}
                  <div className="connection-step-error-actions">
                    <button
                      className="connection-step-retry-button"
                      type="button"
                      onClick={onRetry}
                    >
                      <RefreshCw className="ui-icon" aria-hidden="true" />
                      <span>{tr("workspace.rdp.retry")}</span>
                    </button>
                    {!step.temporary ? (
                      <button className="connection-step-secondary-button" type="button" onClick={() => onEdit(step.connection)}>
                        <Pencil className="ui-icon" aria-hidden="true" />
                        <span>{tr("workspace.connection.edit")}</span>
                      </button>
                    ) : null}
                  </div>
                </div>
              ) : null}
            </section>
          ) : null}

          <details className="connection-step-log">
            <summary>
              <span>
                <ChevronLeft className="ui-icon" aria-hidden="true" />
                {tr("workspace.connection.logs")}
              </span>
              <small>{tr("workspace.connection.logCount", { count: step.logs.length })}</small>
            </summary>
            <div aria-label={tr("workspace.connection.logsAria")}>
              <div>
                {step.logs.map((line, index) => (
                  <code key={`${line}-${index.toString()}`}>{line}</code>
                ))}
              </div>
            </div>
          </details>
        </section>
      </div>
    </section>
  );
}

function currentConnectionStepIndex(step: ConnectionStepState) {
  if (step.status === "success") {
    return 4;
  }
  if (step.status === "waiting_host_key") {
    return 2;
  }
  if (step.status === "prompt") {
    return 3;
  }
  if (step.status === "error") {
    return connectionStepErrorIndex(step.errorDetail?.code || "");
  }
  if (step.status === "running" && typeof step.activeStepIndex === "number") {
    return clampConnectionStepIndex(step.activeStepIndex);
  }
  return Math.min(Math.max(step.logs.length - 1, 1), 4);
}

function clampConnectionStepIndex(index: number) {
  return Math.min(Math.max(Math.round(index), 0), 4);
}

function resetConnectionStepForRetry(step: ConnectionStepState): ConnectionStepState {
  return {
    ...step,
    activeStepIndex: 1,
    error: null,
    errorDetail: null,
    hostKey: null,
    hostKeyDecision: null,
    logs: step.logs[0] ? [step.logs[0]] : [],
    oldHostKeyFingerprint: null,
    sessionId: null,
    status: "idle",
  };
}

function connectionStepErrorIndex(code: string) {
  if (isConnectionStageError(code)) {
    return 1;
  }
  if (code === "host_key_unknown" || code === "host_key_changed") {
    return 2;
  }
  if (
    code === "terminal_auth_failed" ||
    code === "terminal_auth_rejected" ||
    code === "terminal_auth_timeout" ||
    code === "terminal_auth_missing" ||
    code === "terminal_private_key_invalid" ||
    code === "terminal_private_key_passphrase" ||
    code === "terminal_private_key_not_found" ||
    code.startsWith("credential_") ||
    code.startsWith("connection_credential_")
  ) {
    return 3;
  }
  if (
    code === "terminal_channel_open_failed" ||
    code === "terminal_pty_failed" ||
    code === "terminal_shell_failed"
  ) {
    return 4;
  }
  return 1;
}

type ConnectionStepItemState = "active" | "done" | "error" | "pending";

function connectionStepItemState(
  step: ConnectionStepState,
  index: number,
  activeStepIndex: number,
): ConnectionStepItemState {
  if (step.status === "success" || index < activeStepIndex) {
    return "done";
  }
  if (step.status === "error" && index === activeStepIndex) {
    return "error";
  }
  if (index === activeStepIndex) {
    return "active";
  }
  return "pending";
}

function connectionStepAuthDescription(step: ConnectionStepState) {
  const authKind =
    step.connection.credential_mode === "prompt"
      ? step.authKind
      : step.connection.inline_auth_kind || step.connection.auth_kind || step.authKind;

  if (step.connection.credential_mode === "prompt") {
    return authKind === "private_key" ? tr("workspace.connection.authRuntimePrivate") : tr("workspace.connection.authRuntimePassword");
  }

  return authKind === "private_key" ? tr("workspace.connection.authSavedPrivate") : tr("workspace.connection.authSavedPassword");
}

function connectionStepItemLabel(
  state: ConnectionStepItemState,
  status: ConnectionStepStatus,
) {
  if (state === "done") {
    return tr("workspace.step.complete");
  }
  if (state === "error") {
    return tr("workspace.step.failed");
  }
  if (state === "active") {
    if (status === "prompt") {
      return tr("workspace.step.waitInput");
    }
    if (status === "waiting_host_key") {
      return tr("workspace.step.waitConfirm");
    }
    if (status === "idle") {
      return tr("workspace.step.preparing");
    }
    return tr("workspace.step.running");
  }
  return tr("workspace.step.pending");
}

function connectionStepStatusTitle(step: ConnectionStepState) {
  if (step.status === "success") {
    return tr("workspace.step.testPassed");
  }
  if (step.status === "error") {
    return tr("workspace.step.connectionFailed");
  }
  if (step.status === "waiting_host_key") {
    return tr("workspace.step.waitConfirm");
  }
  if (step.status === "prompt") {
    return tr("workspace.step.credentialsRequired");
  }
  return tr("workspace.step.checking");
}

function connectionStepPanelTitle(step: ConnectionStepState) {
  if (step.status === "success") {
    return tr("workspace.step.checkComplete");
  }
  if (step.status === "error") {
    return tr("workspace.step.checkIncomplete");
  }
  if (step.status === "waiting_host_key") {
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
  connections,
  error,
  groups,
  hidden = false,
  loading,
  onConnect,
  onCreateConnection,
  onDelete,
  onEdit,
  onExportConnections,
  onImportConnections,
  onPreloadCreateConnection,
  onRefresh,
}: {
  connections: ConnectionProfile[];
  error: string | null;
  groups: ConnectionGroupCatalog;
  hidden?: boolean;
  loading: boolean;
  onConnect: (connection: ConnectionProfile) => void;
  onCreateConnection: () => void;
  onDelete: (connection: ConnectionProfile) => void | Promise<void>;
  onEdit: (connection: ConnectionProfile) => void;
  onExportConnections: () => void;
  onImportConnections: () => void;
  onPreloadCreateConnection?: () => void;
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
          <button
            className="repository-primary-button"
            type="button"
            onFocus={onPreloadCreateConnection}
            onClick={onCreateConnection}
            onPointerDown={onPreloadCreateConnection}
            onPointerEnter={onPreloadCreateConnection}
          >
            <Plus className="ui-icon" aria-hidden="true" />
            <span>{t("connectionHome.newConnection")}</span>
          </button>
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
                    <strong>{hasLastConnectedAt ? formatRelativeTime(lastConnectedAt) : t("connectionHome.neverConnected")}</strong>
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
                      <span>{formatRelativeTime(connection.last_connected_at)}</span>
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

function formatRelativeTime(value?: string | null) {
  const normalized = value?.trim().toLowerCase();

  if (normalized === "demo" || normalized === "preview") {
    return tr("workspace.recent");
  }

  const timestamp = connectionTimestampOf(value);

  if (!timestamp) {
    return tr("workspace.recent");
  }

  const diffMs = Date.now() - timestamp;
  const minute = 60 * 1000;
  const hour = 60 * minute;
  const day = 24 * hour;

  if (diffMs < minute) return tr("workspace.time.justNow");
  if (diffMs < hour) return tr("workspace.time.minutesAgo", { count: Math.floor(diffMs / minute) });
  if (diffMs < day) return tr("workspace.time.hoursAgo", { count: Math.floor(diffMs / hour) });
  if (diffMs < 2 * day) return tr("workspace.time.yesterday");
  return tr("workspace.time.daysAgo", { count: Math.floor(diffMs / day) });
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
  return (connection?.protocol || "ssh") === "ssh";
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
