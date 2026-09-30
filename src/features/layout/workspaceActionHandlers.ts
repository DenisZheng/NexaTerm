import type { ActionTarget } from "../shortcuts/actionContext";
import type { WorkspaceActionHandler } from "../shortcuts/actionExecutor";

type ApplicationOperation = () => void | Promise<void>;
type InstanceTarget = Extract<ActionTarget, { kind: "instance" }>;
type TerminalInstanceTarget = InstanceTarget & { readonly instanceKind: "ssh" | "local" };
type InstanceOperation = (target: InstanceTarget, rawId: string) => void | Promise<void>;
type TerminalOperation = (target: TerminalInstanceTarget, rawId: string) => void | Promise<void>;

export interface WorkspaceActionOperations {
  readonly quickOpen: ApplicationOperation;
  readonly openSettings: ApplicationOperation;
  readonly toggleSidebar: ApplicationOperation;
  readonly toggleTools: ApplicationOperation;
  readonly toggleCommandSender: ApplicationOperation;
  readonly closeInstance: InstanceOperation;
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
const instance = (operation: InstanceOperation): WorkspaceActionHandler =>
  (target) => target.kind === "instance" ? operation(target, rawInstanceId(target.instanceId)) : undefined;
const terminalInstance = (operation: TerminalOperation): WorkspaceActionHandler =>
  (target) => target.kind === "instance" && (target.instanceKind === "ssh" || target.instanceKind === "local")
    ? operation(target as TerminalInstanceTarget, rawInstanceId(target.instanceId)) : undefined;

function rawInstanceId(instanceId: string) {
  const separator = instanceId.indexOf(":");
  return separator < 0 ? instanceId : instanceId.slice(separator + 1);
}

/** 4D-1 business adapter. It owns no state and never imports WorkspaceShell. */
export function createWorkspaceActionHandlers(operations: WorkspaceActionOperations) {
  return {
    "connection.quickOpen": application(operations.quickOpen),
    "settings.open": application(operations.openSettings),
    "view.toggleSidebar": application(operations.toggleSidebar),
    "view.toggleTools": application(operations.toggleTools),
    "commandSender.toggle": application(operations.toggleCommandSender),
    "terminal.closeTab": instance(operations.closeInstance),
    "terminal.newTab": terminalInstance(operations.newTerminal),
    "terminal.search.toggle": terminalInstance(operations.toggleSearch),
    "terminal.search.next": terminalInstance(operations.searchNext),
    "terminal.search.previous": terminalInstance(operations.searchPrevious),
    "terminal.splitRight": terminalInstance(operations.splitRight),
    "terminal.splitDown": terminalInstance(operations.splitDown),
    "terminal.splitFour": terminalInstance(operations.splitFour),
  } satisfies Readonly<Record<string, WorkspaceActionHandler>>;
}
