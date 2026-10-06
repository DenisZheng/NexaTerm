import {
  Bot,
  Clock3,
  Copy,
  CornerDownLeft,
  History,
  ListPlus,
  Play,
  Plus,
  RefreshCw,
  Save,
  Send,
  Settings,
  ShieldAlert,
  Square,
  Terminal,
  Trash2,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";

import { copyTextToClipboard } from "../../shared/clipboard";
import { useI18n, t as currentT } from "../../shared/i18n";
import {
  aiChatSessionClear,
  aiChatSessionDelete,
  aiChatSessionGet,
  aiChatSessionList,
  aiChatStreamStart,
  aiChatStreamStop,
  aiCommandAssess,
  aiProviderConfigList,
} from "../../shared/tauri/commands";
import { listenAiChatStream } from "../../shared/tauri/events";
import { hasTauriRuntime } from "../../shared/tauri/runtime";
import { AppSelect } from "../../shared/ui/AppSelect";
import { AnchoredSurfacePortal } from "../../shared/ui/AnchoredSurfacePortal";
import { ConfirmDialog } from "../../shared/ui/ConfirmDialog";
import { Tooltip } from "../../shared/ui/Tooltip";
import type { CommandHistoryEntry } from "../commands/commandLibraryTypes";
import type { ConnectionProfile } from "../connections/connectionTypes";
import { keyboardEventMatchesShortcut } from "../shortcuts/shortcutKeys";
import type {
  AiChatMessage,
  AiChatSessionSummary,
  AiCommandAssessment,
  AiCommandSuggestion,
  AiContextBlock,
  AiProviderConfig,
} from "./aiTypes";

interface AiAssistantPanelProps {
  active: boolean;
  commandDraft: string;
  connection: ConnectionProfile | null;
  contextRequestKey?: number;
  initialContexts?: AiContextBlock[];
  recentCommands: CommandHistoryEntry[];
  recentTerminalOutput?: string | null;
  sendShortcutBinding?: string | null;
  terminalDirectory?: string | null;
  terminalTitle?: string | null;
  onInsertCommand: (command: string) => void;
  onOpenSettings: () => void;
  onSaveCommand: (command: string) => void;
  onSendCommand: (command: string) => Promise<void>;
}

interface StreamState {
  assistantMessageId: string;
  sessionId: string;
  streamId: string;
}

const selectedProviderStorageKey = "mxterm.ai.selectedProviderConfigId";
const contextPreviewLimit = 180;

export function AiAssistantPanel({
  active,
  commandDraft,
  connection,
  contextRequestKey = 0,
  initialContexts = [],
  recentCommands,
  recentTerminalOutput,
  sendShortcutBinding,
  terminalDirectory,
  terminalTitle,
  onInsertCommand,
  onOpenSettings,
  onSaveCommand,
  onSendCommand,
}: AiAssistantPanelProps) {
  const { t, locale } = useI18n();
  const runtimeAvailable = hasTauriRuntime();
  const [providerConfigs, setProviderConfigs] = useState<AiProviderConfig[]>([]);
  const [selectedProviderId, setSelectedProviderId] = useState(() =>
    window.localStorage.getItem(selectedProviderStorageKey) || "",
  );
  const [sessions, setSessions] = useState<AiChatSessionSummary[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<AiChatMessage[]>([]);
  const [contextBlocks, setContextBlocks] = useState<AiContextBlock[]>([]);
  const [input, setInput] = useState("");
  const [historyOpen, setHistoryOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [streamState, setStreamState] = useState<StreamState | null>(null);
  const loadingRef = useRef(false);
  const historyTriggerRef = useRef<HTMLButtonElement | null>(null);
  const messageListRef = useRef<HTMLElement | null>(null);
  const streamStateRef = useRef<StreamState | null>(null);
  const lastContextRequestKeyRef = useRef(0);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pendingDeleteSession, setPendingDeleteSession] =
    useState<AiChatSessionSummary | null>(null);
  const [clearSessionOpen, setClearSessionOpen] = useState(false);
  const [pendingDangerousCommand, setPendingDangerousCommand] =
    useState<AiCommandAssessment | null>(null);

  const selectedProvider = providerConfigs.find((config) => config.id === selectedProviderId) || null;
  const providerOptions = providerConfigs.length
    ? providerConfigs.map((config) => ({
        label: `${config.name} · ${config.model}`,
        value: config.id,
      }))
    : [{ disabled: true, label: t("ai.panel.unconfigured"), value: "" }];
  const sendDisabled =
    Boolean(streamState) || loading || !selectedProvider || input.trim().length === 0;
  const lastUserMessage = useMemo(
    () => [...messages].reverse().find((message) => message.role === "user") || null,
    [messages],
  );

  useEffect(() => {
    streamStateRef.current = streamState;
  }, [streamState]);

  function setCurrentStreamState(next: StreamState | null) {
    streamStateRef.current = next;
    setStreamState(next);
  }

  useEffect(() => {
    loadingRef.current = loading;
  }, [loading]);

  useEffect(() => {
    const list = messageListRef.current;
    if (!list) {
      return;
    }
    list.scrollTop = list.scrollHeight;
  }, [messages, streamState]);

  useEffect(() => {
    if (!active) {
      return;
    }
    void reloadProviderConfigs();
    void reloadSessions();
  }, [active]);

  useEffect(() => {
    if (!selectedProviderId && providerConfigs.length > 0) {
      setSelectedProviderId(providerConfigs[0].id);
      window.localStorage.setItem(selectedProviderStorageKey, providerConfigs[0].id);
      return;
    }
    if (providerConfigs.length === 0 && selectedProviderId) {
      setSelectedProviderId("");
      window.localStorage.removeItem(selectedProviderStorageKey);
      return;
    }
    if (
      selectedProviderId &&
      providerConfigs.length > 0 &&
      !providerConfigs.some((config) => config.id === selectedProviderId)
    ) {
      setSelectedProviderId(providerConfigs[0].id);
      window.localStorage.setItem(selectedProviderStorageKey, providerConfigs[0].id);
    }
  }, [providerConfigs, selectedProviderId]);

  useEffect(() => {
    let disposed = false;
    let unlisten: (() => void) | null = null;
    void listenAiChatStream((event) => {
      if (disposed) {
        return;
      }
      const current = streamStateRef.current;
      if (!current || event.stream_id !== current.streamId) {
        return;
      }
      if (event.kind === "chunk") {
        const delta = event.delta || "";
        setMessages((items) =>
          items.map((message) =>
            message.id === event.message_id
              ? { ...message, content: `${message.content}${delta}`, status: "streaming" }
              : message,
          ),
        );
        return;
      }
      if (event.kind === "finished" || event.kind === "stopped" || event.kind === "error") {
        setMessages((items) =>
          items.map((message) =>
            message.id === event.message_id
              ? {
                  ...message,
                  commands: extractCommandSuggestions(event.content || message.content),
                  content: event.content ?? message.content,
                  status:
                    event.kind === "finished"
                      ? "complete"
                      : event.kind === "stopped"
                        ? "stopped"
                        : "error",
                }
              : message,
          ),
        );
        setCurrentStreamState(null);
        if (event.kind === "error") {
          setError(event.error || currentT("ai.panel.error.reply"));
        } else if (event.kind === "stopped") {
          setNotice(currentT("ai.panel.notice.stopped"));
        }
        void reloadSessions();
      }
    })
      .then((cleanup) => {
        if (disposed) {
          cleanup();
          return;
        }
        unlisten = cleanup;
      })
      .catch((nextError) => {
        if (!disposed) {
          setError(formatAiError(nextError));
        }
      });
    return () => {
      disposed = true;
      if (unlisten) {
        unlisten();
        unlisten = null;
      }
    };
  }, []);

  useEffect(() => {
    if (!contextRequestKey || contextRequestKey === lastContextRequestKeyRef.current) {
      return;
    }
    lastContextRequestKeyRef.current = contextRequestKey;
    appendContextBlocks(initialContexts);
  }, [contextRequestKey, initialContexts]);

  async function reloadProviderConfigs() {
    if (!runtimeAvailable) {
      setProviderConfigs([]);
      return;
    }
    try {
      const configs = await aiProviderConfigList();
      setProviderConfigs(configs);
      setError(null);
    } catch (nextError) {
      setError(formatAiError(nextError));
    }
  }

  async function reloadSessions() {
    if (!runtimeAvailable) {
      setSessions([]);
      return;
    }
    try {
      setSessions(await aiChatSessionList());
    } catch (nextError) {
      setError(formatAiError(nextError));
    }
  }

  async function openSession(sessionId: string) {
    if (!runtimeAvailable || streamState || loadingRef.current) {
      return;
    }
    loadingRef.current = true;
    setLoading(true);
    setError(null);
    try {
      const session = await aiChatSessionGet(sessionId);
      setActiveSessionId(session.summary.id);
      setMessages(session.messages);
      setContextBlocks([]);
      setHistoryOpen(false);
      if (session.summary.provider_config_id) {
        setSelectedProviderId(session.summary.provider_config_id);
        window.localStorage.setItem(selectedProviderStorageKey, session.summary.provider_config_id);
      }
      setNotice(null);
    } catch (nextError) {
      setError(formatAiError(nextError));
    } finally {
      loadingRef.current = false;
      setLoading(false);
    }
  }

  function startNewSession() {
    if (streamState) {
      return;
    }
    setActiveSessionId(null);
    setMessages([]);
    setContextBlocks([]);
    setInput("");
    setError(null);
    setHistoryOpen(false);
    setPendingDangerousCommand(null);
    setNotice(t("ai.panel.notice.newChat"));
  }

  async function submit(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    await sendMessage(input, contextBlocks);
  }

  async function retryLastUserMessage() {
    if (!lastUserMessage) {
      return;
    }
    await sendMessage(lastUserMessage.content, lastUserMessage.contexts);
  }

  async function sendMessage(content: string, contexts: AiContextBlock[]) {
    if (streamStateRef.current || loadingRef.current) {
      return;
    }
    const normalizedContent = content.trim();
    if (!runtimeAvailable) {
      setError(t("ai.panel.error.desktop"));
      return;
    }
    if (!selectedProvider) {
      setError(t("ai.panel.error.noConfig"));
      return;
    }
    if (!normalizedContent) {
      setError(t("ai.panel.error.empty"));
      return;
    }
    loadingRef.current = true;
    setLoading(true);
    setError(null);
    setNotice(null);
    try {
      const response = await aiChatStreamStart({
        provider_config_id: selectedProvider.id,
        session_id: activeSessionId,
        content: normalizedContent,
        contexts,
      });
      const now = Date.now().toString();
      setActiveSessionId(response.session_id);
      setMessages((items) => [
        ...items,
        {
          id: response.user_message_id,
          session_id: response.session_id,
          role: "user",
          content: normalizedContent,
          contexts,
          commands: [],
          status: "complete",
          created_at: now,
          updated_at: now,
        },
        {
          id: response.assistant_message_id,
          session_id: response.session_id,
          role: "assistant",
          content: "",
          contexts: [],
          commands: [],
          status: "streaming",
          created_at: now,
          updated_at: now,
        },
      ]);
      const nextStreamState = {
        assistantMessageId: response.assistant_message_id,
        sessionId: response.session_id,
        streamId: response.stream_id,
      };
      setCurrentStreamState(nextStreamState);
      setInput("");
      setContextBlocks([]);
      void reloadSessions();
    } catch (nextError) {
      setError(formatAiError(nextError));
    } finally {
      loadingRef.current = false;
      setLoading(false);
    }
  }

  async function stopStreaming() {
    if (!streamState) {
      return;
    }
    try {
      await aiChatStreamStop(streamState.streamId);
    } catch (nextError) {
      setError(formatAiError(nextError));
    }
  }

  async function confirmDeleteSession() {
    if (!pendingDeleteSession) {
      return;
    }
    try {
      const currentStream = streamStateRef.current;
      if (currentStream?.sessionId === pendingDeleteSession.id) {
        await aiChatStreamStop(currentStream.streamId).catch(() => undefined);
        setCurrentStreamState(null);
      }
      await aiChatSessionDelete(pendingDeleteSession.id);
      if (activeSessionId === pendingDeleteSession.id) {
        setActiveSessionId(null);
        setMessages([]);
        setContextBlocks([]);
        setPendingDangerousCommand(null);
      }
      setPendingDeleteSession(null);
      await reloadSessions();
      setNotice(t("ai.panel.notice.deleted"));
    } catch (nextError) {
      setError(formatAiError(nextError));
    }
  }

  async function clearCurrentSession() {
    if (!activeSessionId) {
      return;
    }
    if (streamStateRef.current) {
      setError(t("ai.panel.error.stopFirst"));
      setClearSessionOpen(false);
      return;
    }
    try {
      const cleared = await aiChatSessionClear(activeSessionId);
      setMessages(cleared.messages);
      setContextBlocks([]);
      setPendingDangerousCommand(null);
      setClearSessionOpen(false);
      await reloadSessions();
      setNotice(t("ai.panel.notice.cleared"));
    } catch (nextError) {
      setError(formatAiError(nextError));
    }
  }

  async function copyCommand(command: string) {
    try {
      await copyTextToClipboard(command);
      setNotice(t("ai.panel.notice.copied"));
    } catch {
      setError(t("ai.panel.error.copy"));
    }
  }

  async function requestSendCommand(command: string) {
    setError(null);
    const assessment = runtimeAvailable
      ? await aiCommandAssess(command).catch(() => assessCommandLocally(command))
      : assessCommandLocally(command);
    if (assessment.risk === "dangerous") {
      setPendingDangerousCommand(assessment);
      return;
    }
    await runSendCommand(command);
  }

  async function runSendCommand(command: string) {
    try {
      await onSendCommand(command);
      setNotice(t("ai.panel.notice.sent"));
    } catch (nextError) {
      setError(formatAiError(nextError));
    }
  }

  function appendContextBlocks(blocks: AiContextBlock[]) {
    if (blocks.length === 0) {
      return;
    }
    const hasSensitiveContext = blocks.some((block) => contextLooksSensitive(block.content));
    setContextBlocks((current) => {
      const next = [...current];
      blocks.forEach((block) => {
        if (
          next.some(
            (item) => item.kind === block.kind && item.source === block.source && item.content === block.content,
          )
        ) {
          return;
        }
        next.push({ ...block, id: `${block.id}-${Date.now().toString()}` });
      });
      return next;
    });
    setError(null);
    setNotice(
      hasSensitiveContext
        ? t("ai.panel.notice.contextSensitive")
        : t("ai.panel.notice.contextAdded"),
    );
  }

  function addRecentTerminalOutputContext() {
    const content = (recentTerminalOutput || "").trim();
    if (!content) {
      return;
    }
    appendContextBlocks([
      buildContextBlock({
        kind: "terminal_output",
        title: t("ai.context.recentOutput.title"),
        source: terminalTitle || t("ai.context.currentTerminal"),
        content: tailByChars(content, 8000),
      }),
    ]);
  }

  function addConnectionContext() {
    if (!connection) {
      return;
    }
    const lines = [
      t("ai.context.connection.name", { value: connection.name }),
      t("ai.context.connection.target", { value: `${connection.username}@${connection.host}:${connection.port.toString()}` }),
      connection.group ? t("ai.context.connection.group", { value: connection.group }) : null,
      connection.remote_os_name ? t("ai.context.connection.system", { value: connection.remote_os_name }) : null,
      terminalDirectory ? t("ai.context.connection.cwd", { value: terminalDirectory }) : null,
    ].filter(Boolean);
    appendContextBlocks([
      buildContextBlock({
        kind: "connection",
        title: t("ai.context.connection.title"),
        source: t("ai.context.connection.source"),
        content: lines.join("\n"),
      }),
    ]);
  }

  function addCommandDraftContext() {
    const content = commandDraft.trim();
    if (!content) {
      return;
    }
    appendContextBlocks([
      buildContextBlock({
        kind: "command_draft",
        title: t("ai.context.commandDraft"),
        source: "Command Sender",
        content,
      }),
    ]);
  }

  function addRecentCommandsContext() {
    const content = recentCommands
      .slice(0, 8)
      .map((entry, index) => `${(index + 1).toString()}. ${entry.command}`)
      .join("\n");
    if (!content.trim()) {
      return;
    }
    appendContextBlocks([
      buildContextBlock({
        kind: "recent_commands",
        title: t("ai.context.recentCommands"),
        source: t("ai.context.commandHistory"),
        content,
      }),
    ]);
  }

  return (
    <section className="ai-assistant-tool" aria-label="AI">
      <header className="ai-assistant-head">
        <div className="ai-assistant-title">
          <Bot className="ui-icon" aria-hidden="true" />
          <span>
            <strong>AI</strong>
            <small>{t("ai.panel.subtitle")}</small>
          </span>
        </div>
        <div className="ai-assistant-head-actions">
          <Tooltip label={t("ai.panel.newChat")}>
            <button type="button" aria-label={t("ai.panel.newChat")} onClick={startNewSession}>
              <Plus className="ui-icon" aria-hidden="true" />
            </button>
          </Tooltip>
          <Tooltip label={t("ai.panel.history")}>
            <button
              ref={historyTriggerRef}
              className={historyOpen ? "active" : ""}
              type="button"
              aria-label={t("ai.panel.history")}
              aria-expanded={historyOpen}
              aria-haspopup="menu"
              onClick={() => setHistoryOpen((open) => !open)}
            >
              <History className="ui-icon" aria-hidden="true" />
            </button>
          </Tooltip>
          <Tooltip label={t("ai.panel.settings")}>
            <button type="button" aria-label={t("ai.panel.settings")} onClick={onOpenSettings}>
              <Settings className="ui-icon" aria-hidden="true" />
            </button>
          </Tooltip>
        </div>
      </header>

      <AnchoredSurfacePortal
        align="end"
        anchorRef={historyTriggerRef}
        ariaLabel={t("ai.panel.historyAria")}
        className="ai-history-menu popover-content"
        desiredHeight={260}
        minHeight={96}
        open={historyOpen}
        role="menu"
        width={300}
        onOpenChange={setHistoryOpen}
      >
        <div className="ai-history-menu-header">
          <strong>{t("ai.panel.history")}</strong>
          <span>{t("ai.panel.historyCount", { count: sessions.length })}</span>
        </div>
        {sessions.length === 0 ? (
          <p className="ai-history-empty">{t("ai.panel.historyEmpty")}</p>
        ) : (
          <div className="ai-history-menu-list">
            {sessions.map((session) => (
              <div
                className={`ai-history-menu-item ${activeSessionId === session.id ? "active" : ""}`}
                key={session.id}
              >
                <button
                  className="ai-history-menu-item-main"
                  type="button"
                  role="menuitem"
                  onClick={() => void openSession(session.id)}
                >
                  <strong>{session.title}</strong>
                  <small>{session.last_message_preview || t("ai.panel.messageCount", { count: session.message_count })}</small>
                </button>
                <button
                  className="ai-history-menu-item-delete"
                  type="button"
                  aria-label={t("ai.panel.deleteSessionAria", { name: session.title })}
                  onClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    setHistoryOpen(false);
                    setPendingDeleteSession(session);
                  }}
                >
                  <Trash2 className="ui-icon" aria-hidden="true" />
                </button>
              </div>
            ))}
          </div>
        )}
      </AnchoredSurfacePortal>

      <div className="ai-provider-row">
        <AppSelect
          ariaLabel={t("ai.panel.configAria")}
          className="ai-provider-select"
          disabled={!providerConfigs.length || Boolean(streamState)}
          menuMinWidth={220}
          options={providerOptions}
          value={selectedProviderId}
          onChange={(value) => {
            setSelectedProviderId(value);
            window.localStorage.setItem(selectedProviderStorageKey, value);
          }}
        />
        <button className="ai-mini-button" type="button" onClick={() => void reloadProviderConfigs()}>
          <RefreshCw className="ui-icon" aria-hidden="true" />
          <span>{t("ai.panel.refresh")}</span>
        </button>
      </div>

      {!runtimeAvailable ? (
        <p className="ai-inline-notice">{t("ai.panel.desktopNotice")}</p>
      ) : null}
      {providerConfigs.length === 0 ? (
        <div className="ai-config-empty">
          <strong>{t("ai.panel.noConfig.title")}</strong>
          <span>{t("ai.panel.noConfig.description")}</span>
          <button className="primary-button" type="button" onClick={onOpenSettings}>
            <Settings className="ui-icon" aria-hidden="true" />
            <span>{t("ai.panel.noConfig.open")}</span>
          </button>
        </div>
      ) : null}

      <section className="ai-message-list" aria-label={t("ai.panel.chatAria")} ref={messageListRef}>
        {messages.length === 0 ? (
          <div className="ai-welcome">
            <Terminal className="ui-icon" aria-hidden="true" />
            <strong>{t("ai.panel.welcome.title")}</strong>
            <span>{t("ai.panel.welcome.description")}</span>
          </div>
        ) : (
          messages.map((message) => (
            <article className={`ai-message ${message.role}`} key={message.id}>
              <header>
                <strong>{message.role === "user" ? t("ai.panel.you") : "AI"}</strong>
                <span>{formatMessageStatus(message.status)}</span>
              </header>
              {message.contexts.length > 0 ? (
                <div className="ai-message-contexts">
                  {message.contexts.map((block) => (
                    <span key={block.id}>{block.title}</span>
                  ))}
                </div>
              ) : null}
              <div className="ai-message-content">
                {message.content ? renderMarkdownContent(message.content) : "..."}
              </div>
              {message.role === "assistant" ? renderCommandSuggestions(message) : null}
            </article>
          ))
        )}
      </section>

      <section className="ai-context-panel" aria-label={t("ai.panel.contextAria")}>
        <div className="ai-context-head">
          <strong>{t("ai.panel.context")}</strong>
          <span>{t("ai.panel.contextCount", { count: contextBlocks.length })}</span>
        </div>
        <div className="ai-context-actions">
          <button type="button" disabled={!recentTerminalOutput?.trim()} onClick={addRecentTerminalOutputContext}>
            <Terminal className="ui-icon" aria-hidden="true" />
            <span>{t("ai.panel.context.recentOutput")}</span>
          </button>
          <button type="button" disabled={!connection} onClick={addConnectionContext}>
            <ListPlus className="ui-icon" aria-hidden="true" />
            <span>{t("ai.panel.context.connection")}</span>
          </button>
          <button type="button" disabled={!commandDraft.trim()} onClick={addCommandDraftContext}>
            <CornerDownLeft className="ui-icon" aria-hidden="true" />
            <span>{t("ai.panel.context.draft")}</span>
          </button>
          <button type="button" disabled={recentCommands.length === 0} onClick={addRecentCommandsContext}>
            <Clock3 className="ui-icon" aria-hidden="true" />
            <span>{t("ai.panel.context.recentCommands")}</span>
          </button>
        </div>
        {contextBlocks.length > 0 ? (
          <div className="ai-context-list">
            {contextBlocks.map((block) => {
              const sensitive = contextLooksSensitive(block.content);
              return (
                <article className={`ai-context-chip ${sensitive ? "sensitive" : ""}`} key={block.id}>
                  <span>
                    <strong>{block.title}</strong>
                    <small>
                      {t("ai.panel.contextMeta", { source: block.source, lines: block.line_count, chars: block.char_count })}
                    </small>
                  </span>
                  <p>{truncateText(block.content, contextPreviewLimit)}</p>
                  {sensitive ? (
                    <small className="ai-context-warning">
                      <ShieldAlert className="ui-icon" aria-hidden="true" />
                      {t("ai.panel.contextSensitive")}
                    </small>
                  ) : null}
                  <button
                    type="button"
                    aria-label={t("ai.panel.removeContextAria", { name: block.title })}
                    onClick={() =>
                      setContextBlocks((blocks) => blocks.filter((item) => item.id !== block.id))
                    }
                  >
                    <X className="ui-icon" aria-hidden="true" />
                  </button>
                </article>
              );
            })}
          </div>
        ) : null}
      </section>

      {error ? <p className="ai-error" role="alert">{error}</p> : null}
      {notice ? <p className="ai-notice" role="status">{notice}</p> : null}

      <form className="ai-compose" onSubmit={(event) => void submit(event)}>
        <textarea
          value={input}
          placeholder={t("ai.panel.inputPlaceholder")}
          spellCheck={false}
          onChange={(event) => setInput(event.currentTarget.value)}
          onKeyDown={(event) => {
            if (event.nativeEvent.isComposing) {
              return;
            }
            if (
              event.key === "Enter" &&
              event.shiftKey &&
              !event.ctrlKey &&
              !event.metaKey &&
              !event.altKey
            ) {
              return;
            }
            if (keyboardEventMatchesShortcut(event.nativeEvent, sendShortcutBinding)) {
              event.preventDefault();
              void submit();
            }
          }}
        />
        <footer>
          <button
            className="ai-mini-button"
            type="button"
            disabled={!activeSessionId || Boolean(streamState)}
            onClick={() => setClearSessionOpen(true)}
          >
            <Trash2 className="ui-icon" aria-hidden="true" />
            <span>{t("ai.panel.clear")}</span>
          </button>
          <button
            className="ai-mini-button"
            type="button"
            disabled={!lastUserMessage || Boolean(streamState)}
            onClick={() => void retryLastUserMessage()}
          >
            <RefreshCw className="ui-icon" aria-hidden="true" />
            <span>{t("ai.panel.retry")}</span>
          </button>
          {streamState ? (
            <button className="ai-stop-button" type="button" onClick={() => void stopStreaming()}>
              <Square className="ui-icon" aria-hidden="true" />
              <span>{t("ai.panel.stop")}</span>
            </button>
          ) : (
            <button className="primary-button" type="submit" disabled={sendDisabled}>
              <Send className="ui-icon" aria-hidden="true" />
              <span>{loading ? t("ai.panel.preparing") : t("ai.panel.send")}</span>
            </button>
          )}
        </footer>
      </form>

      <ConfirmDialog
        open={Boolean(pendingDeleteSession)}
        title={t("ai.panel.delete.title")}
        description={t("ai.panel.delete.description", { name: pendingDeleteSession?.title || t("ai.panel.delete.fallback") })}
        confirmLabel={t("ai.panel.delete.confirm")}
        onConfirm={confirmDeleteSession}
        onOpenChange={(open) => {
          if (!open) {
            setPendingDeleteSession(null);
          }
        }}
      />
      <ConfirmDialog
        open={clearSessionOpen}
        title={t("ai.panel.clear.title")}
        description={t("ai.panel.clear.description")}
        confirmLabel={t("ai.panel.clear.confirm")}
        onConfirm={clearCurrentSession}
        onOpenChange={setClearSessionOpen}
      />
      <ConfirmDialog
        open={Boolean(pendingDangerousCommand)}
        title={t("ai.panel.danger.title")}
        description={
          pendingDangerousCommand
            ? pendingDangerousCommand.reasons.join(locale === "zh-CN" ? "；" : "; ") || t("ai.panel.danger.fallback")
            : t("ai.panel.danger.fallback")
        }
        confirmLabel={t("ai.panel.danger.confirm")}
        onConfirm={async () => {
          const command = pendingDangerousCommand?.command;
          setPendingDangerousCommand(null);
          if (command) {
            await runSendCommand(command);
          }
        }}
        onOpenChange={(open) => {
          if (!open) {
            setPendingDangerousCommand(null);
          }
        }}
      />
    </section>
  );

  function renderCommandSuggestions(message: AiChatMessage) {
    const suggestions = extractCommandSuggestions(message.content);
    if (suggestions.length === 0) {
      return null;
    }
    return (
      <div className="ai-command-suggestions">
        {suggestions.map((suggestion, index) => (
          <article
            className={`ai-command-card ${suggestion.risk === "dangerous" ? "danger" : ""}`}
            key={`${message.id}-${index.toString()}`}
          >
            <header>
              <strong>{t("ai.command.title")}</strong>
              {suggestion.risk === "dangerous" ? (
                <span>
                  <ShieldAlert className="ui-icon" aria-hidden="true" />
                  {t("ai.command.highRisk")}
                </span>
              ) : null}
            </header>
            <code>{suggestion.command}</code>
            {suggestion.reasons.length > 0 ? (
              <p>{suggestion.reasons.join(locale === "zh-CN" ? "；" : "; ")}</p>
            ) : null}
            <footer>
              <Tooltip label={t("ai.command.copy")}>
                <button type="button" aria-label={t("ai.command.copy")} onClick={() => void copyCommand(suggestion.command)}>
                  <Copy className="ui-icon" aria-hidden="true" />
                </button>
              </Tooltip>
              <Tooltip label={t("ai.command.insert")}>
                <button
                  type="button"
                  aria-label={t("ai.command.insert")}
                  onClick={() => {
                    onInsertCommand(suggestion.command);
                    setNotice(t("ai.command.notice.inserted"));
                  }}
                >
                  <CornerDownLeft className="ui-icon" aria-hidden="true" />
                </button>
              </Tooltip>
              <Tooltip label={t("ai.command.save")}>
                <button
                  type="button"
                  aria-label={t("ai.command.save")}
                  onClick={() => {
                    onSaveCommand(suggestion.command);
                    setNotice(t("ai.command.notice.save"));
                  }}
                >
                  <Save className="ui-icon" aria-hidden="true" />
                </button>
              </Tooltip>
              <Tooltip label={t("ai.command.send")}>
                <button
                  className="primary"
                  type="button"
                  aria-label={t("ai.command.send")}
                  onClick={() => void requestSendCommand(suggestion.command)}
                >
                  <Play className="ui-icon" aria-hidden="true" />
                </button>
              </Tooltip>
            </footer>
          </article>
        ))}
      </div>
    );
  }
}

function buildContextBlock({
  kind,
  title,
  source,
  content,
}: {
  kind: string;
  title: string;
  source: string;
  content: string;
}): AiContextBlock {
  const normalized = content.trim();
  return {
    id: `${kind}-${Date.now().toString()}`,
    kind,
    title,
    source,
    content: normalized,
    line_count: normalized.split(/\r?\n/).length,
    char_count: Array.from(normalized).length,
  };
}

type MarkdownBlock =
  | { type: "heading"; level: number; text: string }
  | { type: "paragraph"; lines: string[] }
  | { type: "unordered_list"; items: string[] }
  | { type: "ordered_list"; items: string[] }
  | { type: "code"; lang: string; lines: string[] };

type ShellFenceLineClassification =
  | { kind: "command"; command: string }
  | { kind: "skip" }
  | { kind: "output" };

const shellFenceLanguages = new Set([
  "sh",
  "shell",
  "bash",
  "zsh",
  "fish",
  "powershell",
  "ps1",
  "cmd",
  "bat",
]);

const knownShellCommands = new Set([
  "apt",
  "apt-cache",
  "apt-get",
  "awk",
  "bash",
  "brew",
  "cargo",
  "cat",
  "cd",
  "chmod",
  "chown",
  "clear",
  "cmake",
  "composer",
  "cp",
  "curl",
  "cut",
  "dd",
  "df",
  "dig",
  "dmesg",
  "docker",
  "du",
  "echo",
  "env",
  "export",
  "fdisk",
  "find",
  "firewall-cmd",
  "free",
  "git",
  "go",
  "grep",
  "halt",
  "head",
  "history",
  "hostname",
  "hostnamectl",
  "htop",
  "ifconfig",
  "ip",
  "iptables",
  "java",
  "journalctl",
  "jq",
  "kill",
  "killall",
  "kubectl",
  "last",
  "less",
  "ln",
  "ls",
  "lsof",
  "make",
  "mkdir",
  "mkfs",
  "mount",
  "mv",
  "mysql",
  "nc",
  "netstat",
  "nmap",
  "node",
  "npm",
  "openssl",
  "parted",
  "passwd",
  "ping",
  "pip",
  "pip3",
  "pnpm",
  "poweroff",
  "ps",
  "psql",
  "python",
  "python3",
  "reboot",
  "rm",
  "route",
  "rsync",
  "scp",
  "sed",
  "sensors",
  "service",
  "sh",
  "shutdown",
  "sort",
  "source",
  "ssh",
  "ssh-keygen",
  "sshpass",
  "ss",
  "sudo",
  "systemctl",
  "tail",
  "tar",
  "tee",
  "top",
  "touch",
  "traceroute",
  "ufw",
  "umount",
  "uname",
  "unzip",
  "uptime",
  "useradd",
  "userdel",
  "vim",
  "w",
  "watch",
  "wc",
  "wget",
  "who",
  "wipefs",
  "xargs",
  "yarn",
  "zsh",
]);

function renderMarkdownContent(content: string) {
  const blocks = parseMarkdownBlocks(content);
  return blocks.map((block, index) => {
    if (block.type === "heading") {
      return (
        <h4 className={`ai-md-heading level-${Math.min(block.level, 3).toString()}`} key={`h-${index.toString()}`}>
          {renderInlineMarkdown(block.text)}
        </h4>
      );
    }
    if (block.type === "unordered_list") {
      return (
        <ul className="ai-md-list" key={`ul-${index.toString()}`}>
          {block.items.map((item, itemIndex) => (
            <li key={`ul-${index.toString()}-${itemIndex.toString()}`}>{renderInlineMarkdown(item)}</li>
          ))}
        </ul>
      );
    }
    if (block.type === "ordered_list") {
      return (
        <ol className="ai-md-list ordered" key={`ol-${index.toString()}`}>
          {block.items.map((item, itemIndex) => (
            <li key={`ol-${index.toString()}-${itemIndex.toString()}`}>{renderInlineMarkdown(item)}</li>
          ))}
        </ol>
      );
    }
    if (block.type === "code") {
      return (
        <pre className="ai-md-codeblock" key={`code-${index.toString()}`}>
          <code>{block.lines.join("\n")}</code>
        </pre>
      );
    }
    return (
      <p className="ai-md-paragraph" key={`p-${index.toString()}`}>
        {renderInlineMarkdown(block.lines.join(" "))}
      </p>
    );
  });
}

function renderInlineMarkdown(text: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  let keyIndex = 0;
  let cursor = 0;

  function pushPlainSegment(segment: string) {
    let plainCursor = 0;
    while (plainCursor < segment.length) {
      const boldStart = segment.indexOf("**", plainCursor);
      if (boldStart === -1) {
        if (plainCursor < segment.length) {
          nodes.push(segment.slice(plainCursor));
        }
        return;
      }
      if (boldStart > plainCursor) {
        nodes.push(segment.slice(plainCursor, boldStart));
      }
      const boldEnd = segment.indexOf("**", boldStart + 2);
      if (boldEnd === -1) {
        nodes.push(segment.slice(boldStart));
        return;
      }
      const strongText = segment.slice(boldStart + 2, boldEnd);
      nodes.push(<strong key={`strong-${keyIndex.toString()}`}>{strongText}</strong>);
      keyIndex += 1;
      plainCursor = boldEnd + 2;
    }
  }

  while (cursor < text.length) {
    const codeStart = text.indexOf("`", cursor);
    if (codeStart === -1) {
      pushPlainSegment(text.slice(cursor));
      break;
    }
    if (codeStart > cursor) {
      pushPlainSegment(text.slice(cursor, codeStart));
    }
    const codeEnd = text.indexOf("`", codeStart + 1);
    if (codeEnd === -1) {
      pushPlainSegment(text.slice(codeStart));
      break;
    }
    const codeText = text.slice(codeStart + 1, codeEnd);
    nodes.push(
      <code className="ai-md-inline-code" key={`code-${keyIndex.toString()}`}>
        {codeText}
      </code>,
    );
    keyIndex += 1;
    cursor = codeEnd + 1;
  }

  return nodes.length > 0 ? nodes : [text];
}

function parseMarkdownBlocks(content: string): MarkdownBlock[] {
  const blocks: MarkdownBlock[] = [];
  const lines = content.replace(/\r/g, "").split("\n");
  let inFence = false;
  let fenceLang = "";
  let fenceLines: string[] = [];
  let paragraphLines: string[] = [];
  let listType: "unordered_list" | "ordered_list" | null = null;
  let listItems: string[] = [];

  function flushParagraph() {
    if (paragraphLines.length === 0) {
      return;
    }
    blocks.push({ lines: paragraphLines, type: "paragraph" });
    paragraphLines = [];
  }

  function flushList() {
    if (!listType || listItems.length === 0) {
      listType = null;
      listItems = [];
      return;
    }
    blocks.push({ items: listItems, type: listType });
    listType = null;
    listItems = [];
  }

  for (const rawLine of lines) {
    if (inFence) {
      if (rawLine.trim().startsWith("```")) {
        blocks.push({ lang: fenceLang, lines: fenceLines, type: "code" });
        inFence = false;
        fenceLang = "";
        fenceLines = [];
        continue;
      }
      fenceLines.push(rawLine);
      continue;
    }

    const trimmed = rawLine.trim();
    if (trimmed.startsWith("```")) {
      flushParagraph();
      flushList();
      inFence = true;
      fenceLang = trimmed.slice(3).trim().toLowerCase();
      fenceLines = [];
      continue;
    }
    if (!trimmed) {
      flushParagraph();
      flushList();
      continue;
    }

    const headingMatch = /^(#{1,6})\s+(.*)$/.exec(trimmed);
    if (headingMatch) {
      flushParagraph();
      flushList();
      blocks.push({
        level: headingMatch[1].length,
        text: headingMatch[2].trim(),
        type: "heading",
      });
      continue;
    }

    const unorderedMatch = /^[-*+]\s+(.*)$/.exec(trimmed);
    if (unorderedMatch) {
      flushParagraph();
      if (listType && listType !== "unordered_list") {
        flushList();
      }
      listType = "unordered_list";
      listItems.push(unorderedMatch[1].trim());
      continue;
    }

    const orderedMatch = /^\d+\.\s+(.*)$/.exec(trimmed);
    if (orderedMatch) {
      flushParagraph();
      if (listType && listType !== "ordered_list") {
        flushList();
      }
      listType = "ordered_list";
      listItems.push(orderedMatch[1].trim());
      continue;
    }

    if (listType && /^\s{2,}\S/.test(rawLine) && listItems.length > 0) {
      listItems[listItems.length - 1] = `${listItems[listItems.length - 1]} ${trimmed}`;
      continue;
    }

    flushList();
    paragraphLines.push(trimmed);
  }

  flushParagraph();
  flushList();
  if (inFence) {
    blocks.push({ lang: fenceLang, lines: fenceLines, type: "code" });
  }
  return blocks;
}

function extractCommandSuggestions(content: string): AiCommandSuggestion[] {
  const suggestions: AiCommandSuggestion[] = [];
  const seen = new Set<string>();
  for (const block of parseMarkdownBlocks(content)) {
    if (block.type === "code" && isShellFence(block.lang)) {
      for (const command of extractCommandsFromShellFence(block.lines)) {
        pushSuggestion(suggestions, seen, command);
      }
      continue;
    }
    if (block.type !== "code") {
      const sourceLines =
        block.type === "paragraph"
          ? block.lines
          : block.type === "heading"
            ? [block.text]
            : block.items;
      for (const line of sourceLines) {
        const command = extractCommandFromPlainLine(line);
        if (command) {
          pushSuggestion(suggestions, seen, command);
        }
      }
    }
  }
  return suggestions;
}

function pushSuggestion(
  suggestions: AiCommandSuggestion[],
  seen: Set<string>,
  command: string,
) {
  const normalized = command.trim();
  if (!normalized || seen.has(normalized) || normalized.length > 4000) {
    return;
  }
  const assessment = assessCommandLocally(normalized);
  seen.add(normalized);
  suggestions.push({
    command: normalized,
    risk: assessment.risk,
    reasons: assessment.reasons,
  });
}

function shellLikeCommand(line: string) {
  const normalized = normalizePotentialCommandLine(line);
  const first = normalized.split(/\s+/)[0]?.replace(/^[`"']|[`"']$/g, "") || "";
  const firstLower = first.toLowerCase();
  return knownShellCommands.has(firstLower) || firstLower.startsWith("mkfs.")
    ? normalized.replace(/^`|`$/g, "")
    : null;
}

function assessCommandLocally(command: string): AiCommandAssessment {
  const lower = command.toLowerCase();
  const reasons: string[] = [];
  if (/\brm\s+-[^\n\r]*r[^\n\r]*f/i.test(command)) {
    reasons.push(currentT("ai.command.reason.rm"));
  }
  if (/\b(?:mkfs|fdisk|parted|wipefs|shutdown|reboot|halt|poweroff)\b/i.test(command)) {
    reasons.push(currentT("ai.command.reason.system"));
  }
  if (/\bdd\b/i.test(command) && /\bof=/.test(command)) {
    reasons.push(currentT("ai.command.reason.dd"));
  }
  if (/\b(?:curl|wget)\b[^\n\r|]*\|\s*(?:sh|bash)\b/i.test(command)) {
    reasons.push(currentT("ai.command.reason.pipe"));
  }
  if (
    lower.includes("iptables") ||
    lower.includes("ufw") ||
    lower.includes("firewall-cmd") ||
    lower.includes("ip route") ||
    lower.includes("route ") ||
    lower.includes("systemctl restart") ||
    lower.includes("systemctl stop") ||
    (lower.includes("service ") && lower.includes(" stop"))
  ) {
    reasons.push(currentT("ai.command.reason.network"));
  }
  if (
    lower.includes("chmod -r 777") ||
    lower.includes("chown -r") ||
    lower.includes("userdel ") ||
    lower.includes("passwd ") ||
    (lower.includes("/etc/ssh") && (lower.includes(">") || lower.includes("tee ")))
  ) {
    reasons.push(currentT("ai.command.reason.permissions"));
  }
  if (containsSensitiveCommandText(lower)) {
    reasons.push(currentT("ai.command.reason.secret"));
  }
  return {
    command,
    risk: reasons.length ? "dangerous" : "safe",
    reasons,
  };
}

function isShellFence(lang: string) {
  return shellFenceLanguages.has(lang);
}

function extractCommandsFromShellFence(lines: string[]) {
  const commands: string[] = [];
  let sawOutputLikeLine = false;

  for (const rawLine of lines) {
    const classification = classifyShellFenceLine(rawLine);
    if (classification.kind === "command") {
      commands.push(classification.command);
    } else if (classification.kind === "output") {
      sawOutputLikeLine = true;
    }
  }

  if (commands.length === 0) {
    return [];
  }
  return sawOutputLikeLine ? commands : [commands.join("\n")];
}

function classifyShellFenceLine(line: string): ShellFenceLineClassification {
  const trimmed = line.trim();
  if (!trimmed || trimmed === "\\" || trimmed.startsWith("#")) {
    return { kind: "skip" };
  }
  if (isPromptOnlyLine(trimmed)) {
    return { kind: "output" };
  }
  const normalized = normalizePotentialCommandLine(trimmed);
  if (!normalized) {
    return { kind: "skip" };
  }
  if (looksLikeTerminalNoise(trimmed) || looksLikeTerminalNoise(normalized)) {
    return { kind: "output" };
  }
  const command = shellLikeCommand(normalized);
  if (!command) {
    return { kind: "output" };
  }
  return { command, kind: "command" };
}

function extractCommandFromPlainLine(line: string) {
  const trimmed = line.trim();
  if (!trimmed) {
    return null;
  }

  const inlineCodeCommand = extractStandaloneInlineCodeCommand(trimmed);
  if (inlineCodeCommand) {
    return inlineCodeCommand;
  }
  const markdownListCommand = extractMarkdownListCommand(trimmed);
  if (markdownListCommand) {
    return markdownListCommand;
  }
  if (isMarkdownStructuralLine(trimmed) || looksLikeTerminalNoise(trimmed)) {
    return null;
  }

  const normalized = normalizePotentialCommandLine(trimmed);
  if (!normalized || isPromptOnlyLine(trimmed) || isPromptOnlyLine(normalized)) {
    return null;
  }
  if (hasCjkCharacters(normalized) && !shellLikeCommand(normalized)) {
    return null;
  }
  if (/[：]/.test(normalized) || /^\S.*:\s*$/.test(normalized)) {
    return null;
  }
  if (looksLikeTerminalNoise(normalized)) {
    return null;
  }
  return shellLikeCommand(normalized);
}

function extractStandaloneInlineCodeCommand(line: string) {
  const match = /^(?:[-*+]\s+|\d+\.\s+)?`([^`]+)`\s*$/.exec(line);
  if (!match) {
    return null;
  }
  return shellLikeCommand(match[1].trim());
}

function extractMarkdownListCommand(line: string) {
  const match = /^(?:[-*+]\s+|\d+\.\s+)(.+)$/.exec(line);
  if (!match) {
    return null;
  }
  return shellLikeCommand(match[1].trim());
}

function normalizePotentialCommandLine(line: string) {
  let normalized = line.trim().replace(/^`|`$/g, "");
  let previous = "";
  while (normalized && normalized !== previous) {
    previous = normalized;
    normalized = normalized
      .replace(/^(?:\$|#|>)\s+/, "")
      .replace(/^PS [^>]+>\s*/i, "")
      .replace(/^\[[^\]]+\][#$]\s*/, "")
      .replace(/^[A-Za-z0-9_.-]+@[A-Za-z0-9_.-]+(?::[^\s#$>]+)?[#$>]\s*/, "")
      .trim();
  }
  return normalized;
}

function isMarkdownStructuralLine(line: string) {
  return (
    /^(?:#{1,6}\s+|>\s+|[-*+]\s+|\d+\.\s+)/.test(line) ||
    /^[-*_]{3,}$/.test(line) ||
    /^\|.*\|$/.test(line)
  );
}

function isPromptOnlyLine(line: string) {
  return (
    /^(?:PS [^>]+>|[A-Za-z0-9_.-]+@[A-Za-z0-9_.-]+(?::[^\s#$>]+)?[#$>])\s*$/i.test(line) ||
    /^\[[^\]]+\][#$]\s*$/i.test(line) ||
    /^(?:\$|#)\s*$/.test(line)
  );
}

function looksLikeTerminalNoise(line: string) {
  const normalized = line.trim();
  if (!normalized) {
    return false;
  }
  const compact = normalized.replace(/\s+/g, "");
  if (/^[\\/_|()[\]{}<>+=*-]{6,}$/.test(compact)) {
    return true;
  }
  return [
    /^welcome to\b/i,
    /^last login:/i,
    /^last check:/i,
    /^system load:/i,
    /^memory usage:/i,
    /^swap usage:/i,
    /^usage of \//i,
    /^ipv4 address for /i,
    /^\[\s*\d+[^\]]*updates?[^\]]*\]$/i,
    /^\[[^\]]*configuration[^\]]*\]$/i,
    /^\[[^\]]*beta[^\]]*\]$/i,
    /^\s*[_/\\|]{3,}/,
  ].some((pattern) => pattern.test(normalized));
}

function hasCjkCharacters(text: string) {
  return /[\u3400-\u9fff]/.test(text);
}

function containsSensitiveCommandText(lowerCommand: string) {
  return [
    "authorization: bearer",
    "api_key=",
    "apikey=",
    "access_token=",
    "auth_token=",
    "secret_access_key",
    "client_secret",
    "private_key",
    "--password",
    "password=",
    "passwd=",
    "sshpass -p",
    "-----begin",
  ].some((pattern) => lowerCommand.includes(pattern));
}

function contextLooksSensitive(content: string) {
  const lower = content.toLowerCase();
  return (
    containsSensitiveCommandText(lower) ||
    /\b(?:password|passwd|token|secret|access[_-]?key|api[_-]?key|authorization|x-api-key)\b\s*[:=]\s*\S+/i.test(
      content,
    ) ||
    /-----begin [a-z0-9 ]*private key-----/i.test(content) ||
    /\bsk-[a-z0-9_-]{12,}/i.test(content)
  );
}

function formatMessageStatus(status: string) {
  if (status === "streaming") {
    return currentT("ai.status.streaming");
  }
  if (status === "complete") {
    return currentT("ai.status.complete");
  }
  if (status === "stopped") {
    return currentT("ai.status.stopped");
  }
  if (status === "error") {
    return currentT("ai.status.error");
  }
  return status || currentT("ai.status.complete");
}

function tailByChars(content: string, maxChars: number) {
  const chars = Array.from(content);
  return chars.length <= maxChars ? content : chars.slice(chars.length - maxChars).join("");
}

function truncateText(content: string, maxChars: number) {
  const chars = Array.from(content);
  return chars.length <= maxChars ? content : `${chars.slice(0, maxChars).join("")}...`;
}

function formatAiError(error: unknown) {
  if (typeof error === "object" && error && "message" in error) {
    return String((error as { message?: unknown }).message || currentT("ai.error.generic"));
  }
  return error instanceof Error ? error.message : currentT("ai.error.generic");
}
