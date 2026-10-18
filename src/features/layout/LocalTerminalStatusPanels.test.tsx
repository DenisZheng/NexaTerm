// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { t } from "../../shared/i18n";
import { LocalTerminalEmptyPanel, LocalTerminalStatusPanel } from "./LocalTerminalStatusPanels";
afterEach(cleanup);
describe("existing local status panels before native extension",()=>{
  it("keeps empty-profile open disabled while settings remain available",()=>{
    const open=vi.fn(),settings=vi.fn();render(<LocalTerminalEmptyPanel active error={null} loading={false} profileName={null} onOpenDefault={open} onOpenSettings={settings}/>);
    const button=screen.getByRole("button",{name:t("workspace.local.openDefault")});expect(button).toHaveProperty("disabled",true);
    fireEvent.click(screen.getByRole("button",{name:t("workspace.local.openSettings")}));expect(settings).toHaveBeenCalledTimes(1);expect(open).not.toHaveBeenCalled();
  });
  it.each(["telnet","serial"] as const)("keeps failed %s retry independent of local settings",source=>{
    const retry=vi.fn(),settings=vi.fn();render(<LocalTerminalStatusPanel active error="fixture failure" profile={null} source={source} status="连接失败" title="Fixture" onOpenSettings={settings} onRetry={retry}/>);
    expect(screen.getByText("fixture failure")).toBeDefined();fireEvent.click(screen.getByRole("button",{name:t("workspace.rdp.retry")}));expect(retry).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("button",{name:t("workspace.local.openSettings")})).toBeNull();
  });
  it("keeps hidden panes inaccessible and preserves local retry/settings actions",()=>{
    const retry=vi.fn(),settings=vi.fn();const view=render(<LocalTerminalStatusPanel active={false} visible={false} error="fixture" profile={null} source="local" status="连接失败" title="Fixture" onOpenSettings={settings} onRetry={retry}/>);
    expect(screen.queryByRole("button")).toBeNull();view.rerender(<LocalTerminalStatusPanel active error="fixture" profile={null} source="local" status="连接失败" title="Fixture" onOpenSettings={settings} onRetry={retry}/>);
    fireEvent.click(screen.getByRole("button",{name:t("workspace.local.openSettings")}));expect(settings).toHaveBeenCalledTimes(1);
  });
});
