import { useMemo, useState, type KeyboardEvent } from "react";
import { Keyboard, Pencil, RotateCcw, Search, X } from "lucide-react";

import { useI18n, type Translate } from "../../shared/i18n";
import { Keybinding } from "../../shared/ui/Keybinding";
import {
  defaultShortcutBindings,
  resolveShortcutBinding,
  shortcutActions,
  shortcutCategories,
} from "../shortcuts/shortcutRegistry";
import {
  normalizeShortcutBinding,
  shortcutBindingFromKeyboardEvent,
} from "../shortcuts/shortcutKeys";
import {
  findShortcutConflicts,
  validateShortcutBinding,
} from "../shortcuts/shortcutValidation";
import type { ShortcutAction } from "../shortcuts/shortcutTypes";
import type { ShortcutSettings } from "./settingsTypes";

interface ShortcutSettingsSectionProps {
  settings: ShortcutSettings;
  onUpdate: (update: Partial<ShortcutSettings>) => void;
}

export function ShortcutSettingsSection({
  settings,
  onUpdate,
}: ShortcutSettingsSectionProps) {
  const [query, setQuery] = useState("");
  const [editingActionId, setEditingActionId] = useState<string | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const normalizedQuery = query.trim().toLowerCase();
  const currentBindings = settings.bindings;
  const filteredActions = useMemo(
    () =>
      shortcutActions.filter((action) => {
        if (!normalizedQuery) {
          return true;
        }
        const binding = resolveShortcutBinding(currentBindings, action);
        const category = shortcutCategories.find((item) => item.id === action.category);
        const actionCopy = shortcutActionCopy(action.id, t);
        const categoryLabel = shortcutCategoryLabel(action.category, t);
        return [actionCopy.label, actionCopy.description, binding || "", categoryLabel]
          .join(" ")
          .toLowerCase()
          .includes(normalizedQuery);
      }),
    [currentBindings, normalizedQuery],
  );

  function updateBinding(action: ShortcutAction, binding: string | null) {
    onUpdate({
      bindings: {
        ...currentBindings,
        [action.id]: binding,
      },
    });
  }

  function resetAll() {
    setEditingActionId(null);
    setLocalError(null);
    onUpdate({ bindings: { ...defaultShortcutBindings } });
  }

  function clearBinding(action: ShortcutAction) {
    setEditingActionId(null);
    setLocalError(null);
    updateBinding(action, null);
  }

  function commitBinding(action: ShortcutAction, rawBinding: string) {
    const normalized = normalizeShortcutBinding(rawBinding);
    const validation = validateShortcutBinding(normalized);
    if (!validation.valid) {
      setLocalError(shortcutValidationMessage(validation.code, t));
      return;
    }

    const nextBindings = {
      ...currentBindings,
      [action.id]: normalized,
    };
    const conflict = findShortcutConflicts(nextBindings).find((item) =>
      item.actionIds.includes(action.id),
    );
    if (conflict) {
      const conflictAction = shortcutActions.find(
        (item) => item.id !== action.id && conflict.actionIds.includes(item.id),
      );
      setLocalError(
        conflictAction
          ? t("settings.shortcuts.conflictWith", { name: shortcutActionCopy(conflictAction.id, t).label })
          : t("settings.shortcuts.conflictOther"),
      );
      return;
    }

    setLocalError(null);
    setEditingActionId(null);
    onUpdate({ bindings: nextBindings });
  }

  function handleCaptureKeyDown(action: ShortcutAction, event: KeyboardEvent<HTMLButtonElement>) {
    event.preventDefault();
    event.stopPropagation();

    if (event.key === "Escape") {
      setEditingActionId(null);
      setLocalError(null);
      return;
    }

    if (event.key === "Backspace" || event.key === "Delete") {
      clearBinding(action);
      return;
    }

    const binding = shortcutBindingFromKeyboardEvent(event.nativeEvent);
    if (!binding) {
      return;
    }
    commitBinding(action, binding);
  }

  return (
    <section className="settings-page-section">
      <header className="settings-section-head settings-section-head-row">
        <div>
          <h1>{t("settings.shortcuts.title")}</h1>
          <p>{t("settings.shortcuts.description")}</p>
        </div>
        <button className="settings-action-button" type="button" onClick={resetAll}>
          <RotateCcw className="ui-icon" aria-hidden="true" />
          <span>{t("settings.shortcuts.reset")}</span>
        </button>
      </header>

      <div className="shortcut-toolbar">
        <label className="shortcut-search" aria-label={t("settings.shortcuts.searchAria")}>
          <Search className="ui-icon" aria-hidden="true" />
          <input
            value={query}
            placeholder={t("settings.shortcuts.searchPlaceholder")}
            onChange={(event) => setQuery(event.currentTarget.value)}
          />
        </label>
      </div>

      {shortcutCategories.map((category) => {
        const actions = filteredActions.filter((action) => action.category === category.id);
        if (actions.length === 0) {
          return null;
        }

        return (
          <section className="settings-panel shortcut-group" key={category.id}>
            <div className="shortcut-group-title">
              <Keyboard className="ui-icon" aria-hidden="true" />
              <span>{shortcutCategoryLabel(category.id, t)}</span>
            </div>
            <div className="shortcut-list">
              {actions.map((action) => {
                const binding = resolveShortcutBinding(currentBindings, action);
                const editing = editingActionId === action.id;
                return (
                  <div className="shortcut-row" key={action.id}>
                    <div className="shortcut-row-copy">
                      <strong>{shortcutActionCopy(action.id, t).label}</strong>
                      <small>{shortcutActionCopy(action.id, t).description}</small>
                    </div>
                    <div className="shortcut-row-control">
                      {editing ? (
                        <button
                          autoFocus
                          className="shortcut-capture-button"
                          type="button"
                          onBlur={() => {
                            setEditingActionId(null);
                            setLocalError(null);
                          }}
                          onKeyDown={(event) => handleCaptureKeyDown(action, event)}
                        >
                          {t("settings.shortcuts.capture")}
                        </button>
                      ) : (
                        <Keybinding value={binding} />
                      )}
                      <button
                        className="settings-action-button shortcut-icon-action"
                        type="button"
                        aria-label={t("settings.shortcuts.editAria", { name: shortcutActionCopy(action.id, t).label })}
                        onClick={() => {
                          setEditingActionId(action.id);
                          setLocalError(null);
                        }}
                      >
                        <Pencil className="ui-icon" aria-hidden="true" />
                      </button>
                      <button
                        className="settings-action-button shortcut-icon-action"
                        type="button"
                        aria-label={t("settings.shortcuts.clearAria", { name: shortcutActionCopy(action.id, t).label })}
                        disabled={!binding}
                        onClick={() => clearBinding(action)}
                      >
                        <X className="ui-icon" aria-hidden="true" />
                      </button>
                    </div>
                    {editing && localError ? (
                      <small className="shortcut-row-error">{localError}</small>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </section>
        );
      })}

      {filteredActions.length === 0 ? (
        <div className="settings-panel shortcut-empty">
          {t("settings.shortcuts.empty")}
        </div>
      ) : null}

      <p className="settings-note">
        {t("settings.shortcuts.note")}
      </p>
    </section>
  );
}

function shortcutCategoryLabel(categoryId: string, t: Translate) {
  if (categoryId === "general") return t("settings.shortcuts.category.general");
  if (categoryId === "terminal") return t("settings.shortcuts.category.terminal");
  if (categoryId === "search") return t("settings.shortcuts.category.search");
  return t("settings.shortcuts.category.tools");
}

function shortcutActionCopy(actionId: string, t: Translate) {
  const keyByAction: Record<string, [Parameters<Translate>[0], Parameters<Translate>[0]]> = {
    "connection.quickOpen": ["settings.shortcuts.action.connection.quickOpen.label", "settings.shortcuts.action.connection.quickOpen.description"],
    "settings.open": ["settings.shortcuts.action.settings.open.label", "settings.shortcuts.action.settings.open.description"],
    "terminal.newTab": ["settings.shortcuts.action.terminal.newTab.label", "settings.shortcuts.action.terminal.newTab.description"],
    "terminal.closeTab": ["settings.shortcuts.action.terminal.closeTab.label", "settings.shortcuts.action.terminal.closeTab.description"],
    "terminal.search.toggle": ["settings.shortcuts.action.terminal.search.toggle.label", "settings.shortcuts.action.terminal.search.toggle.description"],
    "terminal.search.next": ["settings.shortcuts.action.terminal.search.next.label", "settings.shortcuts.action.terminal.search.next.description"],
    "terminal.search.previous": ["settings.shortcuts.action.terminal.search.previous.label", "settings.shortcuts.action.terminal.search.previous.description"],
    "ai.sendMessage": ["settings.shortcuts.action.ai.sendMessage.label", "settings.shortcuts.action.ai.sendMessage.description"],
    "commandSender.toggle": ["settings.shortcuts.action.commandSender.toggle.label", "settings.shortcuts.action.commandSender.toggle.description"],
  };
  const keys = keyByAction[actionId];
  if (!keys) return { label: actionId, description: "" };
  return { label: t(keys[0]), description: t(keys[1]) };
}

function shortcutValidationMessage(code: string | undefined, t: Translate) {
  if (code === "invalid") return t("settings.shortcuts.validation.invalid");
  if (code === "plain-printable") return t("settings.shortcuts.validation.plainPrintable");
  if (code === "reserved") return t("settings.shortcuts.validation.reserved");
  return t("settings.shortcuts.validation.unavailable");
}
