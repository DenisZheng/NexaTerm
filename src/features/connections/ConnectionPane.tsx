import { useI18n, type Translate } from "../../shared/i18n";
import { AppSelect } from "../../shared/ui/AppSelect";
import {
  BatchConnectPreviewDialog,
  BatchConnectStatusPanel,
  type ConnectionPaneBatchConnectController,
} from "./BatchConnectUi";
import { groupOptions, groupDescendants, type ConnectionGroup as CustomGroup, type ConnectionGroupInput, type LegacyGroupReport, type LegacyGroupResolution } from "./connectionGroupModel";
import { groupErrorMessage } from "./useConnectionGroups";
import * as ContextMenu from "@radix-ui/react-context-menu";
import * as Dialog from "@radix-ui/react-dialog";
import {
  FormEvent,
  lazy,
  Suspense,
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
  type DragEvent,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
} from "react";
import {
  Check,
  Clock3,
  Copy,
  Folder,
  FolderPlus,
  Pencil,
  Play,
  Plus,
  RefreshCw,
  Search,
  Settings,
  Star,
  Trash2,
  X,
  type LucideIcon,
} from "lucide-react";

import { ConfirmDialog } from "../../shared/ui/ConfirmDialog";
import { Tooltip } from "../../shared/ui/Tooltip";
import { ConnectionSystemLogo } from "./ConnectionSystemLogo";
import type { ConnectionProfile } from "./connectionTypes";
import { connectionTimestampOf, sortConnectionsByRecent } from "./connectionSearch";

interface ConnectionPaneProps {
  batchConnect: ConnectionPaneBatchConnectController;
  connections: ConnectionProfile[];
  error: string | null;
  loading: boolean;
  onCreate: (groupId?: string) => void;
  onConnect: (connection: ConnectionProfile) => void;
  onDelete: (connection: ConnectionProfile) => void | Promise<void>;
  onDuplicate: (connection: ConnectionProfile) => void;
  onEdit: (connection: ConnectionProfile) => void;
  groups: CustomGroup[];
  groupReady: boolean;
  migration?: LegacyGroupReport | null;
  onResolveMigration?: (resolutions?: LegacyGroupResolution[]) => Promise<unknown>;
  groupBusy: boolean;
  onSaveGroup: (input: ConnectionGroupInput) => Promise<unknown>;
  onDeleteGroup: (id: string) => Promise<unknown>;
  onMoveConnectionToGroup: (connection: ConnectionProfile, groupId: string | null) => Promise<unknown>;
  onOpen: (connection: ConnectionProfile) => void;
  onOpenSearch: () => void;
  onOpenSettings: () => void;
  onPreloadCreate?: () => void;
  onRefresh: () => void;
  onSelect: (connection: ConnectionProfile) => void;
  onToggleFavorite: (connection: ConnectionProfile) => void | Promise<void>;
  recentConnectionLimit: number;
  selectedId: string | null;
}

type SystemFolderId = "favorites" | "recent";
type FolderId = SystemFolderId | `group-${string}`;
type DropTargetId = "root" | `group-${string}`;

interface MouseDragState {
  active: boolean;
  connectionId: string;
  currentX: number;
  currentY: number;
  grabOffsetX: number;
  grabOffsetY: number;
  previewWidth: number;
  startX: number;
  startY: number;
}

interface SystemFolder {
  id: SystemFolderId;
  color: string;
  icon: LucideIcon;
  label: string;
}

type DeleteRequest =
  | { type: "connection"; connection: ConnectionProfile }
  | { type: "group"; group: CustomGroup };

const systemFolders: SystemFolder[] = [
  { id: "favorites", color: "#64748b", icon: Star, label: "" },
  { id: "recent", color: "#64748b", icon: Clock3, label: "" },
];

const LegacyGroupMigrationNotice = lazy(() => import("./LegacyGroupMigrationNotice"));
const expandedFolderStorageKey = "mxterm.connectionExpandedFolders.v2";
const groupPalette = ["#64748b", "#2563eb", "#4f7d63", "#c47c2c", "#8b5cf6", "#d14d72"];
const connectionDragDataType = "application/x-mxterm-connection-id";

export function ConnectionPane({
  batchConnect,
  connections,
  error,
  loading,
  onCreate,
  onConnect,
  onDelete,
  onDuplicate,
  onEdit,
  groups: customGroups,
  groupReady,
  migration,
  onResolveMigration,
  groupBusy,
  onSaveGroup,
  onDeleteGroup,
  onMoveConnectionToGroup,
  onOpen,
  onOpenSearch,
  onOpenSettings,
  onPreloadCreate,
  onRefresh,
  onSelect,
  onToggleFavorite,
  recentConnectionLimit,
  selectedId,
}: ConnectionPaneProps) {
  const { t } = useI18n();
  const [groupError, setGroupError] = useState<string | null>(null);
  const connectionGroups = useMemo(
    () => Object.fromEntries(connections.filter((c) => c.group_id).map((c) => [c.id, c.group_id!])),
    [connections, customGroups],
  );
  const [creatingGroup, setCreatingGroup] = useState(false);
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null);
  const [creatingGroupParentId, setCreatingGroupParentId] = useState<string | null>(null);
  const [groupDraft, setGroupDraft] = useState("");
  const [groupColorDraft, setGroupColorDraft] = useState(groupPalette[0]);
  const [deleteRequest, setDeleteRequest] = useState<DeleteRequest | null>(null);
  const [batchPreviewGroupId, setBatchPreviewGroupId] = useState<string | null>(null);
  const [draggingConnectionId, setDraggingConnectionId] = useState<string | null>(null);
  const [dropTargetId, setDropTargetId] = useState<DropTargetId | null>(null);
  const [mouseDrag, setMouseDrag] = useState<MouseDragState | null>(null);
  const [quickSelectedId, setQuickSelectedId] = useState<string | null>(null);
  const [expansionLoaded, setExpansionLoaded] = useState(false);
  const [expandedFolders, setExpandedFolders] = useState<Record<FolderId, boolean>>(
    readStoredExpandedFolders,
  );

  const catalog = useMemo(
    () => buildCatalog(connections, recentConnectionLimit),
    [connections, recentConnectionLimit],
  );
  const customGroupIds = useMemo(
    () => new Set(customGroups.map((group) => group.id)),
    [customGroups],
  );
  const topLevelCustomGroups = useMemo(
    () =>
      customGroups.filter(
        (group) => !group.parentId || !customGroupIds.has(group.parentId),
      ),
    [customGroups, customGroupIds],
  );
  const ungroupedConnections = useMemo(
    () =>
      connections.filter((connection) => !customGroupIds.has(connectionGroups[connection.id] || "")),
    [connections, connectionGroups, customGroupIds],
  );
  const draggedConnection = mouseDrag?.active
    ? connections.find((connection) => connection.id === mouseDrag.connectionId) || null
    : null;

  useEffect(() => {
    if (!groupReady) return;
    if (!expansionLoaded) {
      setExpandedFolders(readStoredExpandedFolders());
      setExpansionLoaded(true);
      return;
    }
    writeStoredExpandedFolders(expandedFolders);
  }, [expandedFolders, groupReady, expansionLoaded]);

  useEffect(() => {
    if (!mouseDrag) {
      return;
    }

    const currentDrag = mouseDrag;

    function handleMouseMove(event: MouseEvent) {
      const active = currentDrag.active || mouseDragDistance(currentDrag, event) > 6;

      if (!active) {
        return;
      }

      event.preventDefault();
      setDraggingConnectionId(currentDrag.connectionId);
      setDropTargetId(getDropTargetFromPoint(event.clientX, event.clientY));

      setMouseDrag((drag) =>
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
      const active = currentDrag.active || mouseDragDistance(currentDrag, event) > 6;

      if (active) {
        const targetId = getDropTargetFromPoint(event.clientX, event.clientY);

        if (targetId) {
          moveConnectionToDropTarget(currentDrag.connectionId, targetId);
          return;
        }
      }

      finishConnectionDrag();
    }

    window.addEventListener("mousemove", handleMouseMove, { passive: false });
    window.addEventListener("mouseup", handleMouseUp);

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [mouseDrag]);

  return (
    <>
      <aside className="connection-pane app-sidebar" aria-label={t("connectionPane.aria")}>
        <section className="pane-scroll connection-tree" aria-label={t("connectionPane.treeAria")}>
          {loading ? <p className="pane-note">{t("connectionPane.loading")}</p> : null}
          {migration && onResolveMigration ? <Suspense fallback={null}><LegacyGroupMigrationNotice report={migration} groups={customGroups} onResolve={onResolveMigration} /></Suspense> : null}
          {error || groupError ? <p className="pane-error" role="alert">{groupError || error}</p> : null}

          <div className="tree-block" aria-label={t("connectionPane.systemGroups")}>
            {systemFolders.map((folder) => (
              <TreeFolder
                color={folder.color}
                connections={catalog[folder.id]}
                expanded={expandedFolders[folder.id]}
                icon={folder.icon}
                key={folder.id}
                label={folder.id === "favorites" ? t("connectionPane.favorites") : t("connectionPane.recent")}
                onDuplicate={onDuplicate}
                onEdit={onEdit}
                onOpen={onOpen}
                onSelect={selectQuickConnection}
                onToggleFavorite={onToggleFavorite}
                onCreateConnection={() => onCreate()}
                onCreateGroup={() => beginCreateGroup(null)}
                onConnect={connectQuickConnection}
                onDeleteConnection={requestDeleteConnection}
                onConnectionDragEnd={finishConnectionDrag}
                onConnectionDragStart={beginConnectionDrag}
                onMouseConnectionDragStart={beginMouseConnectionDrag}
                onToggle={() => toggleFolder(folder.id)}
                selectedId={quickSelectedId}
              />
            ))}
          </div>

          <div className="tree-section-head">
            <span>{t("connectionPane.connections")}</span>
            <div className="toolbar-actions">
              <Tooltip label={t("connectionPane.search")}>
                <button className="mini-action" type="button" aria-label={t("connectionPane.search")} onClick={onOpenSearch}>
                  <Search className="ui-icon" aria-hidden="true" />
                </button>
              </Tooltip>
              <Tooltip label={t("connectionPane.refresh")}>
                <button className="mini-action" type="button" aria-label={t("connectionPane.refresh")} onClick={onRefresh}>
                  <RefreshCw className="ui-icon" aria-hidden="true" />
                </button>
              </Tooltip>
              <Tooltip label={t("connectionPane.addGroup")}>
                <button
                  className="mini-action"
                  type="button"
                  aria-label={t("connectionPane.addGroup")}
                  onClick={() => beginCreateGroup(null)}
                >
                  <FolderPlus className="ui-icon" aria-hidden="true" />
                </button>
              </Tooltip>
              <Tooltip label={t("connectionPane.addConnection")}>
                <button
                  className="mini-action"
                  type="button"
                  aria-label={t("connectionPane.addConnection")}
                  onFocus={onPreloadCreate}
                  onClick={() => onCreate()}
                  onPointerDown={onPreloadCreate}
                  onPointerEnter={onPreloadCreate}
                >
                  <Plus className="ui-icon" aria-hidden="true" />
                </button>
              </Tooltip>
            </div>
          </div>

          <div className="tree-block" aria-label={t("connectionPane.customGroups")}>
            {topLevelCustomGroups.map((group) => renderCustomGroup(group))}
          </div>

          <div
            className={`tree-block root-connections ${dropTargetId === "root" ? "drop-target" : ""}`}
            aria-label={t("connectionPane.ungrouped")}
            data-drop-target-id="root"
            onDragLeave={clearDropTarget}
            onDragOver={(event) => activateDropTarget(event, "root")}
            onDrop={dropConnectionToRoot}
          >
            {ungroupedConnections.map((connection) => (
              <ConnectionTreeLeaf
                connection={connection}
                key={connection.id}
                dragging={connection.id === draggingConnectionId}
                onDelete={requestDeleteConnection}
                onDragEnd={finishConnectionDrag}
                onDragStart={beginConnectionDrag}
                onMouseDragStart={beginMouseConnectionDrag}
                onConnect={onConnect}
                onDuplicate={onDuplicate}
                onEdit={onEdit}
                onOpen={onOpen}
                onSelect={selectTreeConnection}
                onToggleFavorite={onToggleFavorite}
                selected={connection.id === selectedId}
              />
            ))}
            {ungroupedConnections.length === 0 && draggingConnectionId ? (
              <div className="drop-empty">{t("connectionPane.dropRoot")}</div>
            ) : null}
          </div>
        </section>

        <BatchConnectStatusPanel
          connections={connections}
          controller={batchConnect}
          groups={customGroups}
        />

        <footer className="settings-foot">
          <Tooltip label={t("connectionPane.settings")}>
            <button
              className="icon-button settings-entry-button"
              type="button"
              aria-label={t("connectionPane.settings")}
              onClick={onOpenSettings}
            >
              <Settings className="ui-icon" aria-hidden="true" />
              <span>{t("connectionPane.settings")}</span>
            </button>
          </Tooltip>
        </footer>

        {draggedConnection && mouseDrag ? (
          <div
            className="connection-drag-preview"
            style={{
              transform: `translate(${mouseDrag.currentX - mouseDrag.grabOffsetX}px, ${mouseDrag.currentY - mouseDrag.grabOffsetY}px)`,
              width: `${mouseDrag.previewWidth}px`,
            }}
          >
            <ConnectionSystemLogo connection={draggedConnection} compact decorative />
            <span>
              <strong>{draggedConnection.name}</strong>
              <small>{formatAddress(draggedConnection, t)}</small>
            </span>
          </div>
        ) : null}
      </aside>

      {renderGroupDialog()}
      {renderDeleteConfirmDialog()}
      <BatchConnectPreviewDialog
        connections={connections}
        controller={batchConnect}
        groups={customGroups}
        targetGroupId={batchPreviewGroupId}
        onOpenChange={(open) => {
          if (!open) setBatchPreviewGroupId(null);
        }}
      />
    </>
  );

  function renderGroupDialog() {
    const parentGroup = creatingGroupParentId
      ? customGroups.find((group) => group.id === creatingGroupParentId)
      : null;

    return (
      <Dialog.Root
        open={creatingGroup}
        onOpenChange={(open) => {
          if (!open && !groupBusy) {
            resetGroupForm();
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
            <form className="group-dialog" onSubmit={saveGroup}>
              <header className="dialog-head">
                <div className="dialog-title-group">
                  <Dialog.Title asChild>
                    <strong>{editingGroupId ? t("connectionPane.group.edit") : t("connectionPane.group.new")}</strong>
                  </Dialog.Title>
                  <Dialog.Description className={parentGroup ? "dialog-subtitle" : "sr-only"}>
                    {parentGroup ? t("connectionPane.group.parenting", { name: parentGroup.name }) : t("connectionPane.group.create")}
                  </Dialog.Description>
                </div>
                <Dialog.Close asChild>
                  <button className="icon-button dialog-close-button" type="button" aria-label={t("connectionPane.close")}>
                    <X className="ui-icon" aria-hidden="true" />
                  </button>
                </Dialog.Close>
              </header>

              <div className="dialog-body group-dialog-body">
                <label>
                  <span>{t("connectionPane.group.name")}</span>
                  <input
                    aria-label={t("connectionPane.group.nameAria")}
                    autoFocus
                    placeholder={t("connectionPane.group.namePlaceholder")}
                    value={groupDraft}
                    onChange={(event) => setGroupDraft(event.target.value)}
                  />
                </label>
                <label>
                  <span>{t("connectionPane.group.parent")}</span>
                  <AppSelect ariaLabel={t("connectionPane.group.parent")} value={creatingGroupParentId || ""}
                    options={[{ value: "", label: t("connectionPane.group.root") }, ...groupOptions(customGroups.filter((group) => !editingGroupId || !groupDescendants(customGroups, editingGroupId).has(group.id)))]}
                    onChange={(id) => setCreatingGroupParentId(id || null)} />
                </label>
                {groupError ? <p className="pane-error" role="alert">{groupError}</p> : null}
                <div className="group-dialog-colors">
                  <span>{t("connectionPane.group.color")}</span>
                  <div className="group-color-row" aria-label={t("connectionPane.group.colorAria")}>
                    {groupPalette.map((color) => (
                      <button
                        className={`color-swatch ${groupColorDraft === color ? "active" : ""}`}
                        key={color}
                        style={{ "--group-color": color } as CSSProperties}
                        type="button"
                        aria-label={t("connectionPane.group.chooseColor", { color })}
                        onClick={() => setGroupColorDraft(color)}
                      />
                    ))}
                  </div>
                </div>
              </div>

              <footer className="dialog-actions group-dialog-actions">
                <span />
                <Dialog.Close asChild>
                  <button type="button">
                    <X className="ui-icon" aria-hidden="true" />
                    <span>{t("connectionPane.cancel")}</span>
                  </button>
                </Dialog.Close>
                <button className="primary-button" type="submit" disabled={!groupReady || groupBusy}>
                  <Check className="ui-icon" aria-hidden="true" />
                  <span>{editingGroupId ? t("connectionPane.update") : t("connectionPane.save")}</span>
                </button>
              </footer>
            </form>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    );
  }

  function renderDeleteConfirmDialog() {
    return (
      <ConfirmDialog
        confirmLabel={t("connectionPane.delete")}
        description={deleteRequestDescription(deleteRequest, customGroups, t)}
        open={Boolean(deleteRequest)}
        title={deleteRequestTitle(deleteRequest, t)}
        onConfirm={confirmDeleteRequest}
        onOpenChange={(open) => {
          if (!open) {
            setDeleteRequest(null);
          }
        }}
      />
    );
  }

  function renderCustomGroup(group: CustomGroup): ReactNode {
    const folderId: FolderId = `group-${group.id}`;
    const childGroups = customGroups.filter((item) => item.parentId === group.id);

    return (
      <TreeFolder
        color={group.color}
        expanded={expandedFolders[folderId] ?? true}
        icon={Folder}
        key={group.id}
        label={group.name}
        folderDropTargetId={folderId}
        draggingConnectionId={draggingConnectionId}
        dropTargetId={dropTargetId}
        onDuplicate={onDuplicate}
        onEdit={onEdit}
        onOpen={onOpen}
        onSelect={selectTreeConnection}
        onToggleFavorite={onToggleFavorite}
        onCreateConnection={() => onCreate(group.id)}
        onCreateGroup={() => beginCreateGroup(group.id)}
        connectAllLabel={t("batchConnect.menu")}
        onConnectAll={() => setBatchPreviewGroupId(group.id)}
        onConnect={onConnect}
        onDeleteConnection={requestDeleteConnection}
        onConnectionDragEnd={finishConnectionDrag}
        onConnectionDragStart={beginConnectionDrag}
        onMouseConnectionDragStart={beginMouseConnectionDrag}
        onDragLeave={clearDropTarget}
        onDragOver={(event) => activateDropTarget(event, `group-${group.id}`)}
        onDropConnection={(connectionId) => assignConnectionToGroup(connectionId, group.id)}
        onEditGroup={() => beginEditGroup(group)}
        onDeleteGroup={() => requestDeleteGroup(group)}
        onToggle={() => toggleFolder(folderId)}
        selectedId={selectedId}
        connections={connections.filter(
          (connection) => connectionGroups[connection.id] === group.id,
        )}
        nestedContent={
          <>
            {childGroups.map((childGroup) => renderCustomGroup(childGroup))}
          </>
        }
      />
    );
  }

  function toggleFolder(id: FolderId) {
    setExpandedFolders((folders) => ({
      ...folders,
      [id]: !(folders[id] ?? true),
    }));
  }

  function selectQuickConnection(connection: ConnectionProfile) {
    setQuickSelectedId(connection.id);
  }

  function connectQuickConnection(connection: ConnectionProfile) {
    setQuickSelectedId(connection.id);
    onConnect(connection);
  }

  function selectTreeConnection(connection: ConnectionProfile) {
    setQuickSelectedId(null);
    onSelect(connection);
  }

  function beginConnectionDrag(event: DragEvent<HTMLElement>, connection: ConnectionProfile) {
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData(connectionDragDataType, connection.id);
    event.dataTransfer.setData("text/plain", connection.id);
    setDraggingConnectionId(connection.id);
  }

  function beginMouseConnectionDrag(
    event: ReactMouseEvent<HTMLElement>,
    connection: ConnectionProfile,
  ) {
    if (event.button !== 0) {
      return;
    }

    const bounds = event.currentTarget.getBoundingClientRect();

    setMouseDrag({
      active: false,
      connectionId: connection.id,
      currentX: event.clientX,
      currentY: event.clientY,
      grabOffsetX: event.clientX - bounds.left,
      grabOffsetY: event.clientY - bounds.top,
      previewWidth: bounds.width,
      startX: event.clientX,
      startY: event.clientY,
    });
  }

  function finishConnectionDrag() {
    setDraggingConnectionId(null);
    setDropTargetId(null);
    setMouseDrag(null);
  }

  function activateDropTarget(event: DragEvent<HTMLElement>, targetId: DropTargetId) {
    if (!isConnectionDrag(event)) {
      return;
    }

    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    setDropTargetId(targetId);
  }

  function clearDropTarget() {
    setDropTargetId(null);
  }

  function assignConnectionToGroup(connectionId: string, groupId: string) {
    const connection = connections.find((item) => item.id === connectionId);
    const group = customGroups.find((item) => item.id === groupId);
    if (connection && group && groupReady) {
      void onMoveConnectionToGroup(connection, group.id).catch((cause: unknown) => setGroupError(groupErrorMessage(cause)));
    }
    finishConnectionDrag();
  }

  function moveConnectionToDropTarget(connectionId: string, targetId: DropTargetId) {
    if (targetId === "root") {
      const connection = connections.find((item) => item.id === connectionId);
      if (connection) {
        void onMoveConnectionToGroup(connection, null).catch((cause: unknown) => setGroupError(groupErrorMessage(cause)));
      }
      finishConnectionDrag();
      return;
    }

    assignConnectionToGroup(connectionId, targetId.slice("group-".length));
  }

  function dropConnectionToRoot(event: DragEvent<HTMLDivElement>) {
    if (!isConnectionDrag(event)) {
      return;
    }

    event.preventDefault();
    const connectionId = getDraggedConnectionId(event) || draggingConnectionId;

    if (!connectionId) {
      finishConnectionDrag();
      return;
    }

    moveConnectionToDropTarget(connectionId, "root");
  }

  function beginCreateGroup(parentId: string | null = null) {
    if (!groupReady || groupBusy) return;
    setGroupError(null);
    setEditingGroupId(null);
    setCreatingGroupParentId(parentId);
    setGroupDraft("");
    setGroupColorDraft(groupPalette[0]);
    setCreatingGroup(true);
    if (parentId) {
      setExpandedFolders((folders) => ({
        ...folders,
        [`group-${parentId}`]: true,
      }));
    }
  }

  function beginEditGroup(group: CustomGroup) {
    if (!groupReady || groupBusy) return;
    setGroupError(null);
    setEditingGroupId(group.id);
    setCreatingGroupParentId(group.parentId || null);
    setGroupDraft(group.name);
    setGroupColorDraft(group.color);
    setCreatingGroup(true);
  }

  async function saveGroup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setGroupError(null);
    try {
      await onSaveGroup({ id: editingGroupId || undefined, name: groupDraft.trim(), color: groupColorDraft, parent_id: creatingGroupParentId });
      resetGroupForm();
    } catch (cause) {
      setGroupError(groupErrorMessage(cause));
    }
  }

  function requestDeleteConnection(connection: ConnectionProfile) {
    setDeleteRequest({ type: "connection", connection });
  }

  function requestDeleteGroup(group: CustomGroup) {
    setDeleteRequest({ type: "group", group });
  }

  async function confirmDeleteRequest() {
    if (!deleteRequest) {
      return;
    }

    if (deleteRequest.type === "connection") {
      await onDelete(deleteRequest.connection);
      return;
    }

    await onDeleteGroup(deleteRequest.group.id);
  }

  function resetGroupForm() {
    setEditingGroupId(null);
    setCreatingGroupParentId(null);
    setGroupDraft("");
    setGroupColorDraft(groupPalette[0]);
    setCreatingGroup(false);
  }
}

function TreeFolder({
  color,
  connections,
  expanded,
  folderDropTargetId,
  icon: Icon,
  label,
  draggingConnectionId,
  dropTargetId,
  onDuplicate,
  onEdit,
  onOpen,
  onSelect,
  onToggleFavorite,
  onCreateConnection,
  onCreateGroup,
  connectAllLabel,
  onConnectAll,
  onConnect,
  onDeleteConnection,
  onConnectionDragEnd,
  onConnectionDragStart,
  onMouseConnectionDragStart,
  onDragLeave,
  onDragOver,
  onDropConnection,
  onEditGroup,
  onDeleteGroup,
  onToggle,
  selectedId,
  nestedContent,
}: {
  color: string;
  connections: ConnectionProfile[];
  expanded: boolean;
  folderDropTargetId?: DropTargetId;
  icon: LucideIcon;
  label: string;
  draggingConnectionId?: string | null;
  dropTargetId?: DropTargetId | null;
  onDuplicate: (connection: ConnectionProfile) => void;
  onEdit: (connection: ConnectionProfile) => void;
  onOpen: (connection: ConnectionProfile) => void;
  onSelect: (connection: ConnectionProfile) => void;
  onToggleFavorite: (connection: ConnectionProfile) => void | Promise<void>;
  onCreateConnection: () => void;
  onCreateGroup: () => void;
  connectAllLabel?: string;
  onConnectAll?: () => void;
  onConnect: (connection: ConnectionProfile) => void;
  onDeleteConnection: (connection: ConnectionProfile) => void | Promise<void>;
  onConnectionDragEnd: () => void;
  onConnectionDragStart: (event: DragEvent<HTMLElement>, connection: ConnectionProfile) => void;
  onMouseConnectionDragStart: (
    event: ReactMouseEvent<HTMLElement>,
    connection: ConnectionProfile,
  ) => void;
  onDragLeave?: () => void;
  onDragOver?: (event: DragEvent<HTMLElement>) => void;
  onDropConnection?: (connectionId: string) => void;
  onEditGroup?: () => void;
  onDeleteGroup?: () => void;
  onToggle: () => void;
  selectedId: string | null;
  nestedContent?: ReactNode;
}) {
  const { t } = useI18n();
  const dropTarget = Boolean(folderDropTargetId && dropTargetId === folderDropTargetId);

  return (
    <div
      className={`tree-folder ${dropTarget ? "drop-target" : ""}`}
      data-drop-target-id={folderDropTargetId}
      onDragLeave={onDragLeave}
      onDragOver={onDragOver}
      onDrop={dropConnection}
    >
      <ContextMenu.Root>
        <ContextMenu.Trigger asChild>
          <div
            className="tree-folder-row"
            style={{ "--group-color": color } as CSSProperties}
          >
            <button
              className="tree-folder-main"
              type="button"
              onClick={onToggle}
              onDragLeave={onDragLeave}
              onDragOver={onDragOver}
              onDrop={dropConnection}
            >
              <Icon className="ui-icon group-folder-icon" aria-hidden="true" />
              <span>{label}</span>
              <span className="count">{connections.length.toString()}</span>
            </button>
          </div>
        </ContextMenu.Trigger>
        <ContextMenu.Portal>
          <ContextMenu.Content className="context-menu-content">
            <ContextMenu.Item className="context-menu-item" onSelect={onToggle}>
              <Folder className="ui-icon" aria-hidden="true" />
              <span>{expanded ? t("connectionPane.group.collapse") : t("connectionPane.group.expand")}</span>
            </ContextMenu.Item>
            {onConnectAll && connectAllLabel ? (
              <ContextMenu.Item className="context-menu-item" onSelect={onConnectAll}>
                <Play className="ui-icon" aria-hidden="true" />
                <span>{connectAllLabel}</span>
              </ContextMenu.Item>
            ) : null}
            <ContextMenu.Item className="context-menu-item" onSelect={onCreateConnection}>
              <Plus className="ui-icon" aria-hidden="true" />
              <span>{t("connectionPane.addConnection")}</span>
            </ContextMenu.Item>
            <ContextMenu.Item className="context-menu-item" onSelect={onCreateGroup}>
              <FolderPlus className="ui-icon" aria-hidden="true" />
              <span>{t("connectionPane.group.new")}</span>
            </ContextMenu.Item>
            {onEditGroup || onDeleteGroup ? (
              <ContextMenu.Separator className="context-menu-separator" />
            ) : null}
            {onEditGroup ? (
              <ContextMenu.Item className="context-menu-item" onSelect={onEditGroup}>
                <Pencil className="ui-icon" aria-hidden="true" />
                <span>{t("connectionPane.group.edit")}</span>
              </ContextMenu.Item>
            ) : null}
            {onDeleteGroup ? (
              <ContextMenu.Item className="context-menu-item danger" onSelect={onDeleteGroup}>
                <Trash2 className="ui-icon" aria-hidden="true" />
                <span>{t("connectionPane.group.delete")}</span>
              </ContextMenu.Item>
            ) : null}
          </ContextMenu.Content>
        </ContextMenu.Portal>
      </ContextMenu.Root>

      {expanded ? (
        <div className="tree-children">
          {nestedContent}
          {connections.map((connection) => (
            <ConnectionTreeLeaf
              connection={connection}
              key={connection.id}
              nested
              dragging={connection.id === draggingConnectionId}
              onDelete={onDeleteConnection}
              onDragEnd={onConnectionDragEnd}
              onDragStart={onConnectionDragStart}
              onMouseDragStart={onMouseConnectionDragStart}
              onConnect={onConnect}
              onDuplicate={onDuplicate}
              onEdit={onEdit}
              onOpen={onOpen}
              onSelect={onSelect}
              onToggleFavorite={onToggleFavorite}
              selected={connection.id === selectedId}
            />
          ))}
        </div>
      ) : null}
    </div>
  );

  function dropConnection(event: DragEvent<HTMLElement>) {
    if (!onDropConnection) {
      return;
    }

    event.preventDefault();
    const connectionId = getDraggedConnectionId(event) || draggingConnectionId;

    if (!connectionId) {
      onConnectionDragEnd();
      return;
    }

    onDropConnection(connectionId);
  }
}

function ConnectionTreeLeaf({
  connection,
  dragging = false,
  nested = false,
  onDelete,
  onDragEnd,
  onDragStart,
  onMouseDragStart,
  onConnect,
  onDuplicate,
  onEdit,
  onOpen,
  onSelect,
  onToggleFavorite,
  selected,
}: {
  connection: ConnectionProfile;
  dragging?: boolean;
  nested?: boolean;
  onDelete: (connection: ConnectionProfile) => void | Promise<void>;
  onDragEnd: () => void;
  onDragStart: (event: DragEvent<HTMLElement>, connection: ConnectionProfile) => void;
  onMouseDragStart: (
    event: ReactMouseEvent<HTMLElement>,
    connection: ConnectionProfile,
  ) => void;
  onConnect: (connection: ConnectionProfile) => void;
  onDuplicate: (connection: ConnectionProfile) => void;
  onEdit: (connection: ConnectionProfile) => void;
  onOpen: (connection: ConnectionProfile) => void;
  onSelect: (connection: ConnectionProfile) => void;
  onToggleFavorite: (connection: ConnectionProfile) => void | Promise<void>;
  selected: boolean;
}) {
  const { t } = useI18n();
  const favoriteLabel = connection.is_favorite
    ? t("connectionPane.favorite.remove")
    : t("connectionPane.favorite.add");

  return (
    <ContextMenu.Root>
      <ContextMenu.Trigger asChild>
        <div className={`tree-connection-row ${nested ? "nested" : ""} ${selected ? "active" : ""} ${dragging ? "dragging" : ""}`}>
          <button
            className="tree-connection-main"
            type="button"
            onClick={() => onSelect(connection)}
            onDoubleClick={() => onConnect(connection)}
            onDragEnd={onDragEnd}
            onDragStart={(event) => onDragStart(event, connection)}
            onMouseDown={(event) => onMouseDragStart(event, connection)}
          >
            <ConnectionSystemLogo connection={connection} compact decorative />
            <span>
              <strong>{connection.name}</strong>
              <small>{formatAddress(connection, t)}</small>
            </span>
          </button>
          <Tooltip label={favoriteLabel}>
            <button
              className={`tree-connection-favorite ${connection.is_favorite ? "active" : ""}`}
              type="button"
              aria-label={`${favoriteLabel} ${connection.name}`}
              onMouseDown={(event) => event.stopPropagation()}
              onClick={(event) => {
                event.stopPropagation();
                void onToggleFavorite(connection);
              }}
            >
              <Star className="ui-icon" aria-hidden="true" />
            </button>
          </Tooltip>
        </div>
      </ContextMenu.Trigger>
      <ContextMenu.Portal>
        <ContextMenu.Content className="context-menu-content">
          <ContextMenu.Item className="context-menu-item" onSelect={() => onOpen(connection)}>
            <Play className="ui-icon" aria-hidden="true" />
            <span>
              {connection.protocol === "rdp"
                ? t("connectionPane.open.rdp")
                : connection.protocol === "vnc"
                  ? t("connectionPane.open.vnc")
                  : connection.protocol === "telnet"
                    ? t("connectionPane.open.telnet")
                    : connection.protocol === "serial"
                      ? t("connectionPane.open.serial")
                      : t("connectionPane.open.terminal")}
            </span>
          </ContextMenu.Item>
          <ContextMenu.Item className="context-menu-item" onSelect={() => onEdit(connection)}>
            <Pencil className="ui-icon" aria-hidden="true" />
            <span>{t("connectionPane.editConnection")}</span>
          </ContextMenu.Item>
          <ContextMenu.Item className="context-menu-item" onSelect={() => onDuplicate(connection)}>
            <Copy className="ui-icon" aria-hidden="true" />
            <span>{t("connectionPane.duplicateConnection")}</span>
          </ContextMenu.Item>
          <ContextMenu.Item className="context-menu-item" onSelect={() => void onToggleFavorite(connection)}>
            <Star className="ui-icon" aria-hidden="true" />
            <span>{favoriteLabel}</span>
          </ContextMenu.Item>
          <ContextMenu.Separator className="context-menu-separator" />
          <ContextMenu.Item className="context-menu-item danger" onSelect={requestDelete}>
            <Trash2 className="ui-icon" aria-hidden="true" />
            <span>{t("connectionPane.deleteConnection")}</span>
          </ContextMenu.Item>
        </ContextMenu.Content>
      </ContextMenu.Portal>
    </ContextMenu.Root>
  );

  function requestDelete() {
    void onDelete(connection);
  }
}

function formatAddress(connection: ConnectionProfile, t?: Translate) {
  if (connection.protocol === "rdp") {
    return `RDP · ${connection.username}@${connection.host}:${connection.port.toString()}`;
  }
  if (connection.protocol === "vnc") {
    return `VNC · ${connection.username}@${connection.host}:${connection.port.toString()}`;
  }
  if (connection.protocol === "telnet") {
    return `Telnet · ${connection.host}:${connection.port.toString()}`;
  }
  if (connection.protocol === "serial") {
    return `${t ? t("connectionPane.serial") : "Serial"} · ${connection.serial?.port_name || connection.host}`;
  }
  return `${connection.username}@${connection.host}:${connection.port.toString()}`;
}

function deleteRequestTitle(request: DeleteRequest | null, t: Translate) {
  if (!request) {
    return t("connectionPane.delete.confirm");
  }
  return request.type === "group"
    ? t("connectionPane.delete.groupTitle")
    : t("connectionPane.delete.connectionTitle");
}

function deleteRequestDescription(
  request: DeleteRequest | null,
  groups: CustomGroup[],
  t: Translate,
) {
  if (!request) {
    return "";
  }
  if (request.type === "group") {
    return t("connectionPane.delete.groupDescription", {
      name: request.group.name,
      count: groupDescendants(groups, request.group.id).size - 1,
    });
  }
  return t("connectionPane.delete.connectionDescription", { name: request.connection.name });
}

function buildCatalog(connections: ConnectionProfile[], recentConnectionLimit: number) {
  const sorted = [...connections].sort(sortConnectionsByRecent);
  const recent = sorted
    .filter((connection) => connectionTimestampOf(connection.last_connected_at) > 0)
    .sort(sortConnectionsByRecent)
    .slice(0, recentConnectionLimit);

  return {
    favorites: sorted.filter((connection) => connection.is_favorite),
    recent,
  } satisfies Record<SystemFolderId, ConnectionProfile[]>;
}

function getDraggedConnectionId(event: DragEvent<HTMLElement>) {
  return (
    event.dataTransfer.getData(connectionDragDataType) ||
    event.dataTransfer.getData("text/plain")
  );
}

function isConnectionDrag(event: DragEvent<HTMLElement>) {
  return Array.from(event.dataTransfer.types).some(
    (type) => type.toLowerCase() === connectionDragDataType || type.toLowerCase() === "text/plain",
  );
}

function mouseDragDistance(drag: MouseDragState, event: MouseEvent) {
  return Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY);
}

function getDropTargetFromPoint(x: number, y: number): DropTargetId | null {
  const target = document
    .elementFromPoint(x, y)
    ?.closest<HTMLElement>("[data-drop-target-id]");
  const targetId = target?.dataset.dropTargetId;

  if (targetId === "root" || targetId?.startsWith("group-")) {
    return targetId as DropTargetId;
  }

  return null;
}

function readStoredExpandedFolders(): Record<FolderId, boolean> {
  const defaults = {
    favorites: true,
    recent: true,
  } as Record<FolderId, boolean>;

  if (typeof window === "undefined") {
    return defaults;
  }

  try {
    const raw = window.localStorage.getItem(expandedFolderStorageKey);
    const parsed: unknown = raw ? JSON.parse(raw) : {};
    if (!isRecord(parsed)) {
      return defaults;
    }

    return Object.entries(parsed).reduce<Record<FolderId, boolean>>((folders, [id, expanded]) => {
      if (isFolderId(id) && typeof expanded === "boolean") {
        folders[id] = expanded;
      }
      return folders;
    }, { ...defaults });
  } catch {
    return defaults;
  }
}

function writeStoredExpandedFolders(folders: Record<FolderId, boolean>) {
  try {
    const serializable = Object.fromEntries(
      Object.entries(folders).filter(
        ([id, expanded]) => isFolderId(id) && typeof expanded === "boolean",
      ),
    );
    window.localStorage.setItem(expandedFolderStorageKey, JSON.stringify(serializable));
  } catch {
    // localStorage can be unavailable in restricted preview contexts.
  }
}

function isFolderId(value: string): value is FolderId {
  return value === "favorites" || value === "recent" || value.startsWith("group-");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
