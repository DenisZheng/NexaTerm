import * as ContextMenu from "@radix-ui/react-context-menu";
import { useMemo, useState } from "react";
import {
  ChevronRight,
  Clock3,
  Copy,
  CornerDownLeft,
  Folder,
  FolderPlus,
  FolderOpen,
  Pencil,
  Play,
  Plus,
  Search,
  Star,
  Trash2,
} from "lucide-react";

import { useI18n, type Translate } from "../../shared/i18n";
import { AppSelect } from "../../shared/ui/AppSelect";
import { Tooltip } from "../../shared/ui/Tooltip";
import type { CommandHistoryEntry, CommandSnippet } from "./commandLibraryTypes";
import { formatCommandLibraryTime } from "./commandLibraryTime";

type CommandLibraryMode = "snippets" | "history";

export interface CommandHistoryScopeOption {
  badge?: string;
  label: string;
  value: string;
}

interface CommandLibraryPanelProps {
  activeHistoryId: string | null;
  activeSnippetId: string | null;
  error?: string | null;
  historyEntries: CommandHistoryEntry[];
  historyScopeOptions: CommandHistoryScopeOption[];
  historyScopeValue: string;
  loading?: boolean;
  groups?: string[];
  snippets: CommandSnippet[];
  unavailableReason?: string | null;
  onClearHistory: () => void;
  onCopyHistory: (entry: CommandHistoryEntry) => void;
  onCopySnippet: (snippet: CommandSnippet) => void;
  onCreateGroup: () => void;
  onCreateSnippet: (group?: string) => void;
  onDeleteGroup: (groupName: string) => void;
  onDeleteHistory: (entry: CommandHistoryEntry) => void;
  onDeleteSnippet: (snippet: CommandSnippet) => void;
  onEditSnippet: (snippet: CommandSnippet) => void;
  onHistoryToSnippet: (entry: CommandHistoryEntry) => void;
  onHistoryScopeChange: (value: string) => void;
  onInsertHistory: (entry: CommandHistoryEntry) => void;
  onInsertSnippet: (snippet: CommandSnippet) => void;
  onRenameGroup: (groupName: string) => void;
  onRunHistory: (entry: CommandHistoryEntry) => void;
  onRunSnippet: (snippet: CommandSnippet) => void;
}

interface SnippetGroupNode {
  name: string;
  snippets: CommandSnippet[];
}

interface SnippetTree {
  groups: SnippetGroupNode[];
  rootSnippets: CommandSnippet[];
}

const legacyUngroupedSnippetGroup = "未分组";

export function CommandLibraryPanel({
  activeHistoryId,
  activeSnippetId,
  error,
  groups = [],
  historyEntries,
  historyScopeOptions,
  historyScopeValue,
  loading = false,
  snippets,
  unavailableReason,
  onClearHistory,
  onCopyHistory,
  onCopySnippet,
  onCreateGroup,
  onCreateSnippet,
  onDeleteGroup,
  onDeleteHistory,
  onDeleteSnippet,
  onEditSnippet,
  onHistoryToSnippet,
  onHistoryScopeChange,
  onInsertHistory,
  onInsertSnippet,
  onRenameGroup,
  onRunHistory,
  onRunSnippet,
}: CommandLibraryPanelProps) {
  const { t, locale } = useI18n();
  const [mode, setMode] = useState<CommandLibraryMode>("snippets");
  const [query, setQuery] = useState("");
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(() => new Set());
  const normalizedQuery = query.trim().toLowerCase();
  const disabled = Boolean(unavailableReason);

  const snippetTree = useMemo(
    () => buildSnippetTree(snippets, groups, normalizedQuery, locale),
    [groups, locale, normalizedQuery, snippets],
  );
  const filteredHistoryEntries = useMemo(
    () => historyEntries.filter((entry) => historyMatchesQuery(entry, normalizedQuery)),
    [historyEntries, normalizedQuery],
  );

  const toggleSnippetGroup = (groupName: string) => {
    setCollapsedGroups((current) => {
      const next = new Set(current);
      if (next.has(groupName)) {
        next.delete(groupName);
      } else {
        next.add(groupName);
      }
      return next;
    });
  };

  const renderSnippetRow = (snippet: CommandSnippet, nested = false) => (
    <ContextMenu.Root key={snippet.id}>
      <ContextMenu.Trigger asChild>
        <article
          className={`command-library-snippet-row ${nested ? "nested" : "root"} ${
            activeSnippetId === snippet.id ? "active" : ""
          }`}
        >
          <div className="command-library-snippet-main">
            <span className="command-library-snippet-title">
              {snippet.favorite ? (
                <Star className="ui-icon filled" aria-hidden="true" />
              ) : null}
              <strong title={snippet.title}>{snippet.title}</strong>
            </span>
            <code title={snippet.command}>{firstCommandLine(snippet.command)}</code>
            <small>
              {t("commands.used", { count: snippet.use_count })} ·{" "}
              {formatCommandLibraryTime(snippet.last_used_at || snippet.updated_at)}
              {snippet.description ? ` · ${snippet.description}` : ""}
            </small>
          </div>
          <div className="command-library-row-actions">
            <Tooltip label={t("commands.copy")}>
              <button
                className="command-library-icon-button"
                type="button"
                aria-label={t("commands.copySnippetAria", { name: snippet.title })}
                onClick={() => onCopySnippet(snippet)}
              >
                <Copy className="ui-icon" aria-hidden="true" />
              </button>
            </Tooltip>
            <Tooltip label={t("commands.insert")}>
              <button
                className="command-library-icon-button"
                type="button"
                aria-label={t("commands.insertSnippetAria", { name: snippet.title })}
                onClick={() => onInsertSnippet(snippet)}
              >
                <CornerDownLeft className="ui-icon" aria-hidden="true" />
              </button>
            </Tooltip>
            <Tooltip label={t("commands.run")}>
              <button
                className="command-library-icon-button primary"
                type="button"
                aria-label={t("commands.runSnippetAria", { name: snippet.title })}
                disabled={disabled}
                onClick={() => onRunSnippet(snippet)}
              >
                <Play className="ui-icon" aria-hidden="true" />
              </button>
            </Tooltip>
          </div>
        </article>
      </ContextMenu.Trigger>
      <ContextMenu.Portal>
        <ContextMenu.Content className="context-menu-content">
          <ContextMenu.Item className="context-menu-item" onSelect={() => onCopySnippet(snippet)}>
            <Copy className="ui-icon" aria-hidden="true" />
            <span>{t("commands.copy")}</span>
          </ContextMenu.Item>
          <ContextMenu.Item className="context-menu-item" onSelect={() => onInsertSnippet(snippet)}>
            <CornerDownLeft className="ui-icon" aria-hidden="true" />
            <span>{t("commands.insert")}</span>
          </ContextMenu.Item>
          <ContextMenu.Item
            className="context-menu-item"
            disabled={disabled}
            onSelect={() => onRunSnippet(snippet)}
          >
            <Play className="ui-icon" aria-hidden="true" />
            <span>{t("commands.run")}</span>
          </ContextMenu.Item>
          <ContextMenu.Separator className="context-menu-separator" />
          <ContextMenu.Item
            className="context-menu-item"
            disabled={disabled}
            onSelect={() => onEditSnippet(snippet)}
          >
            <Pencil className="ui-icon" aria-hidden="true" />
            <span>{t("commands.editSnippet")}</span>
          </ContextMenu.Item>
          <ContextMenu.Item
            className="context-menu-item danger"
            disabled={disabled}
            onSelect={() => onDeleteSnippet(snippet)}
          >
            <Trash2 className="ui-icon" aria-hidden="true" />
            <span>{t("commands.deleteSnippet")}</span>
          </ContextMenu.Item>
        </ContextMenu.Content>
      </ContextMenu.Portal>
    </ContextMenu.Root>
  );

  const snippetVisibleCount =
    snippetTree.rootSnippets.length +
    snippetTree.groups.reduce((count, group) => count + group.snippets.length, 0);
  const hasSnippetTreeRows = snippetVisibleCount > 0 || snippetTree.groups.length > 0;
  const visibleCount = mode === "snippets" ? snippetVisibleCount : filteredHistoryEntries.length;
  const scopeSelectOptions = historyScopeOptions.map((option) => ({
    value: option.value,
    label: (
      <span className="command-library-scope-option">
        {option.badge ? <em>{option.badge}</em> : null}
        <span>{option.label}</span>
      </span>
    ),
  }));

  return (
    <section className="command-library-tool" aria-label={t("commands.aria")}>
      <header className="command-library-tool-head">
        <div className="command-library-tool-title">
          <strong>{t("commands.title")}</strong>
          <span>{mode === "snippets" ? t("commands.subtitle.snippets") : t("commands.subtitle.history")}</span>
        </div>
        <div className="command-library-mode-tabs" aria-label={t("commands.viewAria")}>
          <button
            className={mode === "snippets" ? "active" : ""}
            type="button"
            onClick={() => setMode("snippets")}
          >
            {t("commands.snippets")}
          </button>
          <button
            className={mode === "history" ? "active" : ""}
            type="button"
            onClick={() => setMode("history")}
          >
            {t("commands.history")}
          </button>
        </div>
      </header>

      <div className="command-library-search-row">
        <label className="command-library-search">
          <Search className="ui-icon" aria-hidden="true" />
          <input
            aria-label={t("commands.searchAria")}
            placeholder={mode === "snippets" ? t("commands.searchSnippets") : t("commands.searchHistory")}
            spellCheck={false}
            value={query}
            onChange={(event) => setQuery(event.currentTarget.value)}
          />
        </label>
        <span className="command-library-count">
          {loading ? t("commands.loading") : t("commands.count", { count: visibleCount })}
        </span>
      </div>

      {error || unavailableReason ? (
        <div className="command-library-inline-error" role="status">
          {unavailableReason || error}
        </div>
      ) : null}

      {mode === "snippets" ? (
        <div className="command-library-snippet-workbench">
          <div className="command-library-snippet-list" aria-label={t("commands.snippetListAria")}>
            <div className="command-library-list-head">
              <span>{t("commands.library")}</span>
              <div className="command-library-list-actions">
                <button
                  className="command-library-mini-button primary"
                  type="button"
                  disabled={disabled}
                  onClick={() => onCreateSnippet()}
                >
                  <Plus className="ui-icon" aria-hidden="true" />
                  <span>{t("commands.newCommand")}</span>
                </button>
                <button
                  className="command-library-mini-button"
                  type="button"
                  disabled={disabled}
                  onClick={onCreateGroup}
                >
                  <FolderPlus className="ui-icon" aria-hidden="true" />
                  <span>{t("commands.newGroup")}</span>
                </button>
              </div>
            </div>
            {!hasSnippetTreeRows ? (
              <p className="command-library-empty">
                {loading ? t("commands.loadingSnippets") : t("commands.noSnippets")}
              </p>
            ) : (
              <div className="command-library-snippet-tree">
                {snippetTree.rootSnippets.length > 0 ? (
                  <div className="command-library-snippet-root" aria-label={t("commands.root")}>
                    {snippetTree.rootSnippets.map((snippet) => renderSnippetRow(snippet))}
                  </div>
                ) : null}
                {snippetTree.groups.map((group) => (
                  <section
                    className={`command-library-snippet-group ${
                      collapsedGroups.has(group.name) ? "collapsed" : ""
                    }`}
                    key={group.name}
                  >
                    <ContextMenu.Root>
                      <ContextMenu.Trigger asChild>
                        <button
                          className="command-library-snippet-group-head"
                          type="button"
                          aria-expanded={!collapsedGroups.has(group.name)}
                          onClick={() => toggleSnippetGroup(group.name)}
                        >
                          <span className="command-library-snippet-group-title">
                            <ChevronRight className="ui-icon command-library-chevron" aria-hidden="true" />
                            {collapsedGroups.has(group.name) ? (
                              <Folder className="ui-icon command-library-folder-icon" aria-hidden="true" />
                            ) : (
                              <FolderOpen className="ui-icon command-library-folder-icon" aria-hidden="true" />
                            )}
                            <strong title={group.name}>{group.name}</strong>
                          </span>
                          <span className="command-library-snippet-group-count">
                            {group.snippets.length.toString()}
                          </span>
                        </button>
                      </ContextMenu.Trigger>
                      <ContextMenu.Portal>
                        <ContextMenu.Content className="context-menu-content">
                          <ContextMenu.Item
                            className="context-menu-item"
                            disabled={disabled}
                            onSelect={() => onCreateSnippet(group.name)}
                          >
                            <Plus className="ui-icon" aria-hidden="true" />
                            <span>{t("commands.newInGroup")}</span>
                          </ContextMenu.Item>
                          <ContextMenu.Item
                            className="context-menu-item"
                            disabled={disabled}
                            onSelect={() => onRenameGroup(group.name)}
                          >
                            <Pencil className="ui-icon" aria-hidden="true" />
                            <span>{t("commands.renameGroup")}</span>
                          </ContextMenu.Item>
                          <ContextMenu.Separator className="context-menu-separator" />
                          <ContextMenu.Item
                            className="context-menu-item danger"
                            disabled={disabled}
                            onSelect={() => onDeleteGroup(group.name)}
                          >
                            <Trash2 className="ui-icon" aria-hidden="true" />
                            <span>{t("commands.deleteGroup")}</span>
                          </ContextMenu.Item>
                        </ContextMenu.Content>
                      </ContextMenu.Portal>
                    </ContextMenu.Root>
                    {collapsedGroups.has(group.name) ? null : (
                      <div className="command-library-snippet-children">
                        {group.snippets.length === 0 ? (
                          <p className="command-library-group-empty">{t("commands.emptyGroup")}</p>
                        ) : (
                          group.snippets.map((snippet) => renderSnippetRow(snippet, true))
                        )}
                      </div>
                    )}
                  </section>
                ))}
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="command-library-history-view">
          <div className="command-library-list-head">
            <div className="command-library-list-actions">
              <AppSelect
                ariaLabel={t("commands.historyScope")}
                className="command-library-scope-select"
                menuMinWidth={190}
                options={scopeSelectOptions}
                value={historyScopeValue}
                onChange={onHistoryScopeChange}
              />
              <button
                className="command-library-mini-button"
                type="button"
                disabled={disabled || historyEntries.length === 0}
                onClick={onClearHistory}
              >
                <Trash2 className="ui-icon" aria-hidden="true" />
                <span>{t("commands.clearAll")}</span>
              </button>
            </div>
          </div>
          {filteredHistoryEntries.length === 0 ? (
            <p className="command-library-empty">
              {loading ? t("commands.loadingHistory") : t("commands.noHistory")}
            </p>
          ) : (
            <div className="command-library-history-list">
              {filteredHistoryEntries.map((entry) => (
                <ContextMenu.Root key={entry.id}>
                  <ContextMenu.Trigger asChild>
                    <article
                      className={`command-library-history-row ${
                        activeHistoryId === entry.id ? "active" : ""
                      }`}
                    >
                      <div className="command-library-history-main">
                        <code title={entry.command}>{entry.command}</code>
                        <span>
                          <em className="command-library-source-badge">
                            {historySourceLabel(entry.source, t)}
                          </em>
                          <Clock3 className="ui-icon" aria-hidden="true" />
                          {t("commands.used", { count: entry.use_count })} · {formatCommandLibraryTime(entry.last_used_at)}
                        </span>
                      </div>
                      <div className="command-library-history-actions">
                        <Tooltip label={t("commands.copy")}>
                          <button
                            className="command-library-icon-button"
                            type="button"
                            aria-label={t("commands.copyHistoryAria")}
                            onClick={() => onCopyHistory(entry)}
                          >
                            <Copy className="ui-icon" aria-hidden="true" />
                          </button>
                        </Tooltip>
                        <Tooltip label={t("commands.insert")}>
                          <button
                            className="command-library-icon-button"
                            type="button"
                            aria-label={t("commands.insertHistoryAria")}
                            onClick={() => onInsertHistory(entry)}
                          >
                            <CornerDownLeft className="ui-icon" aria-hidden="true" />
                          </button>
                        </Tooltip>
                        <Tooltip label={t("commands.run")}>
                          <button
                            className="command-library-icon-button primary"
                            type="button"
                            aria-label={t("commands.runHistoryAria")}
                            disabled={disabled}
                            onClick={() => onRunHistory(entry)}
                          >
                            <Play className="ui-icon" aria-hidden="true" />
                          </button>
                        </Tooltip>
                      </div>
                    </article>
                  </ContextMenu.Trigger>
                  <ContextMenu.Portal>
                    <ContextMenu.Content className="context-menu-content">
                      <ContextMenu.Item className="context-menu-item" onSelect={() => onCopyHistory(entry)}>
                        <Copy className="ui-icon" aria-hidden="true" />
                        <span>{t("commands.copy")}</span>
                      </ContextMenu.Item>
                      <ContextMenu.Item className="context-menu-item" onSelect={() => onInsertHistory(entry)}>
                        <CornerDownLeft className="ui-icon" aria-hidden="true" />
                        <span>{t("commands.insert")}</span>
                      </ContextMenu.Item>
                      <ContextMenu.Item
                        className="context-menu-item"
                        disabled={disabled}
                        onSelect={() => onRunHistory(entry)}
                      >
                        <Play className="ui-icon" aria-hidden="true" />
                        <span>{t("commands.run")}</span>
                      </ContextMenu.Item>
                      <ContextMenu.Separator className="context-menu-separator" />
                      <ContextMenu.Item
                        className="context-menu-item"
                        disabled={disabled}
                        onSelect={() => onHistoryToSnippet(entry)}
                      >
                        <Plus className="ui-icon" aria-hidden="true" />
                        <span>{t("commands.saveSnippet")}</span>
                      </ContextMenu.Item>
                      <ContextMenu.Item
                        className="context-menu-item danger"
                        disabled={disabled}
                        onSelect={() => onDeleteHistory(entry)}
                      >
                        <Trash2 className="ui-icon" aria-hidden="true" />
                        <span>{t("commands.deleteHistory")}</span>
                      </ContextMenu.Item>
                    </ContextMenu.Content>
                  </ContextMenu.Portal>
                </ContextMenu.Root>
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function buildSnippetTree(
  snippets: CommandSnippet[],
  explicitGroups: string[],
  normalizedQuery: string,
  locale: "en" | "zh-CN",
): SnippetTree {
  const rootSnippets: CommandSnippet[] = [];
  const groups = new Map<string, CommandSnippet[]>();
  explicitGroups.forEach((groupName) => {
    const normalizedGroup = normalizeSnippetGroupName(groupName);
    if (normalizedGroup) {
      groups.set(normalizedGroup, []);
    }
  });

  snippets.forEach((snippet) => {
    if (!snippetMatchesQuery(snippet, normalizedQuery)) {
      return;
    }
    const group = normalizeSnippetGroupName(snippet.group);
    if (!group) {
      rootSnippets.push(snippet);
      return;
    }
    const groupSnippets = groups.get(group) || [];
    groupSnippets.push(snippet);
    groups.set(group, groupSnippets);
  });

  const visibleGroups = Array.from(groups.entries())
    .filter(([, groupSnippets]) => groupSnippets.length > 0 || !normalizedQuery)
    .map(([name, groupSnippets]) => ({ name, snippets: groupSnippets }))
    .sort((left, right) => left.name.localeCompare(right.name, locale === "zh-CN" ? "zh-Hans" : "en"));

  return { groups: visibleGroups, rootSnippets };
}

function normalizeSnippetGroupName(group?: string | null) {
  const normalizedGroup = group?.trim() || "";
  return normalizedGroup === legacyUngroupedSnippetGroup ? "" : normalizedGroup;
}

function snippetMatchesQuery(snippet: CommandSnippet, normalizedQuery: string) {
  if (!normalizedQuery) {
    return true;
  }
  return [
    snippet.title,
    snippet.command,
    snippet.description || "",
    normalizeSnippetGroupName(snippet.group),
    ...snippet.tags,
  ].some((value) => value.toLowerCase().includes(normalizedQuery));
}

function historyMatchesQuery(entry: CommandHistoryEntry, normalizedQuery: string) {
  if (!normalizedQuery) {
    return true;
  }
  return entry.command.toLowerCase().includes(normalizedQuery);
}

function historySourceLabel(source: CommandHistoryEntry["source"], t: Translate) {
  return source === "terminal_input" ? t("commands.source.terminal") : t("commands.source.send");
}

function firstCommandLine(command: string) {
  return command.split(/\r?\n/u)[0] || command;
}
