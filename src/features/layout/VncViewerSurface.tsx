import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import type RFB from "@novnc/novnc";
import { Clipboard, KeyRound } from "lucide-react";

import { t as tr, useI18n } from "../../shared/i18n";
import type {
  VncConnectionConfig,
  VncLaunchResult,
  VncRunnerWindowConnectionInfo,
} from "../connections/connectionTypes";
import { resolveVncPerformanceLevels } from "../connections/connectionTypes";

export interface VncViewerSurfaceProps {
  active: boolean;
  className?: string;
  config: VncConnectionConfig;
  connection: VncRunnerWindowConnectionInfo | null;
  result: VncLaunchResult;
  onError: (message: string) => void;
  onMessage: (message: string) => void;
}

export function VncViewerSurface({
  active,
  className,
  config,
  connection,
  result,
  onError,
  onMessage,
}: VncViewerSurfaceProps) {
  useI18n();
  const mountRef = useRef<HTMLDivElement | null>(null);
  const rfbRef = useRef<RFB | null>(null);
  const onErrorRef = useRef(onError);
  const onMessageRef = useRef(onMessage);
  const [connected, setConnected] = useState(false);
  const [desktopName, setDesktopName] = useState("");
  const [passwordRequired, setPasswordRequired] = useState(false);
  const [passwordDraft, setPasswordDraft] = useState("");
  const [clipboardDraft, setClipboardDraft] = useState("");

  useEffect(() => {
    onErrorRef.current = onError;
  }, [onError]);

  useEffect(() => {
    onMessageRef.current = onMessage;
  }, [onMessage]);

  useEffect(() => {
    const mount = mountRef.current;
    const websocketUrl = result.websocket_url;
    if (!mount || !websocketUrl) {
      return undefined;
    }
    const mountElement = mount;
    const viewerWebsocketUrl = websocketUrl;

    mountElement.replaceChildren();
    setConnected(false);
    setDesktopName("");
    setPasswordRequired(false);
    setPasswordDraft("");

    const credentials =
      result.password || connection?.username
        ? {
            password: result.password || undefined,
            username: connection?.username || undefined,
          }
        : undefined;
    let disposed = false;
    let rfb: RFB | null = null;
    let connectedOnce = false;
    let credentialsRequested = false;
    let failureReported = false;

    const handleConnect = () => {
      connectedOnce = true;
      setConnected(true);
      setPasswordRequired(false);
      setPasswordDraft("");
      onMessageRef.current(tr("vnc.viewer.message.connected"));
    };
    const handleDisconnect = (event: CustomEvent<{ clean: boolean }>) => {
      setConnected(false);
      setPasswordRequired(false);
      if (!connectedOnce) {
        if (!failureReported) {
          failureReported = true;
          onErrorRef.current(vncPreConnectDisconnectMessage(connection, credentialsRequested));
        }
        return;
      }
      onMessageRef.current(event.detail.clean ? tr("vnc.viewer.message.disconnected") : tr("vnc.viewer.message.interrupted"));
    };
    const handleCredentialsRequired = () => {
      credentialsRequested = true;
      if (result.password) {
        rfb?.sendCredentials({
          password: result.password,
          username: connection?.username || undefined,
        });
        return;
      }
      setPasswordRequired(true);
      onMessageRef.current(tr("vnc.viewer.message.passwordRequired"));
    };
    const handleSecurityFailure = (event: CustomEvent<{ reason: string; status: number }>) => {
      failureReported = true;
      onErrorRef.current(event.detail.reason || tr("vnc.viewer.error.security", { status: event.detail.status }));
    };
    const handleDesktopName = (event: CustomEvent<{ name: string }>) => {
      setDesktopName(event.detail.name || "");
    };

    async function connectVncViewer() {
      try {
        const module = await import("@novnc/novnc");
        if (disposed) {
          return undefined;
        }
        const nextRfb = new module.default(mountElement, viewerWebsocketUrl, {
          credentials,
          shared: config.input.shared,
        });
        rfb = nextRfb;
        rfbRef.current = nextRfb;
        applyVncRfbSettings(nextRfb, config);
        const cleanupWheelForwarding = installVncWheelForwarding(mountElement);
        nextRfb.addEventListener("connect", handleConnect);
        nextRfb.addEventListener("disconnect", handleDisconnect);
        nextRfb.addEventListener("credentialsrequired", handleCredentialsRequired);
        nextRfb.addEventListener("securityfailure", handleSecurityFailure);
        nextRfb.addEventListener("desktopname", handleDesktopName);
        nextRfb.focus();
        return cleanupWheelForwarding;
      } catch (error) {
        if (!disposed) {
          onErrorRef.current(tr("vnc.viewer.error.load", { message: formatError(error) }));
        }
        return undefined;
      }
    }

    let cleanupWheelForwarding: (() => void) | undefined;
    void connectVncViewer().then((cleanup) => {
      cleanupWheelForwarding = cleanup;
    });

    return () => {
      disposed = true;
      cleanupWheelForwarding?.();
      if (rfb) {
        rfb.removeEventListener("connect", handleConnect);
        rfb.removeEventListener("disconnect", handleDisconnect as EventListener);
        rfb.removeEventListener("credentialsrequired", handleCredentialsRequired);
        rfb.removeEventListener("securityfailure", handleSecurityFailure as EventListener);
        rfb.removeEventListener("desktopname", handleDesktopName as EventListener);
        rfb.disconnect();
      }
      if (!rfb || rfbRef.current === rfb) {
        rfbRef.current = null;
      }
      mountElement.replaceChildren();
    };
  }, [
    config,
    connection?.host,
    connection?.port,
    connection?.username,
    result.password,
    result.session_id,
    result.websocket_url,
  ]);

  useEffect(() => {
    if (rfbRef.current) {
      applyVncRfbSettings(rfbRef.current, config);
    }
  }, [config]);

  useEffect(() => {
    if (active && connected) {
      rfbRef.current?.focus();
    }
  }, [active, connected]);

  function submitPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const password = passwordDraft;
    if (!password) {
      return;
    }
    rfbRef.current?.sendCredentials({
      password,
      username: connection?.username || undefined,
    });
    setPasswordDraft("");
    setPasswordRequired(false);
  }

  function sendCtrlAltDel() {
    rfbRef.current?.sendCtrlAltDel();
    rfbRef.current?.focus();
  }

  function pasteClipboard() {
    if (!clipboardDraft) {
      return;
    }
    rfbRef.current?.clipboardPasteFrom(clipboardDraft);
    rfbRef.current?.focus();
  }

  return (
    <div
      className={`vnc-viewer-shell ${className || ""}`}
      data-connected={connected ? "true" : "false"}
      data-scale-mode={config.display.scale_mode}
    >
      <div className="vnc-viewer-toolbar">
        <span>
          {connected ? tr("vnc.viewer.connected") : tr("vnc.viewer.connecting")}
          {desktopName ? ` · ${desktopName}` : ""}
        </span>
        <div>
          {config.input.clipboard ? (
            <>
              <input
                aria-label={tr("vnc.viewer.clipboardAria")}
                value={clipboardDraft}
                onChange={(event) => setClipboardDraft(event.target.value)}
                placeholder={tr("vnc.viewer.clipboardPlaceholder")}
              />
              <button type="button" disabled={!clipboardDraft} onClick={pasteClipboard}>
                <Clipboard className="ui-icon" aria-hidden="true" />
                <span>{tr("vnc.viewer.paste")}</span>
              </button>
            </>
          ) : null}
          <button type="button" disabled={!connected || config.input.view_only} onClick={sendCtrlAltDel}>
            <KeyRound className="ui-icon" aria-hidden="true" />
            <span>Ctrl+Alt+Del</span>
          </button>
        </div>
      </div>
      <div className="vnc-viewer-mount" ref={mountRef} />
      {passwordRequired ? (
        <form className="vnc-password-prompt" onSubmit={submitPassword}>
          <span>{tr("vnc.viewer.password")}</span>
          <input
            autoFocus
            aria-label={tr("vnc.viewer.password")}
            type="password"
            value={passwordDraft}
            onChange={(event) => setPasswordDraft(event.target.value)}
          />
          <button type="submit" disabled={!passwordDraft}>
            <KeyRound className="ui-icon" aria-hidden="true" />
            <span>{tr("vnc.viewer.send")}</span>
          </button>
        </form>
      ) : null}
    </div>
  );
}

function vncTargetLabel(connection: VncRunnerWindowConnectionInfo | null) {
  if (!connection?.host) {
    return tr("vnc.viewer.target");
  }
  return `${connection.host}:${(connection.port || 5900).toString()}`;
}

function vncPreConnectDisconnectMessage(
  connection: VncRunnerWindowConnectionInfo | null,
  credentialsRequested: boolean,
) {
  const target = vncTargetLabel(connection);
  if (credentialsRequested) {
    return tr("vnc.viewer.error.authDisconnect", { target });
  }
  return tr("vnc.viewer.error.connect", { target });
}

function applyVncRfbSettings(rfb: RFB, config: VncConnectionConfig) {
  const { compressionLevel, qualityLevel } = resolveVncPerformanceLevels(config);

  rfb.viewOnly = config.input.view_only;
  rfb.focusOnClick = true;
  rfb.clipViewport = config.display.clip_viewport;
  rfb.dragViewport = false;
  rfb.scaleViewport = config.display.scale_mode !== "actual";
  rfb.resizeSession = config.display.resize_session;
  rfb.showDotCursor = true;
  rfb.qualityLevel = qualityLevel;
  rfb.compressionLevel = compressionLevel;
}

const VNC_WHEEL_STEP_PX = 50;
const VNC_WHEEL_LINE_HEIGHT_PX = 19;
const VNC_WHEEL_SPEED_FACTOR = 2.5;
const VNC_MAX_WHEEL_PULSES_PER_EVENT = 4;

function installVncWheelForwarding(mountElement: HTMLElement) {
  const forwardedEvents = new WeakSet<WheelEvent>();
  const accumulatedDelta = {
    x: 0,
    y: 0,
  };

  const handleWheel = (event: WheelEvent) => {
    if (forwardedEvents.has(event)) {
      return;
    }

    const canvas = mountElement.querySelector("canvas");
    if (!canvas) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();

    const rect = canvas.getBoundingClientRect();
    const clamp = (value: number, min: number, max: number) =>
      Math.min(max, Math.max(min, value));
    const clientX = clamp(event.clientX, rect.left, Math.max(rect.left, rect.right - 1));
    const clientY = clamp(event.clientY, rect.top, Math.max(rect.top, rect.bottom - 1));
    const normalizedDeltaX = normalizeWheelDelta(event.deltaX, event.deltaMode);
    const normalizedDeltaY = normalizeWheelDelta(event.deltaY, event.deltaMode);
    const xPulses = consumeVncWheelPulses(
      accumulatedDelta,
      "x",
      normalizedDeltaX * VNC_WHEEL_SPEED_FACTOR,
    );
    const yPulses = consumeVncWheelPulses(
      accumulatedDelta,
      "y",
      normalizedDeltaY * VNC_WHEEL_SPEED_FACTOR,
    );

    dispatchVncWheelPulses({
      canvas,
      clientX,
      clientY,
      event,
      forwardedEvents,
      pulses: xPulses,
      xAxis: true,
    });
    dispatchVncWheelPulses({
      canvas,
      clientX,
      clientY,
      event,
      forwardedEvents,
      pulses: yPulses,
      xAxis: false,
    });
  };

  mountElement.addEventListener("wheel", handleWheel, {
    capture: true,
    passive: false,
  });
  return () => {
    mountElement.removeEventListener("wheel", handleWheel, true);
  };
}

function normalizeWheelDelta(value: number, deltaMode: number) {
  if (!Number.isFinite(value) || value === 0) {
    return 0;
  }
  if (deltaMode === WheelEvent.DOM_DELTA_LINE) {
    return value * VNC_WHEEL_LINE_HEIGHT_PX;
  }
  if (deltaMode === WheelEvent.DOM_DELTA_PAGE) {
    return value * VNC_WHEEL_STEP_PX * 4;
  }
  return value;
}

function consumeVncWheelPulses(
  accumulatedDelta: { x: number; y: number },
  axis: "x" | "y",
  delta: number,
) {
  if (delta === 0) {
    return 0;
  }

  accumulatedDelta[axis] += delta;
  const direction = Math.sign(accumulatedDelta[axis]);
  const availablePulses = Math.floor(Math.abs(accumulatedDelta[axis]) / VNC_WHEEL_STEP_PX);
  if (availablePulses === 0) {
    return 0;
  }

  const pulses = Math.min(availablePulses, VNC_MAX_WHEEL_PULSES_PER_EVENT);
  if (availablePulses > pulses) {
    accumulatedDelta[axis] = 0;
    return pulses * direction;
  }

  accumulatedDelta[axis] -= pulses * VNC_WHEEL_STEP_PX * direction;
  return pulses * direction;
}

function dispatchVncWheelPulses({
  canvas,
  clientX,
  clientY,
  event,
  forwardedEvents,
  pulses,
  xAxis,
}: {
  canvas: HTMLCanvasElement;
  clientX: number;
  clientY: number;
  event: WheelEvent;
  forwardedEvents: WeakSet<WheelEvent>;
  pulses: number;
  xAxis: boolean;
}) {
  const pulseCount = Math.abs(pulses);
  if (pulseCount === 0) {
    return;
  }
  const direction = Math.sign(pulses);

  for (let index = 0; index < pulseCount; index += 1) {
    const forwarded = new WheelEvent("wheel", {
      bubbles: true,
      cancelable: true,
      altKey: event.altKey,
      button: event.button,
      buttons: event.buttons,
      clientX,
      clientY,
      ctrlKey: event.ctrlKey,
      deltaMode: WheelEvent.DOM_DELTA_PIXEL,
      deltaX: xAxis ? VNC_WHEEL_STEP_PX * direction : 0,
      deltaY: xAxis ? 0 : VNC_WHEEL_STEP_PX * direction,
      deltaZ: 0,
      metaKey: event.metaKey,
      screenX: event.screenX,
      screenY: event.screenY,
      shiftKey: event.shiftKey,
      view: window,
    });
    forwardedEvents.add(forwarded);
    canvas.dispatchEvent(forwarded);
  }
}

function formatError(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}
