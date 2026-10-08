import type { MobaXtermImportItem } from "./mobaxtermImportTypes";

/** A missing username can be filled in-place; Jump/Proxy and invalid records stay blocked. */
export function isMobaXtermRowEditable(item: MobaXtermImportItem): boolean {
  return (
    item.kind === "ssh" &&
    item.status !== "invalid" &&
    item.status !== "unsupported" &&
    !item.missing_fields.includes("network_settings_review")
  );
}

/** Source duplicates can only be imported under a new name; existing names are never overwritten. */
export function canSelectMobaXtermRow(
  item: MobaXtermImportItem,
  name: string,
  username: string,
): boolean {
  if (!isMobaXtermRowEditable(item) || !name.trim() || !username.trim()) {
    return false;
  }
  if (
    (item.conflict === "exact_duplicate" || item.conflict === "name_conflict") &&
    name.trim() === item.name
  ) {
    return false;
  }
  return true;
}
