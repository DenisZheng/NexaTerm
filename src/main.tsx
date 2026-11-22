import ReactDOM from "react-dom/client";
import { applyDocumentAppearance, readStartupSettings } from "./features/settings/startupSettings";
import { syncCurrentWindowTheme } from "./shared/tauri/windowTheme";
import { setLocalePreference } from "./shared/i18n";
import { restoreCurrentWindowState, showCurrentWindow } from "./shared/tauri/windowState";

const startupWindowRestoreTimeoutMs = 1600;

async function bootstrap() {
  const legacyProbeToken = (window as Window & {
    __NEXATERM_LEGACY_SETTINGS_PROBE_TOKEN__?: string;
  }).__NEXATERM_LEGACY_SETTINGS_PROBE_TOKEN__;
  if (legacyProbeToken) {
    const { default: App } = await import("./App");
    ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
      <App />,
    );
    return;
  }

  const startupSettings = readStartupSettings();
  applyDocumentAppearance(startupSettings);
  const appearanceReady = syncCurrentWindowTheme(startupSettings.appearance.themeMode);
  setLocalePreference(startupSettings.basic.locale);

  const windowStateReady = Promise.race([
    restoreCurrentWindowState(),
    new Promise((resolve) => {
      window.setTimeout(resolve, startupWindowRestoreTimeoutMs);
    }),
  ]);
  const appReady = import("./App");

  const [, { default: App }] = await Promise.all([windowStateReady, appReady, appearanceReady]);
  ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
    <App />,
  );

  window.requestAnimationFrame(() => {
    void showCurrentWindow();
  });
}

if (import.meta.env.VITE_NEXATERM_IME_SMOKE === "1") {
  // Register diagnostics before importing the harness, so an import/startup
  // failure is reported as such instead of a misleading network timeout.
  const report = (kind: string, data: string) => {
    void fetch("/__nexaterm_ime_capture", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ kind, data }),
    }).catch(() => {});
  };
  window.addEventListener("error", (event) => report("page-error", event.message));
  window.addEventListener("unhandledrejection", (event) =>
    report("unhandled-rejection", String(event.reason)),
  );
  document.addEventListener("securitypolicyviolation", (event) =>
    report("csp-error", `${event.violatedDirective}: ${event.blockedURI}`),
  );
  report("bootstrap", document.readyState);
  void import("./features/terminal/linuxImeSmoke")
    .then(({ mountLinuxImeSmoke }) => mountLinuxImeSmoke())
    .catch((error: unknown) => {
      report("bootstrap-error", error instanceof Error ? error.stack || error.message : String(error));
      console.error(error);
    });
} else {
  void bootstrap().catch((error: unknown) => {
    console.error(error);
    void showCurrentWindow();
  });
}
