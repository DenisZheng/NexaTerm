import type { ActionTarget } from "../shortcuts/actionContext";
import type { WorkspaceActionHandler } from "../shortcuts/actionExecutor";

type ApplicationOperation = () => void | Promise<void>;
type InstanceTarget = Extract<ActionTarget, { kind: "instance" }>;
type TerminalInstanceTarget = InstanceTarget & { readonly instanceKind: "ssh" | "local" };
type ItemLikeTarget = Extract<ActionTarget, { readonly itemId: string }>;
type ItemTarget = ItemLikeTarget & { readonly kind: "item" };
type PaneTarget = Extract<ActionTarget, { kind: "pane" }>;
type SplitGroupTarget = ItemLikeTarget & { readonly kind: "split-group" };
type InstanceOperation = (target: InstanceTarget, rawId: string) => void | Promise<void>;
type TerminalOperation = (target: TerminalInstanceTarget, rawId: string) => void | Promise<void>;

export interface WorkspaceActionOperations {
  readonly quickOpen: ApplicationOperation;
  readonly openSettings: ApplicationOperation;
  readonly toggleSidebar: ApplicationOperation;
  readonly toggleTools: ApplicationOperation;
  readonly toggleCommandSender: ApplicationOperation;
  readonly openTunnels: ApplicationOperation;
  readonly closeItem: (target: ItemTarget) => void | Promise<void>;
  readonly closeInstance: InstanceOperation;
  readonly closePane: (target: PaneTarget) => void | Promise<void>;
  readonly closeSplitGroup: (target: SplitGroupTarget) => void | Promise<void>;
  readonly newTerminal: TerminalOperation;
  readonly toggleSearch: TerminalOperation;
  readonly searchNext: TerminalOperation;
  readonly searchPrevious: TerminalOperation;
  readonly splitRight: TerminalOperation;
  readonly splitDown: TerminalOperation;
  readonly splitFour: TerminalOperation;
}

const application = (operation: ApplicationOperation): WorkspaceActionHandler =>
  (target) => target.kind === "application" ? operation() : undefined;
const item = (operation: WorkspaceActionOperations["closeItem"]): WorkspaceActionHandler =>
  (target) => target.kind === "item" ? operation(target as ItemTarget) : undefined;
const pane = (operation: WorkspaceActionOperations["closePane"]): WorkspaceActionHandler =>
  (target) => target.kind === "pane" ? operation(target) : undefined;
const splitGroup = (operation: WorkspaceActionOperations["closeSplitGroup"]): WorkspaceActionHandler =>
  (target) => target.kind === "split-group" ? operation(target as SplitGroupTarget) : undefined;
const instance = (operation: InstanceOperation): WorkspaceActionHandler =>
  (target) => target.kind === "instance" ? operation(target, rawInstanceId(target.instanceId)) : undefined;
const terminalInstance = (operation: TerminalOperation): WorkspaceActionHandler =>
  (target) => target.kind === "instance" && (target.instanceKind === "ssh" || target.instanceKind === "local")
    ? operation(target as TerminalInstanceTarget, rawInstanceId(target.instanceId)) : undefined;

function rawInstanceId(instanceId: string) {
  const separator = instanceId.indexOf(":");
  return separator < 0 ? instanceId : instanceId.slice(separator + 1);
}

export function createWorkspaceActionHandlers(
  operations: WorkspaceActionOperations,
): Readonly<Record<string, WorkspaceActionHandler>> {
  return {
    "connection.quickOpen": application(operations.quickOpen),
    "settings.open": application(operations.openSettings),
    "view.toggleSidebar": application(operations.toggleSidebar),
    "view.toggleTools": application(operations.toggleTools),
    "commandSender.toggle": application(operations.toggleCommandSender),
    "tools.tunnels": application(operations.openTunnels),
    "workspace.closeItem": item(operations.closeItem),
    "terminal.closeTab": instance(operations.closeInstance),
    "terminal.closePane": pane(operations.closePane),
    "terminal.closeSplitGroup": splitGroup(operations.closeSplitGroup),
    "terminal.newTab": terminalInstance(operations.newTerminal),
    "terminal.search.toggle": terminalInstance(operations.toggleSearch),
    "terminal.search.next": terminalInstance(operations.searchNext),
    "terminal.search.previous": terminalInstance(operations.searchPrevious),
    "terminal.splitRight": terminalInstance(operations.splitRight),
    "terminal.splitDown": terminalInstance(operations.splitDown),
    "terminal.splitFour": terminalInstance(operations.splitFour),
  };
}
