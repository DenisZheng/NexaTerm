import { useEffect, useMemo } from "react";

import type { createWorkspaceActionExecutor } from "./actionExecutor";
import { keyboardEventMatchesShortcut } from "./shortcutKeys";
import { resolveGlobalShortcutBindings } from "./shortcutRegistry";
import type { ActionFocusContext, WorkspaceActionRequest } from "./actionRegistry";

export function useWorkspaceActionShortcuts({
  bindings,
  executor,
}: {
  bindings: Readonly<Record<string, string | null | undefined>>;
  executor: ReturnType<typeof createWorkspaceActionExecutor>;
}) {
  const activeBindings = useMemo(
    () => resolveGlobalShortcutBindings(bindings),
    [bindings],
  );

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      const focus = actionFocusContextForKeyboardEvent(event);
      for (const item of activeBindings) {
        if (!item.binding || !keyboardEventMatchesShortcut(event, item.binding)) continue;
        const request: WorkspaceActionRequest = {
          actionId: item.action.id,
          source: "shortcut",
          focus,
        };
        if (!executor.resolve(request).enabled) continue;
        event.preventDefault();
        event.stopPropagation();
        void executor.run(request);
        return;
      }
    }

    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [activeBindings, executor]);
}

export function actionFocusContextForKeyboardEvent(
  event: Pick<KeyboardEvent, "target" | "isComposing">,
): ActionFocusContext {
  const target = event.target instanceof Element ? event.target : null;
  return {
    kind: focusKind(target),
    composing: event.isComposing || undefined,
  };
}

function focusKind(target: Element | null): ActionFocusContext["kind"] {
  if (target?.closest(".terminal-search-bar")) return "terminal-search";
  if (target?.closest(".xterm")) return "terminal";
  if (target?.closest('[role="menu"], [role="menubar"]')) return "menu";
  if (isEditableTarget(target)) return "editable";
  return "workspace";
}

function isEditableTarget(target: Element | null) {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  const tagName = target.tagName.toLowerCase();
  return tagName === "input" || tagName === "textarea" || tagName === "select";
}
