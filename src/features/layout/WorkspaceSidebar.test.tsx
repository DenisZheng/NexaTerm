// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { useState } from "react";

import { setLocalePreference } from "../../shared/i18n";
import {
  WorkspaceSidebar,
  readStoredWorkspaceSidebarView,
  workspaceSidebarViewStorageKey,
  writeStoredWorkspaceSidebarView,
  type WorkspaceSidebarFileContext,
  type WorkspaceSidebarView,
} from "./WorkspaceSidebar";

const fileContext: WorkspaceSidebarFileContext = {
  connectionId: "fixture-connection",
  connectionName: "Fixture SSH",
  path: "/srv/app",
  tabId: "fixture-tab",
};

function Harness({
  context = fileContext,
  initialView = "sessions",
}: {
  context?: WorkspaceSidebarFileContext | null;
  initialView?: WorkspaceSidebarView;
}) {
  const [view, setView] = useState<WorkspaceSidebarView>(initialView);
  return (
    <WorkspaceSidebar
      activeView={view}
      fileContext={context}
      files={context ? <div data-testid="live-files">Live Files fixture</div> : null}
      onViewChange={setView}
      sessions={<div>Session fixture</div>}
    />
  );
}

beforeEach(() => {
  window.localStorage.clear();
  setLocalePreference("en");
});
afterEach(cleanup);

describe("WF-01 slice 5 workspace sidebar shell", () => {
  it("switches Sessions and Files with one accessible tab stop", () => {
    render(<Harness />);
    const sessions = screen.getByRole("tab", { name: "Sessions" });
    const files = screen.getByRole("tab", { name: "Files" });
    expect(sessions.getAttribute("aria-selected")).toBe("true");
    expect(sessions.tabIndex).toBe(0);
    expect(files.tabIndex).toBe(-1);
    expect(screen.getByText("Session fixture")).toBeDefined();

    fireEvent.click(files);
    expect(files.getAttribute("aria-selected")).toBe("true");
    expect(files.tabIndex).toBe(0);
    expect(screen.getByText("Remote Files")).toBeDefined();
  });

  it("supports arrow/Home/End navigation without adding another menu system", () => {
    render(<Harness />);
    const sessions = screen.getByRole("tab", { name: "Sessions" });
    const files = screen.getByRole("tab", { name: "Files" });
    sessions.focus();
    fireEvent.keyDown(sessions, { key: "ArrowRight" });
    expect(document.activeElement).toBe(files);
    expect(files.getAttribute("aria-selected")).toBe("true");
    fireEvent.keyDown(files, { key: "Home" });
    expect(document.activeElement).toBe(sessions);
  });

  it("renders the live Files view only for the resolved SSH context", () => {
    render(<Harness initialView="files" />);
    const panel = screen.getByRole("tabpanel");
    expect(panel.getAttribute("data-connection-id")).toBe("fixture-connection");
    expect(panel.getAttribute("data-terminal-id")).toBe("fixture-tab");
    expect(screen.getByTestId("live-files").textContent).toContain("Live Files fixture");
    expect(screen.queryByText(/WF-03/)).toBeNull();
  });

  it("fails closed when no SSH terminal or SSH pane is active", () => {
    render(<Harness context={null} initialView="files" />);
    expect(screen.getByText("Select an SSH terminal or SSH pane to bind Files.")).toBeDefined();
    expect(screen.queryByText("Fixture SSH")).toBeNull();
  });

  it("persists only the selected non-sensitive sidebar view", () => {
    writeStoredWorkspaceSidebarView("files", window.localStorage);
    expect(readStoredWorkspaceSidebarView(window.localStorage)).toBe("files");
    window.localStorage.setItem(workspaceSidebarViewStorageKey, "unexpected");
    expect(readStoredWorkspaceSidebarView(window.localStorage)).toBe("sessions");
  });
});
