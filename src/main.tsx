import ReactDOM from "react-dom/client";
import { applyStartupTheme, readStartupSettings } from "./features/settings/startupSettings";
import { restoreCurrentWindowState, showCurrentWindow } from "./shared/tauri/windowState";

const startupWindowRestoreTimeoutMs = 1600;

async function bootstrap() {
  applyStartupTheme(readStartupSettings());

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
  void import("./features/terminal/linuxImeSmoke")
    .then(({ mountLinuxImeSmoke }) => mountLinuxImeSmoke())
    .catch((error: unknown) => console.error(error));
} else {
  void bootstrap().catch((error: unknown) => {
    console.error(error);
    void showCurrentWindow();
  });
}
