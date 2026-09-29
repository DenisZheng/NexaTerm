export type MobaXtermSessionKind =
  | "ssh"
  | "wsl"
  | "telnet"
  | "rdp"
  | "vnc"
  | "sftp"
  | "serial"
  | "other";

export type MobaXtermImportStatus =
  | "ready"
  | "needs_input"
  | "unsupported"
  | "invalid";

export type MobaXtermImportConflict =
  | "none"
  | "exact_duplicate"
  | "name_conflict"
  | "possible_target_duplicate";

export interface MobaXtermImportItem {
  source_index: number;
  name: string;
  folder_path?: string | null;
  kind: MobaXtermSessionKind;
  source_type_code: string;
  host?: string | null;
  port?: number | null;
  username?: string | null;
  private_key_path?: string | null;
  status: MobaXtermImportStatus;
  missing_fields: string[];
  warnings: string[];
  conflict: MobaXtermImportConflict;
  suggested_name?: string | null;
  effective_username?: string | null;
  selectable: boolean;
}

export interface MobaXtermImportSummary {
  total: number;
  ready: number;
  needs_input: number;
  unsupported: number;
  invalid: number;
  exact_duplicates: number;
  name_conflicts: number;
  possible_target_duplicates: number;
}

export interface MobaXtermImportPreviewResult {
  fingerprint: string;
  summary: MobaXtermImportSummary;
  items: MobaXtermImportItem[];
}

export interface MobaXtermImportSelection {
  source_index: number;
  name: string;
}

export interface MobaXtermImportApplyResult {
  created: number;
  skipped_exact_duplicates: number;
}
