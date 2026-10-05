import * as Dialog from "@radix-ui/react-dialog";
import {
  CheckCircle2,
  KeyRound,
  Loader2,
  LockKeyhole,
  Network,
  Pencil,
  Play,
  Plus,
  RefreshCw,
  Square,
  Trash2,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState, type FormEvent } from "react";

import { getLocale, t as tr, useI18n } from "../../shared/i18n";
import type { ConnectionAuthKind, ConnectionProfile } from "../connections/connectionTypes";
import { parseHostKeyError, type ParsedHostKeyError } from "../connections/hostKeyErrors";
import {
  knownHostTrust,
  tunnelDelete,
  tunnelList,
  tunnelStart,
  tunnelStop,
  tunnelUpsert,
} from "../../shared/tauri/commands";
import { hasTauriRuntime } from "../../shared/tauri/runtime";
import { AppSelect } from "../../shared/ui/AppSelect";
import { ConfirmDialog } from "../../shared/ui/ConfirmDialog";
import { Tooltip } from "../../shared/ui/Tooltip";
import { resolveTunnelRuleConnection } from "./tunnelRuleConnectionState";
import type {
  TunnelKind,
  TunnelRule,
  TunnelRuleInput,
  TunnelRuleWithState,
  TunnelRuntimeCredentialInput,
  TunnelStatus,
} from "./tunnelTypes";

interface TunnelPanelProps {
  activeConnectionId?: string | null;
  connections: ConnectionProfile[];
}

interface TunnelFormState {
  autoStart: boolean;
  connectionId: string;
  id?: string;
  kind: TunnelKind;
  localHost: string;
  localPort: string;
  name: string;
  remoteHost: string;
  remotePort: string;
}

interface CredentialPromptState {
  authKind: ConnectionAuthKind;
  error?: string | null;
  password: string;
  privateKeyPassphrase: string;
  privateKeyPath: string;
  rule: TunnelRule;
  submitting: boolean;
}

interface HostKeyPromptState {
  credential?: TunnelRuntimeCredentialInput;
  error?: string | null;
  parsed: ParsedHostKeyError;
  rule: TunnelRule;
  submitting: boolean;
}

export function TunnelPanel({ activeConnectionId = null, connections }: TunnelPanelProps) {
  const { locale } = useI18n();
  const [items, setItems] = useState<TunnelRuleWithState[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [unavailableReason, setUnavailableReason] = useState<string | null>(null);
  const [form, setForm] = useState<TunnelFormState | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [busyRuleId, setBusyRuleId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<TunnelRule | null>(null);
  const [credentialPrompt, setCredentialPrompt] = useState<CredentialPromptState | null>(null);
  const [hostKeyPrompt, setHostKeyPrompt] = useState<HostKeyPromptState | null>(null);

  const connectionById = useMemo(
    () => new Map(connections.map((connection) => [connection.id, connection])),
    [connections, locale],
  );
  const connectionOptions = useMemo(
    () =>
      connections.length
        ? connections.map((connection) => ({
            label: connection.name || `${connection.host}:${connection.port.toString()}`,
            value: connection.id,
          }))
        : [{ disabled: true, label: tr("tunnel.noConnections"), value: "" }],
    [connections],
  );
  const sortedItems = useMemo(() => [...items].sort(compareTunnelItems), [items]);
  const runningCount = items.filter((item) => item.state.status === "running").length;
  const credentialRequiredCount = items.filter(
    (item) => item.state.status === "credential_required",
  ).length;

  useEffect(() => {
    void loadTunnels();
  }, []);

  async function loadTunnels() {
    setLoading(true);
    setError(null);
    setUnavailableReason(null);
    try {
      if (!hasTauriRuntime()) {
        setItems(previewTunnelItems(connections[0]?.id || "preview-connection"));
        return;
      }
      const nextItems = await tunnelList();
      setItems(nextItems);
    } catch (nextError) {
      if (isTauriCommandMissingError(nextError, "tunnel_list")) {
        setItems([]);
        setUnavailableReason(tr("tunnel.restartRequired"));
        return;
      }
      setError(formatError(nextError));
    } finally {
      setLoading(false);
    }
  }

  function openCreateForm() {
    const connectionId = activeConnectionId || connections[0]?.id || "";
    setForm({
      autoStart: false,
      connectionId,
      kind: "local",
      localHost: "127.0.0.1",
      localPort: "15432",
      name: "",
      remoteHost: "127.0.0.1",
      remotePort: "5432",
    });
    setFormError(null);
  }

  function openEditForm(rule: TunnelRule) {
    setForm({
      autoStart: rule.auto_start,
      connectionId: rule.connection_id,
      id: rule.id,
      kind: rule.kind,
      localHost: rule.local_host,
      localPort: rule.local_port.toString(),
      name: rule.name,
      remoteHost: rule.remote_host,
      remotePort: rule.remote_port.toString(),
    });
    setFormError(null);
  }

  async function submitForm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!form) {
      return;
    }

    let input: TunnelRuleInput;
    try {
      input = formToInput(form);
    } catch (nextError) {
      setFormError(formatError(nextError));
      return;
    }

    setSaving(true);
    setFormError(null);
    try {
      const saved = hasTauriRuntime()
        ? await tunnelUpsert(input)
        : previewSavedTunnel(input, connections[0]?.id || "preview-connection");
      upsertItem(saved);
      setForm(null);
    } catch (nextError) {
      setFormError(formatError(nextError));
    } finally {
      setSaving(false);
    }
  }

  async function startRule(rule: TunnelRule, credential?: TunnelRuntimeCredentialInput) {
    setBusyRuleId(rule.id);
    setError(null);
    try {
      const started = hasTauriRuntime()
        ? await tunnelStart(rule.id, credential)
        : previewWithStatus(rule, "running");
      upsertItem(started);
      setCredentialPrompt(null);
      setHostKeyPrompt(null);
    } catch (nextError) {
      const hostKeyError = parseHostKeyError(nextError);
      if (hostKeyError) {
        setHostKeyPrompt({
          credential,
          parsed: hostKeyError,
          rule,
          submitting: false,
        });
        return;
      }
      if (isCredentialPromptError(nextError)) {
        const connection = connectionById.get(rule.connection_id);
        setCredentialPrompt({
          authKind: connection?.prompt_auth_kind || "password",
          password: "",
          privateKeyPassphrase: "",
          privateKeyPath: "",
          rule,
          submitting: false,
        });
        void loadTunnels();
        return;
      }
      setError(formatError(nextError));
      void loadTunnels();
    } finally {
      setBusyRuleId(null);
    }
  }

  async function stopRule(rule: TunnelRule) {
    setBusyRuleId(rule.id);
    setError(null);
    try {
      const stopped = hasTauriRuntime()
        ? await tunnelStop(rule.id)
        : previewWithStatus(rule, "stopped");
      upsertItem(stopped);
    } catch (nextError) {
      setError(formatError(nextError));
      void loadTunnels();
    } finally {
      setBusyRuleId(null);
    }
  }

  async function confirmDeleteRule() {
    if (!deleteTarget) {
      return;
    }
    const rule = deleteTarget;
    setError(null);
    try {
      if (hasTauriRuntime()) {
        await tunnelDelete(rule.id);
      }
      setItems((current) => current.filter((item) => item.rule.id !== rule.id));
    } catch (nextError) {
      setError(formatError(nextError));
      void loadTunnels();
    } finally {
      setDeleteTarget(null);
    }
  }

  async function submitCredential(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!credentialPrompt) {
      return;
    }
    const credential = credentialPromptToInput(credentialPrompt);
    if (!credential) {
      setCredentialPrompt({ ...credentialPrompt, error: tr("tunnel.credentialRequired") });
      return;
    }
    setCredentialPrompt({ ...credentialPrompt, error: null, submitting: true });
    await startRule(credentialPrompt.rule, credential);
  }

  async function trustHostKeyAndRetry() {
    if (!hostKeyPrompt) {
      return;
    }
    setHostKeyPrompt({ ...hostKeyPrompt, error: null, submitting: true });
    try {
      await knownHostTrust(hostKeyPrompt.parsed.hostKey);
      await startRule(hostKeyPrompt.rule, hostKeyPrompt.credential);
    } catch (nextError) {
      setHostKeyPrompt({
        ...hostKeyPrompt,
        error: formatError(nextError),
        submitting: false,
      });
    }
  }

  function upsertItem(item: TunnelRuleWithState) {
    setItems((current) => {
      const index = current.findIndex((existing) => existing.rule.id === item.rule.id);
      if (index < 0) {
        return [...current, item];
      }
      const next = [...current];
      next[index] = item;
      return next;
    });
  }

  return (
    <div className="tunnel-tool-body">
      <section className="tunnel-panel" aria-label={tr("tunnel.aria")}>
        <header className="tunnel-panel-head">
          <span>
            <strong>{tr("tunnel.title")}</strong>
            <small>
              {tr("tunnel.summary", { running: runningCount })}
              {credentialRequiredCount > 0 ? tr("tunnel.summaryCredentials", { count: credentialRequiredCount }) : ""}
            </small>
          </span>
          <div className="tunnel-head-actions">
            <Tooltip label={tr("tunnel.refresh")}>
              <button className="mini-action" type="button" aria-label={tr("tunnel.refresh")} onClick={() => void loadTunnels()}>
                <RefreshCw className={`ui-icon ${loading ? "spin" : ""}`} aria-hidden="true" />
              </button>
            </Tooltip>
            <button
              className="tunnel-primary-button"
              type="button"
              disabled={connections.length === 0 || Boolean(unavailableReason)}
              onClick={openCreateForm}
            >
              <Plus className="ui-icon" aria-hidden="true" />
              {tr("tunnel.new")}
            </button>
          </div>
        </header>

        {error ? <p className="tunnel-inline-error">{error}</p> : null}

        <div className="tunnel-list">
          {sortedItems.length === 0 ? (
            <div className="tunnel-empty">
              <Network className="ui-icon" aria-hidden="true" />
              <strong>{unavailableReason ? tr("tunnel.empty.restart") : connections.length ? tr("tunnel.empty.rules") : tr("tunnel.empty.connections")}</strong>
              <small>{unavailableReason || (connections.length ? tr("tunnel.empty.rulesHint") : tr("tunnel.empty.connectionsHint"))}</small>
              {connections.length && !unavailableReason ? (
                <button type="button" onClick={openCreateForm}>
                  <Plus className="ui-icon" aria-hidden="true" />
                  {tr("tunnel.newRule")}
                </button>
              ) : null}
            </div>
          ) : (
            sortedItems.map((item) => {
              const rule = item.rule;
              const state = item.state;
              const connectionState = resolveTunnelRuleConnection(rule, connections);
              const busy = busyRuleId === rule.id || state.status === "starting";
              const running = state.status === "running";
              return (
                <article className={`tunnel-item ${state.status}`} key={rule.id}>
                  <header>
                    <span className="tunnel-item-title">
                      <Network className="ui-icon" aria-hidden="true" />
                      <strong title={rule.name}>{rule.name}</strong>
                    </span>
                    <span className={`tunnel-status ${state.status}`}>{tunnelStatusLabel(state.status)}</span>
                  </header>
                  <div className="tunnel-route">
                    {formatTunnelRoute(rule).map((part, index) =>
                      part === "→" ? (
                        <span aria-hidden="true" key={`${rule.id}-arrow-${index.toString()}`}>→</span>
                      ) : (
                        <code key={`${rule.id}-${part}`}>{part}</code>
                      ),
                    )}
                  </div>
                  <div className="tunnel-meta">
                    <span>{connectionState.label}</span>
                    <em>{tunnelKindLabel(rule.kind)}</em>
                    {rule.auto_start ? <em>{tr("tunnel.autoStart")}</em> : null}
                    {state.active_connections > 0 ? <em>{tr("tunnel.activeConnections", { count: state.active_connections })}</em> : null}
                  </div>
                  {state.last_error ? <p className="tunnel-item-error">{state.last_error}</p> : null}
                  <footer>
                    {running ? (
                      <button type="button" disabled={busy} onClick={() => void stopRule(rule)}>
                        <Square className="ui-icon" aria-hidden="true" />
                        {tr("tunnel.stop")}
                      </button>
                    ) : (
                      <button
                        type="button"
                        disabled={busy || !connectionState.canStart}
                        title={connectionState.canStart ? undefined : tr("tunnel.connectionMissing")}
                        onClick={() => void startRule(rule)}
                      >
                        {busy ? <Loader2 className="ui-icon spin" aria-hidden="true" /> : <Play className="ui-icon" aria-hidden="true" />}
                        {tr("tunnel.start")}
                      </button>
                    )}
                    <Tooltip label={running ? tr("tunnel.stopBeforeEdit") : tr("tunnel.editRule")}>
                      <button className="tunnel-icon-button" type="button" disabled={running || busy} aria-label={tr("tunnel.editRule")} onClick={() => openEditForm(rule)}>
                        <Pencil className="ui-icon" aria-hidden="true" />
                      </button>
                    </Tooltip>
                    <Tooltip label={tr("tunnel.deleteRule")}>
                      <button className="tunnel-icon-button danger" type="button" disabled={busy} aria-label={tr("tunnel.deleteRule")} onClick={() => setDeleteTarget(rule)}>
                        <Trash2 className="ui-icon" aria-hidden="true" />
                      </button>
                    </Tooltip>
                  </footer>
                </article>
              );
            })
          )}
        </div>
      </section>

      <TunnelRuleDialog
        connectionOptions={connectionOptions}
        form={form}
        formError={formError}
        saving={saving}
        onChange={setForm}
        onClose={() => setForm(null)}
        onSubmit={submitForm}
      />
      <CredentialPromptDialog
        prompt={credentialPrompt}
        onAuthKindChange={(authKind) => credentialPrompt && setCredentialPrompt({ ...credentialPrompt, authKind })}
        onChange={setCredentialPrompt}
        onClose={() => setCredentialPrompt(null)}
        onSubmit={submitCredential}
      />
      <HostKeyPromptDialog
        prompt={hostKeyPrompt}
        onClose={() => setHostKeyPrompt(null)}
        onTrust={() => void trustHostKeyAndRetry()}
      />
      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title={tr("tunnel.delete.title")}
        description={deleteTarget ? tr("tunnel.delete.description", { name: deleteTarget.name }) : ""}
        confirmLabel={tr("tunnel.delete.confirm")}
        onConfirm={confirmDeleteRule}
        onOpenChange={(open) => {
          if (!open) {
            setDeleteTarget(null);
          }
        }}
      />
    </div>
  );
}

function TunnelRuleDialog({
  connectionOptions,
  form,
  formError,
  saving,
  onChange,
  onClose,
  onSubmit,
}: {
  connectionOptions: Array<{ disabled?: boolean; label: string; value: string }>;
  form: TunnelFormState | null;
  formError: string | null;
  saving: boolean;
  onChange: (form: TunnelFormState) => void;
  onClose: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  const copy = form ? tunnelFormCopy(form.kind) : tunnelFormCopy("local");

  function changeKind(kind: TunnelKind) {
    if (!form) {
      return;
    }
    const next: TunnelFormState = { ...form, kind };
    if (kind === "dynamic") {
      next.remoteHost = "";
      next.remotePort = "1";
      if (form.localPort === "15432") {
        next.localPort = "1080";
      }
    } else if (kind === "remote") {
      if (!form.remoteHost.trim()) {
        next.remoteHost = "127.0.0.1";
      }
      if (form.remotePort === "1" || form.remotePort === "5432") {
        next.remotePort = "18080";
      }
      if (form.localPort === "15432") {
        next.localPort = "8080";
      }
    } else {
      if (!form.remoteHost.trim()) {
        next.remoteHost = "127.0.0.1";
      }
      if (form.remotePort === "1" || form.remotePort === "18080") {
        next.remotePort = "5432";
      }
    }
    onChange(next);
  }

  return (
    <Dialog.Root open={Boolean(form)} onOpenChange={(open) => !open && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-backdrop" />
        {form ? (
          <Dialog.Content className="tunnel-dialog">
            <form onSubmit={onSubmit}>
              <header className="dialog-head">
                <span className="dialog-title-group">
                  <Dialog.Title>{form.id ? tr("tunnel.dialog.edit") : tr("tunnel.dialog.new")}</Dialog.Title>
                  <Dialog.Description className="dialog-subtitle">{copy.description}</Dialog.Description>
                </span>
                <Dialog.Close asChild>
                  <button className="icon-button dialog-close-button" type="button" aria-label={tr("tunnel.close")}>
                    <X className="ui-icon" aria-hidden="true" />
                  </button>
                </Dialog.Close>
              </header>
              <div className="dialog-body tunnel-dialog-body">
                <label>
                  <span>{tr("tunnel.field.name")}</span>
                  <input value={form.name} placeholder={tr("tunnel.field.namePlaceholder")} onChange={(event) => onChange({ ...form, name: event.currentTarget.value })} />
                </label>
                <label>
                  <span>{tr("tunnel.field.kind")}</span>
                  <AppSelect ariaLabel={tr("tunnel.field.kindAria")} value={form.kind} options={tunnelKindOptions()} onChange={changeKind} />
                </label>
                <label>
                  <span>{tr("tunnel.field.connection")}</span>
                  <AppSelect ariaLabel={tr("tunnel.field.connection")} value={form.connectionId} options={connectionOptions} onChange={(connectionId) => onChange({ ...form, connectionId })} />
                </label>
                <div className="tunnel-form-grid">
                  <label>
                    <span>{copy.localHostLabel}</span>
                    <input value={form.localHost} onChange={(event) => onChange({ ...form, localHost: event.currentTarget.value })} />
                  </label>
                  <label>
                    <span>{copy.localPortLabel}</span>
                    <input inputMode="numeric" value={form.localPort} onChange={(event) => onChange({ ...form, localPort: event.currentTarget.value })} />
                  </label>
                </div>
                {form.kind === "dynamic" ? (
                  <p className="tunnel-helper-note">{tr("tunnel.dynamic.note")}</p>
                ) : (
                  <div className="tunnel-form-grid">
                    <label>
                      <span>{copy.remoteHostLabel}</span>
                      <input value={form.remoteHost} onChange={(event) => onChange({ ...form, remoteHost: event.currentTarget.value })} />
                    </label>
                    <label>
                      <span>{copy.remotePortLabel}</span>
                      <input inputMode="numeric" value={form.remotePort} onChange={(event) => onChange({ ...form, remotePort: event.currentTarget.value })} />
                    </label>
                  </div>
                )}
                <label className="tunnel-check-row">
                  <input type="checkbox" checked={form.autoStart} onChange={(event) => onChange({ ...form, autoStart: event.currentTarget.checked })} />
                  <span>
                    <strong>{tr("tunnel.autoStart.title")}</strong>
                    <small>{tr("tunnel.autoStart.description")}</small>
                  </span>
                </label>
                {formError ? <p className="remote-file-dialog-error">{formError}</p> : null}
              </div>
              <footer className="dialog-actions tunnel-dialog-actions">
                <span />
                <Dialog.Close asChild>
                  <button type="button" disabled={saving}>{tr("tunnel.cancel")}</button>
                </Dialog.Close>
                <button className="primary-button" type="submit" disabled={saving}>
                  {saving ? <Loader2 className="ui-icon spin" aria-hidden="true" /> : null}
                  {tr("tunnel.save")}
                </button>
              </footer>
            </form>
          </Dialog.Content>
        ) : null}
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function CredentialPromptDialog({
  prompt,
  onAuthKindChange,
  onChange,
  onClose,
  onSubmit,
}: {
  prompt: CredentialPromptState | null;
  onAuthKindChange: (authKind: ConnectionAuthKind) => void;
  onChange: (prompt: CredentialPromptState) => void;
  onClose: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <Dialog.Root open={Boolean(prompt)} onOpenChange={(open) => !open && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-backdrop" />
        {prompt ? (
          <Dialog.Content className="tunnel-dialog tunnel-credential-dialog">
            <form onSubmit={onSubmit}>
              <header className="dialog-head">
                <span className="dialog-title-group">
                  <Dialog.Title>{tr("tunnel.credentials.title")}</Dialog.Title>
                  <Dialog.Description className="dialog-subtitle">{tr("tunnel.credentials.description", { name: prompt.rule.name })}</Dialog.Description>
                </span>
                <Dialog.Close asChild>
                  <button className="icon-button dialog-close-button" type="button" aria-label={tr("tunnel.close")}>
                    <X className="ui-icon" aria-hidden="true" />
                  </button>
                </Dialog.Close>
              </header>
              <div className="dialog-body tunnel-dialog-body">
                <div className="tunnel-dialog-icon-head">
                  <KeyRound className="ui-icon" aria-hidden="true" />
                  <span>{tr("tunnel.credentials.prompt")}</span>
                </div>
                <label>
                  <span>{tr("tunnel.credentials.auth")}</span>
                  <AppSelect ariaLabel={tr("tunnel.credentials.auth")} value={prompt.authKind} options={authKindOptions()} onChange={onAuthKindChange} />
                </label>
                {prompt.authKind === "password" ? (
                  <label>
                    <span>{tr("tunnel.credentials.password")}</span>
                    <input type="password" value={prompt.password} onChange={(event) => onChange({ ...prompt, password: event.currentTarget.value })} />
                  </label>
                ) : (
                  <>
                    <label>
                      <span>{tr("tunnel.credentials.privateKeyPath")}</span>
                      <input value={prompt.privateKeyPath} placeholder="~/.ssh/id_ed25519" onChange={(event) => onChange({ ...prompt, privateKeyPath: event.currentTarget.value })} />
                    </label>
                    <label>
                      <span>{tr("tunnel.credentials.passphrase")}</span>
                      <input type="password" value={prompt.privateKeyPassphrase} onChange={(event) => onChange({ ...prompt, privateKeyPassphrase: event.currentTarget.value })} />
                    </label>
                  </>
                )}
                {prompt.error ? <p className="remote-file-dialog-error">{prompt.error}</p> : null}
              </div>
              <footer className="dialog-actions tunnel-dialog-actions">
                <span />
                <Dialog.Close asChild>
                  <button type="button" disabled={prompt.submitting}>{tr("tunnel.cancel")}</button>
                </Dialog.Close>
                <button className="primary-button" type="submit" disabled={prompt.submitting}>
                  {prompt.submitting ? <Loader2 className="ui-icon spin" aria-hidden="true" /> : null}
                  {tr("tunnel.credentials.continue")}
                </button>
              </footer>
            </form>
          </Dialog.Content>
        ) : null}
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function HostKeyPromptDialog({
  prompt,
  onClose,
  onTrust,
}: {
  prompt: HostKeyPromptState | null;
  onClose: () => void;
  onTrust: () => void;
}) {
  return (
    <Dialog.Root open={Boolean(prompt)} onOpenChange={(open) => !open && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-backdrop" />
        {prompt ? (
          <Dialog.Content className="tunnel-dialog tunnel-host-key-dialog">
            <header className="dialog-head">
              <span className="dialog-title-group">
                <Dialog.Title>{tr("tunnel.hostKey.title")}</Dialog.Title>
                <Dialog.Description className="dialog-subtitle">{prompt.parsed.decision === "changed" ? tr("tunnel.hostKey.changed") : prompt.parsed.hostKey.key_algorithm}</Dialog.Description>
              </span>
              <Dialog.Close asChild>
                <button className="icon-button dialog-close-button" type="button" aria-label={tr("tunnel.close")}>
                  <X className="ui-icon" aria-hidden="true" />
                </button>
              </Dialog.Close>
            </header>
            <div className="dialog-body tunnel-dialog-body">
              <div className="tunnel-dialog-icon-head warning">
                <LockKeyhole className="ui-icon" aria-hidden="true" />
                <span>{tr("tunnel.hostKey.retry")}</span>
              </div>
              {prompt.parsed.oldFingerprint ? <code>{tr("tunnel.hostKey.old", { value: prompt.parsed.oldFingerprint })}</code> : null}
              <code>{prompt.parsed.hostKey.fingerprint_sha256}</code>
              {prompt.error ? <p className="remote-file-dialog-error">{prompt.error}</p> : null}
            </div>
            <footer className="dialog-actions tunnel-dialog-actions">
              <span />
              <Dialog.Close asChild>
                <button type="button" disabled={prompt.submitting}>{tr("tunnel.cancel")}</button>
              </Dialog.Close>
              <button className="primary-button" type="button" disabled={prompt.submitting} onClick={onTrust}>
                {prompt.submitting ? <Loader2 className="ui-icon spin" aria-hidden="true" /> : <CheckCircle2 className="ui-icon" aria-hidden="true" />}
                {tr("tunnel.hostKey.trust")}
              </button>
            </footer>
          </Dialog.Content>
        ) : null}
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function formToInput(form: TunnelFormState): TunnelRuleInput {
  const copy = tunnelFormCopy(form.kind);
  const localPort = parsePort(form.localPort, tr("tunnel.validation.port", { field: copy.localPortLabel }));
  const remotePort = form.kind === "dynamic" ? 1 : parsePort(form.remotePort, tr("tunnel.validation.port", { field: copy.remotePortLabel }));
  if (!form.connectionId.trim()) {
    throw new Error(tr("tunnel.validation.connection"));
  }
  if (!form.localHost.trim()) {
    throw new Error(tr("tunnel.validation.field", { field: copy.localHostLabel }));
  }
  if (form.kind !== "dynamic" && !form.remoteHost.trim()) {
    throw new Error(tr("tunnel.validation.field", { field: copy.remoteHostLabel }));
  }
  return {
    auto_start: form.autoStart,
    connection_id: form.connectionId.trim(),
    id: form.id,
    kind: form.kind,
    local_host: form.localHost.trim(),
    local_port: localPort,
    name: form.name.trim() || undefined,
    remote_host: form.kind === "dynamic" ? "" : form.remoteHost.trim(),
    remote_port: remotePort,
  };
}

function parsePort(value: string, message: string) {
  const port = Number(value.trim());
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(message);
  }
  return port;
}

function credentialPromptToInput(prompt: CredentialPromptState): TunnelRuntimeCredentialInput | null {
  if (prompt.authKind === "password") {
    return prompt.password.trim()
      ? {
          auth_kind: "password",
          password: prompt.password,
        }
      : null;
  }
  return prompt.privateKeyPath.trim()
    ? {
        auth_kind: "private_key",
        private_key_passphrase: prompt.privateKeyPassphrase || undefined,
        private_key_path: prompt.privateKeyPath.trim(),
      }
    : null;
}

function compareTunnelItems(left: TunnelRuleWithState, right: TunnelRuleWithState) {
  const statusDelta = statusPriority(right.state.status) - statusPriority(left.state.status);
  if (statusDelta !== 0) {
    return statusDelta;
  }
  return left.rule.name.localeCompare(right.rule.name, getLocale() === "zh-CN" ? "zh-Hans-CN" : "en");
}

function statusPriority(status: TunnelStatus) {
  const priorities: Record<TunnelStatus, number> = {
    credential_required: 3,
    failed: 4,
    running: 5,
    starting: 6,
    stopped: 1,
  };
  return priorities[status];
}

function tunnelStatusLabel(status: TunnelStatus) {
  const keys: Record<TunnelStatus, Parameters<typeof tr>[0]> = {
    credential_required: "tunnel.status.credential",
    failed: "tunnel.status.failed",
    running: "tunnel.status.running",
    starting: "tunnel.status.starting",
    stopped: "tunnel.status.stopped",
  };
  return tr(keys[status]);
}

function tunnelKindLabel(kind: TunnelKind) {
  if (kind === "dynamic") return tr("tunnel.kind.dynamic");
  if (kind === "remote") return tr("tunnel.kind.remote");
  return tr("tunnel.kind.local");
}

function formatTunnelRoute(rule: TunnelRule) {
  const local = `${rule.local_host}:${rule.local_port.toString()}`;
  const remote = `${rule.remote_host}:${rule.remote_port.toString()}`;
  if (rule.kind === "dynamic") {
    return [local, "→", "SOCKS5 over SSH"];
  }
  if (rule.kind === "remote") {
    return [remote, "→", local];
  }
  return [local, "→", remote];
}

function formatDefaultTunnelName(input: TunnelRuleInput) {
  const local = `${input.local_host}:${input.local_port.toString()}`;
  const remote = `${input.remote_host}:${input.remote_port.toString()}`;
  if (input.kind === "dynamic") {
    return `D ${local} SOCKS`;
  }
  if (input.kind === "remote") {
    return `R ${remote} -> ${local}`;
  }
  return `L ${local} -> ${remote}`;
}

function tunnelFormCopy(kind: TunnelKind) {
  if (kind === "dynamic") {
    return {
      description: tr("tunnel.form.dynamic.description"),
      localHostLabel: tr("tunnel.form.dynamic.localHost"),
      localPortLabel: tr("tunnel.form.dynamic.localPort"),
      remoteHostLabel: tr("tunnel.form.dynamic.remoteHost"),
      remotePortLabel: tr("tunnel.form.dynamic.remotePort"),
    };
  }
  if (kind === "remote") {
    return {
      description: tr("tunnel.form.remote.description"),
      localHostLabel: tr("tunnel.form.remote.localHost"),
      localPortLabel: tr("tunnel.form.remote.localPort"),
      remoteHostLabel: tr("tunnel.form.remote.remoteHost"),
      remotePortLabel: tr("tunnel.form.remote.remotePort"),
    };
  }
  return {
    description: tr("tunnel.form.local.description"),
    localHostLabel: tr("tunnel.form.local.localHost"),
    localPortLabel: tr("tunnel.form.local.localPort"),
    remoteHostLabel: tr("tunnel.form.local.remoteHost"),
    remotePortLabel: tr("tunnel.form.local.remotePort"),
  };
}

function authKindOptions(): Array<{ label: string; value: ConnectionAuthKind }> {
  return [
    { label: tr("tunnel.auth.password"), value: "password" },
    { label: tr("tunnel.auth.privateKey"), value: "private_key" },
  ];
}

function tunnelKindOptions(): Array<{ label: string; value: TunnelKind }> {
  return [
    { label: tr("tunnel.kind.local"), value: "local" },
    { label: tr("tunnel.kind.dynamic"), value: "dynamic" },
    { label: tr("tunnel.kind.remote"), value: "remote" },
  ];
}

function isCredentialPromptError(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    String((error as { code: unknown }).code) === "credential_prompt_required"
  );
}

function isTauriCommandMissingError(error: unknown, commandName: string) {
  const message = formatError(error).toLowerCase();
  const normalizedCommandName = commandName.toLowerCase();
  const singleQuote = String.fromCharCode(39);
  return (
    message.includes(`command ${normalizedCommandName} not found`) ||
    message.includes(`command ${singleQuote}${normalizedCommandName}${singleQuote} not found`) ||
    message.includes(`command "${normalizedCommandName}" not found`)
  );
}

function formatError(error: unknown) {
  if (typeof error === "object" && error !== null && "message" in error) {
    return String((error as { message: unknown }).message);
  }
  return String(error);
}

function previewTunnelItems(connectionId: string): TunnelRuleWithState[] {
  const rule: TunnelRule = {
    auto_start: false,
    connection_id: connectionId,
    created_at: "preview",
    id: "preview-tunnel",
    kind: "local",
    local_host: "127.0.0.1",
    local_port: 15432,
    name: tr("tunnel.preview.name"),
    remote_host: "127.0.0.1",
    remote_port: 5432,
    updated_at: "preview",
  };
  return [previewWithStatus(rule, "stopped")];
}

function previewSavedTunnel(input: TunnelRuleInput, fallbackConnectionId: string): TunnelRuleWithState {
  const rule: TunnelRule = {
    auto_start: input.auto_start,
    connection_id: input.connection_id || fallbackConnectionId,
    created_at: "preview",
    id: input.id || `preview-${Date.now().toString()}`,
    kind: input.kind,
    local_host: input.local_host,
    local_port: input.local_port,
    name: input.name || formatDefaultTunnelName(input),
    remote_host: input.remote_host,
    remote_port: input.remote_port,
    updated_at: "preview",
  };
  return previewWithStatus(rule, "stopped");
}

function previewWithStatus(rule: TunnelRule, status: TunnelStatus): TunnelRuleWithState {
  return {
    rule,
    state: {
      active_connections: status === "running" ? 1 : 0,
      bound_host: status === "running" ? rule.local_host : null,
      bound_port: status === "running" ? rule.local_port : null,
      last_error: null,
      last_error_code: null,
      rule_id: rule.id,
      started_at: status === "running" ? "preview" : null,
      status,
    },
  };
}
