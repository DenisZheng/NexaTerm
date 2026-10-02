import type { ConnectionProfile } from "./connectionTypes";
import type { TerminalTab } from "../workspace/sessionTabs/types";

export function rebindTemporaryTerminalTab<TStep>(
  tab: TerminalTab<TStep>,
  profile: ConnectionProfile,
): TerminalTab<TStep> {
  return { ...tab, connectionId: profile.id, temporaryContextRef: tab.temporaryContextRef };
}

export function rebindConnectionItems<T extends { connectionId: string }>(
  items: readonly T[],
  fromConnectionId: string,
  toConnectionId: string,
): T[] {
  return items.map((item) =>
    item.connectionId === fromConnectionId ? { ...item, connectionId: toConnectionId } : item,
  );
}

export function finalTemporaryContextRefs<TStep>(
  closingTabs: readonly TerminalTab<TStep>[],
  remainingTabs: readonly TerminalTab<TStep>[],
) {
  return new Set(
    closingTabs
      .map((tab) => tab.temporaryContextRef)
      .filter((value): value is string => Boolean(value))
      .filter((value) => !remainingTabs.some((tab) => tab.temporaryContextRef === value)),
  );
}
