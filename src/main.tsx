import ReactDOM from "react-dom/client";
import { applyStartupTheme, readStartupSettings } from "./features/settings/startupSettings";
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

void bootstrap().catch((error: unknown) => {
  console.error(error);
  void showCurrentWindow();
});
