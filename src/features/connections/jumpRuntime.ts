import type {
  ConnectionAuthKind,
  ConnectionProfile,
  ConnectionRuntimeCredentialRequest,
  RuntimeCredentialInput,
} from "./connectionTypes";

export interface CredentialPromptTarget {
  authKind: ConnectionAuthKind;
  connectionId: string;
  host: string;
  name?: string;
  port: number;
  username: string;
}

export interface SshNodeFailure {
  connectionId: string;
  host: string;
  port: number;
  stage: string;
}

function errorDetails(error: unknown): Record<string, unknown> | null {
  if (typeof error !== "object" || error === null || !("details" in error)) return null;
  const details = (error as { details?: unknown }).details;
  return typeof details === "object" && details !== null
    ? (details as Record<string, unknown>)
    : null;
}

function authKind(value: unknown): ConnectionAuthKind | null {
  return value === "password" || value === "private_key" ? value : null;
}

export function parseCredentialPromptTarget(error: unknown): CredentialPromptTarget | null {
  if (
    typeof error !== "object" ||
    error === null ||
    !("code" in error) ||
    (error as { code: unknown }).code !== "credential_prompt_required"
  ) {
    return null;
  }
  const details = errorDetails(error);
  const kind = authKind(details?.auth_kind);
  if (
    details?.kind !== "credential_prompt_required" ||
    typeof details.connection_id !== "string" ||
    typeof details.host !== "string" ||
    typeof details.port !== "number" ||
    typeof details.username !== "string" ||
    !kind
  ) {
    return null;
  }
  return {
    authKind: kind,
    connectionId: details.connection_id,
    host: details.host,
    port: details.port,
    username: details.username,
  };
}

export function parseSshNodeFailure(error: unknown): SshNodeFailure | null {
  const details = errorDetails(error);
  if (
    details?.kind !== "ssh_node_failure" ||
    typeof details.connection_id !== "string" ||
    typeof details.host !== "string" ||
    typeof details.port !== "number" ||
    typeof details.stage !== "string"
  ) {
    return null;
  }
  return {
    connectionId: details.connection_id,
    host: details.host,
    port: details.port,
    stage: details.stage,
  };
}

export function credentialPromptTargetFromConnection(
  connection: ConnectionProfile,
): CredentialPromptTarget {
  return {
    authKind: connection.prompt_auth_kind || connection.inline_auth_kind || "password",
    connectionId: connection.id,
    host: connection.host,
    name: connection.name,
    port: connection.port,
    username: connection.username,
  };
}

export function upsertRuntimeCredential(
  current: Record<string, RuntimeCredentialInput>,
  connectionId: string,
  authKind: ConnectionAuthKind,
  password: string,
  privateKeyPath: string,
  privateKeyPassphrase: string,
) {
  const credential: RuntimeCredentialInput =
    authKind === "password"
      ? { auth_kind: authKind, password: password || undefined }
      : {
          auth_kind: authKind,
          private_key_path: privateKeyPath || undefined,
          private_key_passphrase: privateKeyPassphrase || undefined,
        };
  return { ...current, [connectionId]: credential };
}

export function buildRuntimeCredentialRequest(
  connectionId: string,
  runtimeCredentials: Record<string, RuntimeCredentialInput>,
): ConnectionRuntimeCredentialRequest {
  const target = runtimeCredentials[connectionId] || {};
  return {
    ...target,
    connection_id: connectionId,
    runtime_credentials: runtimeCredentials,
  };
}
