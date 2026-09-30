import type { WorkspaceActionRequest, WorkspaceActionState } from "../shortcuts/actionRegistry";
import type { NewSessionMenuProps } from "./NewSessionMenu";

export interface ActionEntryProps {
  newSession: NewSessionMenuProps;
  resolveAction: (request: WorkspaceActionRequest) => WorkspaceActionState;
  onRunAction: (request: WorkspaceActionRequest) => void;
}
