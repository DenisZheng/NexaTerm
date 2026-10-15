// @vitest-environment jsdom
import { useState } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { TerminalKeywordSettings } from "./TerminalKeywordSettings";
import { setLocalePreference } from "../../shared/i18n";
import type { TerminalKeywordRule } from "../terminal/terminalKeywordRules";
import { useSettings } from "./useSettings";
import { settingsStorageKey } from "./startupSettings";
afterEach(() => { cleanup(); localStorage.clear(); });
it("saves explicitly through existing settings storage and restores after remount", () => {
  setLocalePreference("en");
  function Harness() {
    const { settings, updateAppearance } = useSettings();
    return <TerminalKeywordSettings rules={settings.appearance.terminalKeywordRules}
      onChange={(terminalKeywordRules)=>updateAppearance({terminalKeywordRules})} />;
  }
  const f=render(<Harness/>);
  fireEvent.change(screen.getByLabelText("Warning · yellow"),{target:{value:"timeout\nretry later"}});
  expect(JSON.parse(localStorage.getItem(settingsStorageKey)!).appearance.terminalKeywordRules).toEqual([]);
  fireEvent.click(screen.getByText("Save and apply"));
  expect(JSON.parse(localStorage.getItem(settingsStorageKey)!).appearance.terminalKeywordRules).toEqual([
    {text:"timeout",kind:"warning"},{text:"retry later",kind:"warning"},
  ]);
  f.unmount(); render(<Harness/>);
  expect((screen.getByLabelText("Warning · yellow") as HTMLTextAreaElement).value).toBe("timeout\nretry later");
});
it("keeps invalid edits visible, disables save, and discards without writing", () => {
  setLocalePreference("en"); const change=vi.fn();
  render(<TerminalKeywordSettings rules={[]} onChange={change}/>);
  fireEvent.change(screen.getByLabelText("Error · red"),{target:{value:"timeout\nTIMEOUT"}});
  expect(screen.getByRole("alert").textContent).toContain("more than once");
  expect((screen.getByText("Save and apply") as HTMLButtonElement).disabled).toBe(true);
  fireEvent.click(screen.getByText("Discard edits"));
  expect((screen.getByLabelText("Error · red") as HTMLTextAreaElement).value).toBe("");
  expect(change).not.toHaveBeenCalled();
});
it("clears rules explicitly and responds to Appearance reset", () => {
  setLocalePreference("en");
  function Harness() {
    const [rules,setRules]=useState<TerminalKeywordRule[]>([{text:"timeout",kind:"warning"}]);
    return <><TerminalKeywordSettings rules={rules} onChange={setRules}/>
      <button onClick={()=>setRules([])}>reset</button></>;
  }
  render(<Harness/>);
  fireEvent.change(screen.getByLabelText("Warning · yellow"),{target:{value:"new draft"}});
  fireEvent.click(screen.getByText("reset"));
  expect((screen.getByLabelText("Warning · yellow") as HTMLTextAreaElement).value).toBe("");
});
