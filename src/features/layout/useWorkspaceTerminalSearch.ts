import { useEffect, useMemo, useRef, useState } from "react";
import type { TerminalSearchIntent, TerminalSearchNavigationRequest } from "../terminal/terminalSearchController";

type SearchStates = Record<string, TerminalSearchIntent>;
const initialState = (): TerminalSearchIntent => ({ open: false, query: "", caseSensitive: false, wholeWord: false });

// The workspace owns transient intent; the lazy TerminalPanel owns the addon.
export function useWorkspaceTerminalSearch(
  terminalTabs: readonly { id: string }[],
  localTerminalTabs: readonly { id: string }[],
) {
  const available = useMemo(() => new Set([...terminalTabs, ...localTerminalTabs].map((tab) => tab.id)), [terminalTabs, localTerminalTabs]);
  const availableRef = useRef(available);
  availableRef.current = available;
  const sequenceRef = useRef(0);
  const [terminalSearchByTabId, setStates] = useState<SearchStates>({});
  const [terminalSearchNavigationRequest, setNavigation] = useState<TerminalSearchNavigationRequest | null>(null);

  useEffect(() => {
    setStates((states) => {
      const entries = Object.entries(states).filter(([id]) => available.has(id));
      return entries.length === Object.keys(states).length ? states : Object.fromEntries(entries);
    });
    setNavigation((request) => request && !available.has(request.tabId) ? null : request);
  }, [available]);

  const update = (tabId: string | null | undefined, change: (current: TerminalSearchIntent) => TerminalSearchIntent) => {
    if (!tabId || !availableRef.current.has(tabId)) return;
    setStates((states) => !availableRef.current.has(tabId) ? states : { ...states, [tabId]: change(states[tabId] || initialState()) });
  };
  function toggleTerminalSearch(tabId: string | null | undefined) {
    update(tabId, (current) => ({ ...current, open: !current.open }));
  }
  function closeTerminalSearch(tabId: string) {
    update(tabId, (current) => ({ ...current, open: false }));
  }
  function updateTerminalSearchQuery(tabId: string, query: string) {
    update(tabId, (current) => ({ ...current, open: true, query }));
  }
  function toggleTerminalSearchCaseSensitive(tabId: string) {
    update(tabId, (current) => ({ ...current, open: true, caseSensitive: !current.caseSensitive }));
  }
  function toggleTerminalSearchWholeWord(tabId: string) {
    update(tabId, (current) => ({ ...current, open: true, wholeWord: !current.wholeWord }));
  }
  function requestTerminalSearchNavigation(direction: TerminalSearchNavigationRequest["direction"], tabId: string) {
    if (!availableRef.current.has(tabId)) return;
    update(tabId, (current) => ({ ...current, open: true }));
    setNavigation({ direction, id: ++sequenceRef.current, tabId });
  }
  function acknowledgeTerminalSearchNavigation(request: TerminalSearchNavigationRequest) {
    setNavigation((current) => current?.id === request.id && current.tabId === request.tabId ? null : current);
  }
  return { terminalSearchByTabId, terminalSearchNavigationRequest, toggleTerminalSearch, closeTerminalSearch,
    updateTerminalSearchQuery, toggleTerminalSearchCaseSensitive, toggleTerminalSearchWholeWord,
    requestTerminalSearchNavigation, acknowledgeTerminalSearchNavigation };
}
