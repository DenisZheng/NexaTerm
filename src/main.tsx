import ReactDOM from "react-dom/client";
import { applyStartupTheme, readStartupSettings } from "./features/settings/startupSettings";
import { setLocalePreference } from "./shared/i18n";
import { restoreCurrentWindowState, showCurrentWindow } from "./shared/tauri/windowState";

const startupWindowRestoreTimeoutMs = 1600;

async function bootstrap() {
  const startupSettings = readStartupSettings();
  applyStartupTheme(startupSettings);
  setLocalePreference(startupSettings.basic.locale);

  const windowStateReady = Promise.race([
    restoreCurrentWindowState(),
    new Promise((resolve) => {
      window.setTimeout(resolve, startupWindowRestoreTimeoutMs);
    }),
  ]);
  const appReady = import("./App");

  const [, { default: App }] = await Promise.all([windowStateReady, appReady]);
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
