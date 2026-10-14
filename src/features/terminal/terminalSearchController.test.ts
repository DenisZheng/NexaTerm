import { afterEach, describe, expect, it, vi } from "vitest";
import { SearchAddon } from "@xterm/addon-search";
import { Terminal, type IBufferRange } from "@xterm/xterm";
import {
  createTerminalSearchController, terminalSearchTerm, TERMINAL_SEARCH_DEBOUNCE_MS,
  TERMINAL_SEARCH_QUERY_LIMIT, type TerminalSearchIntent, type TerminalSearchResult,
} from "./terminalSearchController";

const decorations = { matchOverviewRuler: "#2374c6", activeMatchColorOverviewRuler: "#2374c6" };
const intent = (query: string, extra: Partial<TerminalSearchIntent> = {}): TerminalSearchIntent =>
  ({ open: true, query, caseSensitive: false, wholeWord: false, ...extra });
const disposals: (() => void)[] = [];
afterEach(() => { disposals.splice(0).reverse().forEach((dispose) => dispose()); vi.useRealTimers(); });

function actualSearch(cols = 80) {
  const terminal = new Terminal({ allowProposedApi: true, cols, rows: 5, scrollback: 8000 });
  // Exercise the real buffer, engine, result tracker and decorations. Without
  // opening a renderer, supply only the public selection surface it normally
  // installs; this fixture makes no GUI/font/platform claim.
  let selection: IBufferRange | undefined;
  terminal.select = (col, row, size) => {
    const end = col + size;
    selection = { start: { x: col, y: row }, end: { x: end % cols, y: row + Math.floor(end / cols) } };
  };
  terminal.getSelectionPosition = () => selection;
  terminal.clearSelection = () => { selection = undefined; };
  const addon = new SearchAddon({ highlightLimit: 1000 });
  terminal.loadAddon(addon);
  const results: TerminalSearchResult[] = [];
  const controller = createTerminalSearchController(addon, terminal, (result) => results.push(result));
  disposals.push(() => { controller.dispose(); terminal.dispose(); });
  return { terminal, controller, results, selected: () => selection,
    write: (text: string) => new Promise<void>((resolve) => terminal.write(text, resolve)),
    search(query: string, extra: Partial<TerminalSearchIntent> = {}) {
      controller.configure(intent(query, extra), decorations);
      controller.navigate("next");
      return results[results.length - 1];
    } };
}

describe("terminal search against the installed xterm addon", () => {
  it("refreshes case and whole-word matches for the same query, including later candidates on a line", async () => {
    const s = actualSearch();
    await s.write("terror error Error error.\r\n");
    expect(s.search("error")).toMatchObject({ kind: "matches", count: 4 });
    expect(s.search("error", { wholeWord: true })).toMatchObject({ kind: "matches", count: 3 });
    expect(s.search("error", { wholeWord: true, caseSensitive: true })).toMatchObject({ kind: "matches", count: 2 });
    expect(s.search("error", { caseSensitive: true })).toMatchObject({ kind: "matches", count: 3 });
    expect(s.search("error")).toMatchObject({ kind: "matches", count: 4 });
  });

  it("keeps regex punctuation literal even in whole-word mode", async () => {
    const s = actualSearch();
    await s.write("[x]+.$ other pre[x]+.$ [x]+.$suffix\r\n");
    expect(s.search("[x]+.$", { wholeWord: true })).toMatchObject({ kind: "matches", count: 1 });
    expect(s.selected()?.start).toEqual({ x: 0, y: 0 });
    expect(s.selected()?.end).toEqual({ x: 6, y: 0 });
    expect(s.search("[x]+.$")).toMatchObject({ kind: "matches", count: 3 });
  });

  it("finds literal spaces and preserves leading/trailing whitespace", async () => {
    const s = actualSearch();
    await s.write("a  b a b\r\n");
    expect(s.search("  ")).toMatchObject({ kind: "matches", count: 1 });
    expect(s.search(" a ")).toMatchObject({ kind: "matches", count: 1 });
    expect(s.search("missing")).toEqual({ kind: "no-match" });
    expect(s.search("")).toEqual({ kind: "idle" });
    expect(s.selected()).toBeUndefined();
  });

  it("searches wrapped Unicode output without changing its buffer", async () => {
    const s = actualSearch(6);
    await s.write("aa 测试 end\r\n");
    const before = Array.from({ length: s.terminal.buffer.active.length }, (_, i) => s.terminal.buffer.active.getLine(i)?.translateToString()).join("\n");
    expect(s.search("测试", { wholeWord: true })).toMatchObject({ kind: "matches", count: 1 });
    const after = Array.from({ length: s.terminal.buffer.active.length }, (_, i) => s.terminal.buffer.active.getLine(i)?.translateToString()).join("\n");
    expect(after).toBe(before);
    expect(s.selected()?.start).toEqual({ x: 3, y: 0 });
  });

  it("navigates forwards and backwards while preserving active modes", async () => {
    const s = actualSearch();
    await s.write("terror error Error error.\r\n");
    s.search("error", { wholeWord: true, caseSensitive: true });
    expect(s.selected()?.start.x).toBe(7);
    s.controller.navigate("next");
    expect(s.selected()?.start.x).toBe(19);
    s.controller.navigate("previous");
    expect(s.selected()?.start.x).toBe(7);
  });

  it("reports the highlight cap as a lower bound instead of an exact total", async () => {
    const s = actualSearch();
    await s.write(Array.from({ length: 1005 }, () => "hit\r\n").join(""));
    expect(s.search("hit")).toEqual({ kind: "limit" });
    s.controller.navigate("previous");
    expect(s.results[s.results.length - 1]).toEqual({ kind: "limit" });
  });

  it("updates matches on parsed live output, then suppresses updates after close", async () => {
    const s = actualSearch();
    await s.write("hit\r\n");
    s.search("hit");
    await s.write("hit\r\n");
    await vi.waitFor(() => expect(s.results[s.results.length - 1]).toMatchObject({ kind: "matches", count: 2 }));
    s.controller.configure(intent("hit", { open: false }), decorations);
    const count = s.results.length;
    expect(s.selected()).toBeUndefined();
    await s.write("hit\r\n");
    await new Promise((resolve) => setTimeout(resolve, 250));
    expect(s.results).toHaveLength(count);
  });
});

function fakeSearch() {
  vi.useFakeTimers();
  let callback: ((event: { resultIndex: number; resultCount: number }) => void) | null = null;
  const subscription = { dispose: vi.fn(() => { callback = null; }) };
  const find = vi.fn(() => { callback?.({ resultIndex: 0, resultCount: 1 }); return true; });
  const addon = { findNext: find, findPrevious: find, clearDecorations: vi.fn(),
    onDidChangeResults: (listener: NonNullable<typeof callback>) => { callback = listener; return subscription; } };
  const terminal = { clearSelection: vi.fn() };
  const results: TerminalSearchResult[] = [];
  const controller = createTerminalSearchController(addon, terminal, (result) => results.push(result));
  disposals.push(() => controller.dispose());
  return { controller, addon, terminal, results, subscription,
    emit: (count: number) => callback?.({ resultIndex: 0, resultCount: count }) };
}

describe("terminal search intent lifecycle", () => {
  it("debounces edits and flushes explicit navigation exactly once", () => {
    const s = fakeSearch();
    s.controller.configure(intent("old"), decorations);
    s.controller.configure(intent("new", { wholeWord: true }), decorations);
    s.emit(9);
    expect(s.results[s.results.length - 1]).toEqual({ kind: "pending" });
    s.controller.navigate("next");
    vi.advanceTimersByTime(TERMINAL_SEARCH_DEBOUNCE_MS * 2);
    expect(s.addon.findNext).toHaveBeenCalledTimes(1);
    expect(s.addon.findNext).toHaveBeenCalledWith(terminalSearchTerm("new", true), expect.objectContaining({ regex: true, wholeWord: false }));
    expect(s.results[s.results.length - 1]).toEqual({ kind: "matches", index: 0, count: 1 });
  });

  it("cancels on close and disposal, ignores late events, and releases selection/listener", () => {
    const s = fakeSearch();
    s.controller.configure(intent("needle"), decorations);
    s.controller.configure(intent("needle", { open: false }), decorations);
    vi.runAllTimers(); s.emit(7);
    expect(s.addon.findNext).not.toHaveBeenCalled();
    expect(s.results[s.results.length - 1]).toEqual({ kind: "idle" });
    expect(s.terminal.clearSelection).toHaveBeenCalled();
    s.controller.configure(intent("again"), decorations);
    s.controller.dispose(); s.controller.dispose();
    vi.runAllTimers(); s.controller.navigate("next"); s.emit(2);
    expect(s.addon.findNext).not.toHaveBeenCalled();
    expect(s.subscription.dispose).toHaveBeenCalledTimes(1);
  });

  it("rejects overlong input without truncation and accepts a later valid query", () => {
    const s = fakeSearch();
    const query = "x".repeat(TERMINAL_SEARCH_QUERY_LIMIT + 1);
    s.controller.configure(intent(query), decorations); s.controller.navigate("next"); vi.runAllTimers();
    expect(s.results[s.results.length - 1]).toEqual({ kind: "too-long" });
    expect(s.addon.findNext).not.toHaveBeenCalled();
    s.controller.configure(intent("fixed"), decorations); vi.runAllTimers();
    expect(s.addon.findNext).toHaveBeenCalledWith("fixed", expect.objectContaining({ regex: false }));
  });

  it("clears stale highlights on a palette change and reports safe failures with retry", () => {
    const s = fakeSearch();
    s.controller.configure(intent("needle"), decorations); vi.runAllTimers();
    const clears = s.addon.clearDecorations.mock.calls.length;
    s.controller.configure(intent("needle"), { ...decorations, matchOverviewRuler: "#123456" });
    expect(s.addon.clearDecorations).toHaveBeenCalledTimes(clears + 1);
    s.addon.findNext.mockImplementationOnce(() => { throw new Error("opaque synthetic detail"); });
    vi.runAllTimers();
    expect(s.results[s.results.length - 1]).toEqual({ kind: "unavailable" });
    s.controller.configure(intent("retry"), decorations); vi.runAllTimers();
    expect(s.results[s.results.length - 1]).toEqual({ kind: "matches", index: 0, count: 1 });
  });
});
