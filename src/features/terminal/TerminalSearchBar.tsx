import { CaseSensitive, ChevronDown, ChevronUp, Search, WholeWord, X } from "lucide-react";
import { useEffect, useRef } from "react";
import { useI18n } from "../../shared/i18n";
import { Tooltip } from "../../shared/ui/Tooltip";
import { TERMINAL_SEARCH_HIGHLIGHT_LIMIT, TERMINAL_SEARCH_QUERY_LIMIT, type TerminalSearchResult } from "./terminalSearchController";

interface Props {
  query: string;
  caseSensitive: boolean;
  wholeWord: boolean;
  result: TerminalSearchResult;
  onQueryChange: (query: string) => void;
  onCaseToggle: () => void;
  onWholeWordToggle: () => void;
  onNavigate: (direction: "next" | "previous") => void;
  onClose: () => void;
}

export function TerminalSearchBar({ query, caseSensitive, wholeWord, result, onQueryChange, onCaseToggle, onWholeWordToggle, onNavigate, onClose }: Props) {
  const { t } = useI18n();
  const inputRef = useRef<HTMLInputElement | null>(null);
  useEffect(() => {
    const frame = window.requestAnimationFrame(() => { inputRef.current?.focus(); inputRef.current?.select(); });
    return () => window.cancelAnimationFrame(frame);
  }, []);
  const canNavigate = query.length > 0 && query.length <= TERMINAL_SEARCH_QUERY_LIMIT;
  let label = "";
  switch (result.kind) {
    case "pending": label = t("terminal.search.pending"); break;
    case "no-match": label = t("terminal.search.noMatch"); break;
    case "limit": label = t("terminal.search.limit", { count: TERMINAL_SEARCH_HIGHLIGHT_LIMIT }); break;
    case "too-long": label = t("terminal.search.tooLong", { limit: TERMINAL_SEARCH_QUERY_LIMIT }); break;
    case "unavailable": label = t("terminal.search.unavailable"); break;
    case "matches": label = result.index >= 0 ? `${result.index + 1} / ${result.count}` : t("terminal.search.count", { count: result.count }); break;
  }
  return (
    <div className="terminal-search-bar" role="search" aria-label={t("terminal.search.aria")}
      onKeyDown={(event) => {
        if (event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229) return;
        if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); onClose(); }
      }}>
      <label className="terminal-search-input-wrap">
        <Search className="ui-icon" aria-hidden="true" />
        <input ref={inputRef} aria-label={t("terminal.search.aria")} value={query}
          placeholder={t("terminal.search.placeholder")} spellCheck={false}
          onChange={(event) => onQueryChange(event.currentTarget.value)}
          onKeyDown={(event) => {
            if (event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229) return;
            if (event.key === "Enter") {
              event.preventDefault(); event.stopPropagation();
              if (canNavigate) onNavigate(event.shiftKey ? "previous" : "next");
            }
          }} />
      </label>
      <span className="terminal-search-result" role="status" aria-live="polite" aria-atomic="true" title={label}>{label}</span>
      <div className="terminal-search-actions">
        <Tooltip label={caseSensitive ? t("terminal.search.caseSensitive") : t("terminal.search.caseInsensitive")}>
          <button className={caseSensitive ? "active" : ""} type="button" aria-label={t("terminal.search.toggleCase")}
            aria-pressed={caseSensitive} onClick={onCaseToggle}><CaseSensitive className="ui-icon" aria-hidden="true" /></button>
        </Tooltip>
        <Tooltip label={t("terminal.search.wholeWord")}>
          <button className={wholeWord ? "active" : ""} type="button" aria-label={t("terminal.search.toggleWholeWord")}
            aria-pressed={wholeWord} onClick={onWholeWordToggle}><WholeWord className="ui-icon" aria-hidden="true" /></button>
        </Tooltip>
        <Tooltip label={t("terminal.search.previous")}>
          <button type="button" aria-label={t("terminal.search.previousAria")} disabled={!canNavigate}
            onClick={() => onNavigate("previous")}><ChevronUp className="ui-icon" aria-hidden="true" /></button>
        </Tooltip>
        <Tooltip label={t("terminal.search.next")}>
          <button type="button" aria-label={t("terminal.search.nextAria")} disabled={!canNavigate}
            onClick={() => onNavigate("next")}><ChevronDown className="ui-icon" aria-hidden="true" /></button>
        </Tooltip>
        <Tooltip label={t("terminal.search.close")}>
          <button type="button" aria-label={t("terminal.search.closeAria")} onClick={onClose}><X className="ui-icon" aria-hidden="true" /></button>
        </Tooltip>
      </div>
    </div>
  );
}
