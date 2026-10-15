import { afterEach, expect, it, vi } from "vitest";
import { Terminal } from "@xterm/xterm";
import { createTerminalSemanticHighlighter, findTerminalSemanticTokens, getTerminalSemanticHighlightPalette,
  TERMINAL_SEMANTIC_MAX_CHARS, TERMINAL_SEMANTIC_MAX_LINE_TOKENS, TERMINAL_SEMANTIC_MAX_DECORATIONS } from "./terminalSemanticHighlight";

const cleanups: (() => void)[] = [];
afterEach(() => { cleanups.splice(0).reverse().forEach((fn) => fn()); vi.unstubAllGlobals(); });
const pairs = (text: string) => findTerminalSemanticTokens(text).map(({ kind, text }) => [kind, text]);

it("matches fixed complete severity words without changing case or offsets", () => {
  expect(pairs("[ERROR] fatal Fail failed FAILURE warn WARNING success Succeeded passed")).toEqual([
    ["error", "ERROR"], ["error", "fatal"], ["error", "Fail"], ["error", "failed"], ["error", "FAILURE"],
    ["warning", "warn"], ["warning", "WARNING"], ["success", "success"], ["success", "Succeeded"], ["success", "passed"],
  ]);
  expect(findTerminalSemanticTokens("中: ERROR")[0]).toMatchObject({ start: 3, end: 8, text: "ERROR" });
});

it("respects Unicode letters, marks, numbers and underscores at word boundaries", () => {
  expect(pairs("terror error_count failed2 warnings unsuccessful 中error error中 erroré error\u0301")).toEqual([]);
  expect(pairs("(error),warning:success")).toEqual([["error", "error"], ["warning", "warning"], ["success", "success"]]);
});

it("keeps existing URL/version/IP priorities over words inside them", () => {
  expect(pairs("https://example.invalid/error?warning=success 1.2.3-failed 10.1.2.3 ERROR")).toEqual([
    ["url", "https://example.invalid/error?warning=success"], ["version", "1.2.3-failed"], ["ip", "10.1.2.3"], ["error", "ERROR"],
  ]);
});

it("bounds token count and scan length without turning the cap into a word boundary", () => {
  expect(findTerminalSemanticTokens("error ".repeat(1000))).toHaveLength(TERMINAL_SEMANTIC_MAX_LINE_TOKENS);
  expect(pairs(" ".repeat(TERMINAL_SEMANTIC_MAX_CHARS) + "error")).toEqual([]);
  expect(pairs(" ".repeat(TERMINAL_SEMANTIC_MAX_CHARS - 5) + "errorSuffix")).toEqual([]);
  expect(pairs(" ".repeat(TERMINAL_SEMANTIC_MAX_CHARS - 5) + "error中")).toEqual([]);
});

it("uses the selected terminal palette for severity in light and dark schemes", () => {
  for (const background of ["#ffffff", "#000000"]) {
    expect(getTerminalSemanticHighlightPalette({ background, red: "#aa0000", yellow: "#aaaa00", green: "#00aa00" }))
      .toMatchObject({ error: "#aa0000", warning: "#aaaa00", success: "#00aa00" });
    const fallback = getTerminalSemanticHighlightPalette({ background });
    expect(fallback.warning).toBe(fallback.url);
    expect(fallback.success).toBe(fallback.date);
  }
});

function actual(cols = 100, rows = 5) {
  vi.stubGlobal("window", { setTimeout, clearTimeout });
  const terminal = new Terminal({ allowProposedApi: true, cols, rows, scrollback: 1000 });
  const records: { x: number; width: number; colour: string | undefined; disposed: boolean }[] = [];
  const lineRecords: { disposed: () => boolean; line: () => number }[] = [];
  const register = terminal.registerDecoration.bind(terminal);
  vi.spyOn(terminal, "registerDecoration").mockImplementation((options) => {
    const decoration = register(options);
    if (decoration) {
      const record = { x: options.x ?? 0, width: options.width ?? 1, colour: options.foregroundColor, disposed: false };
      records.push(record);
      lineRecords.push({ disposed: () => record.disposed, line: () => options.marker.line });
      decoration.onDispose(() => { record.disposed = true; });
    }
    return decoration;
  });
  const highlighter = createTerminalSemanticHighlighter(terminal,
    { palette: getTerminalSemanticHighlightPalette({ red: "#aa0000", green: "#00aa00", yellow: "#aaaa00" }) });
  cleanups.push(() => { highlighter.dispose(); terminal.dispose(); });
  return { terminal, highlighter, records, liveLines: () => new Set(lineRecords.filter((item) => !item.disposed()).map((item) => item.line())), live: () => records.filter((record) => !record.disposed),
    write: (data: string) => new Promise<void>((resolve) => terminal.write(data, resolve)) };
}

it("uses actual wide-cell positions and preserves ANSI, inverse and invisible output", async () => {
  const f = actual();
  const input = "中: ERROR \x1b[31mfailed\x1b[0m \x1b[7mwarning\x1b[0m \x1b[8msuccess\x1b[0m";
  await f.write(input);
  const before = f.terminal.buffer.active.getLine(0)?.translateToString(true);
  f.highlighter.refresh();
  expect(f.live()).toEqual([{ x: 4, width: 5, colour: "#aa0000", disposed: false }]);
  expect(f.terminal.buffer.active.getLine(0)?.translateToString(true)).toBe(before);
});

it("recolours existing matches and releases decorations on alternate buffer and disposal", async () => {
  const f = actual();
  await f.write("ERROR warning success");
  f.highlighter.refresh();
  expect(f.live()).toHaveLength(3);
  f.highlighter.setPalette(getTerminalSemanticHighlightPalette({ red: "#bb0000" }));
  expect(f.records.slice(0, 3).every((item) => item.disposed)).toBe(true);
  expect(f.live()[0].colour).toBe("#bb0000");
  await f.write("\x1b[?1049hERROR");
  f.highlighter.refresh();
  expect(f.live()).toHaveLength(0);
  await f.write("\x1b[?1049l");
  f.highlighter.refresh();
  expect(f.live()).toHaveLength(3);
  f.highlighter.dispose();
  f.highlighter.refresh();
  expect(f.live()).toHaveLength(0);
});

it("caps real decorations and replaces scrolled-out matches with current viewport matches", async () => {
  const f = actual(400, 5);
  await f.write(Array.from({ length: 120 }, () => "error ".repeat(64)).join("\r\n"));
  f.highlighter.refresh();
  expect(f.live().length).toBeLessThanOrEqual(TERMINAL_SEMANTIC_MAX_DECORATIONS);
  expect(f.live().length).toBeGreaterThan(0);
  await f.write("\r\n".repeat(400) + "success");
  f.highlighter.refresh();
  expect(f.live()).toEqual([{ x: 0, width: 7, colour: "#00aa00", disposed: false }]);
});

it("evicts retained backlog decorations when a newly visible viewport needs capacity", async () => {
  const f = actual(400, 5);
  await f.write(Array.from({ length: 120 }, () => "error ".repeat(64)).join("\r\n"));
  f.highlighter.refresh();
  expect(f.live()).toHaveLength(TERMINAL_SEMANTIC_MAX_DECORATIONS);
  f.terminal.scrollToLine(60);
  f.highlighter.refresh();
  expect(f.terminal.buffer.active.viewportY).toBe(60);
  for (let line = 60; line < 65; line += 1) expect(f.liveLines().has(line)).toBe(true);
  expect(f.live().length).toBeLessThanOrEqual(TERMINAL_SEMANTIC_MAX_DECORATIONS);
});

it("does not invent a whole-word boundary at the physical-cell scan cap", async () => {
  const f = actual(4100, 2);
  await f.write(" ".repeat(TERMINAL_SEMANTIC_MAX_CHARS - 5) + "errorSuffix");
  f.highlighter.refresh();
  expect(f.live()).toHaveLength(0);
});
