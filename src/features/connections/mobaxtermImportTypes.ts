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

export interface MobaXtermImportItem {
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
}

export interface MobaXtermImportSummary {
  total: number;
  ready: number;
  needs_input: number;
  unsupported: number;
  invalid: number;
}

export interface MobaXtermImportPreviewResult {
  fingerprint: string;
  summary: MobaXtermImportSummary;
  items: MobaXtermImportItem[];
}
