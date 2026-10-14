import type { ISearchOptions, ISearchResultChangeEvent, SearchAddon } from "@xterm/addon-search";
import type { Terminal } from "@xterm/xterm";

import { TERMINAL_SEARCH_HIGHLIGHT_LIMIT, TERMINAL_SEARCH_QUERY_LIMIT, TERMINAL_SEARCH_DEBOUNCE_MS } from "./terminalSearchLimits";
export { TERMINAL_SEARCH_HIGHLIGHT_LIMIT, TERMINAL_SEARCH_QUERY_LIMIT, TERMINAL_SEARCH_DEBOUNCE_MS } from "./terminalSearchLimits";

export interface TerminalSearchIntent {
  open: boolean;
  query: string;
  caseSensitive: boolean;
  wholeWord: boolean;
}

export interface TerminalSearchNavigationRequest {
  direction: "next" | "previous";
  id: number;
  tabId: string;
}

export type TerminalSearchResult =
  | { kind: "idle" | "pending" | "no-match" | "limit" | "too-long" | "unavailable" }
  | { kind: "matches"; index: number; count: number };

type SearchApi = Pick<SearchAddon, "findNext" | "findPrevious" | "clearDecorations" | "onDidChangeResults">;
export type TerminalSearchDecorations = NonNullable<ISearchOptions["decorations"]>;

// A generated, fixed-boundary pattern avoids the addon's wholeWord candidate
// skipping bug. User input is always escaped literal text, never a regex.
export function terminalSearchTerm(query: string, wholeWord: boolean): string {
  if (!wholeWord) return query;
  const literal = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const separators = "\\s~!@#$%^&*()+`\\-=\\[\\]{}|\\\\;:\"',./<>?";
  return `(?<![^${separators}])${literal}(?![^${separators}])`;
}

export function createTerminalSearchController(
  addon: SearchApi,
  terminal: Pick<Terminal, "clearSelection">,
  onResult: (result: TerminalSearchResult) => void,
) {
  let intent: TerminalSearchIntent = { open: false, query: "", caseSensitive: false, wholeWord: false };
  let decorations: TerminalSearchDecorations | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let generation = 0;
  let disposed = false;
  let ready = false;
  let searching = false;
  let searchEvent: ISearchResultChangeEvent | null = null;

  const runnable = () => intent.open && intent.query.length > 0 && intent.query.length <= TERMINAL_SEARCH_QUERY_LIMIT;
  const publishEvent = (event: ISearchResultChangeEvent) => {
    if (event.resultCount >= TERMINAL_SEARCH_HIGHLIGHT_LIMIT) onResult({ kind: "limit" });
    else if (event.resultCount === 0) onResult({ kind: "no-match" });
    else onResult({ kind: "matches", index: event.resultIndex, count: event.resultCount });
  };
  const subscription = addon.onDidChangeResults((event) => {
    if (disposed || !runnable()) return;
    if (searching) searchEvent = event;
    else if (ready && timer === null) publishEvent(event);
  });
  const cancelPending = () => {
    generation += 1;
    if (timer !== null) clearTimeout(timer);
    timer = null;
  };
  const invalidate = () => {
    ready = false;
    addon.clearDecorations();
    terminal.clearSelection();
  };
  const run = (direction: "next" | "previous", incremental: boolean) => {
    if (disposed || !runnable() || !decorations) return;
    searching = true;
    searchEvent = null;
    try {
      const options: ISearchOptions = {
        caseSensitive: intent.caseSensitive,
        regex: intent.wholeWord,
        wholeWord: false,
        incremental,
        decorations,
      };
      const term = terminalSearchTerm(intent.query, intent.wholeWord);
      const found = direction === "previous" ? addon.findPrevious(term, options) : addon.findNext(term, options);
      ready = true;
      // The addon event fires synchronously inside find*. Publish atomically
      // after its return, instead of showing a transient zero-count event.
      const event = searchEvent as ISearchResultChangeEvent | null;
      if (!found) onResult({ kind: "no-match" });
      else if (event) publishEvent(event);
      else onResult({ kind: "unavailable" });
    } catch {
      invalidate();
      onResult({ kind: "unavailable" });
    } finally {
      searching = false;
      searchEvent = null;
    }
  };

  return {
    configure(next: TerminalSearchIntent, nextDecorations: TerminalSearchDecorations) {
      if (disposed) return;
      if (intent.open === next.open && intent.query === next.query && intent.caseSensitive === next.caseSensitive &&
        intent.wholeWord === next.wholeWord && JSON.stringify(decorations) === JSON.stringify(nextDecorations)) return;
      cancelPending();
      intent = { ...next };
      decorations = { ...nextDecorations };
      invalidate();
      if (!intent.open || intent.query.length === 0) { onResult({ kind: "idle" }); return; }
      if (intent.query.length > TERMINAL_SEARCH_QUERY_LIMIT) { onResult({ kind: "too-long" }); return; }
      onResult({ kind: "pending" });
      const expectedGeneration = generation;
      timer = setTimeout(() => {
        if (disposed || expectedGeneration !== generation) return;
        timer = null;
        run("next", true);
      }, TERMINAL_SEARCH_DEBOUNCE_MS);
    },
    navigate(direction: "next" | "previous") {
      if (disposed || !runnable()) return;
      cancelPending();
      run(direction, false);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      cancelPending();
      subscription.dispose();
      invalidate();
      intent = { open: false, query: "", caseSensitive: false, wholeWord: false };
      decorations = null;
    },
  };
}

export type TerminalSearchController = ReturnType<typeof createTerminalSearchController>;
