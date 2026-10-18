import { defaultAdvancedConfig, defaultRloginConfig, normalizeTerminalEncoding } from "./connectionTypes";
import type { ConnectionProfile, ConnectionProfileInput } from "./connectionTypes";

/** Metadata only: saving/copying never supplies this-run plaintext consent. */
export function normalizeRloginInput(input: ConnectionProfileInput | ConnectionProfile): ConnectionProfileInput {
  const trim = (value?: string | null) => value?.trim() || undefined;
  const config = { ...defaultRloginConfig, ...input.rlogin };
  return {
    id: trim(input.id), source_connection_id: "source_connection_id" in input ? trim(input.source_connection_id) : undefined, protocol: "rlogin",
    name: trim(input.name), group: input.group_id ? undefined : trim(input.group), group_id: trim(input.group_id),
    host: input.host.trim(), port: Number(input.port), username: input.username.trim(),
    credential_mode: "prompt", proxy: { kind: "none" }, jump: { kind: "none" },
    advanced: { ...defaultAdvancedConfig, terminal_encoding: normalizeTerminalEncoding(input.advanced?.terminal_encoding) },
    rlogin: { local_address: config.local_address.trim(), local_user: config.local_user.trim(), terminal: config.terminal.trim(), speed: Number(config.speed) },
    notes: trim(input.notes), is_favorite: input.is_favorite, last_connected_at: trim(input.last_connected_at),
    remote_os_id: trim(input.remote_os_id), remote_os_name: trim(input.remote_os_name), remote_os_version: trim(input.remote_os_version),
  };
}
