import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";

// @ts-expect-error process is a nodejs global
const host = process.env.TAURI_DEV_HOST;
// @ts-expect-error process is a nodejs global
const imeSmokeEnabled = process.env.VITE_NEXATERM_IME_SMOKE === "1";

function imeSmokeCapturePlugin(): Plugin | null {
  if (!imeSmokeEnabled) {
    return null;
  }
  const events: unknown[] = [];
  return {
    name: "nexaterm-ime-smoke-capture",
    configureServer(server) {
      server.middlewares.use("/__nexaterm_ime_capture", (request, response, next) => {
        if (request.method === "GET") {
          response.setHeader("content-type", "application/json; charset=utf-8");
          response.end(JSON.stringify(events));
          return;
        }
        if (request.method === "DELETE") {
          events.length = 0;
          response.statusCode = 204;
          response.end();
          return;
        }
        if (request.method !== "POST") {
          next();
          return;
        }
        const chunks: Buffer[] = [];
        request.on("data", (chunk: Buffer) => chunks.push(chunk));
        request.on("end", () => {
          try {
            events.push(JSON.parse(Buffer.concat(chunks).toString("utf8")));
            response.statusCode = 204;
            response.end();
          } catch {
            response.statusCode = 400;
            response.end("invalid json");
          }
        });
      });
    },
  };
}

// https://vite.dev/config/
export default defineConfig(async () => ({
  plugins: [react(), imeSmokeCapturePlugin()].filter(Boolean) as Plugin[],

  // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
  //
  // 1. prevent Vite from obscuring rust errors
  clearScreen: false,
  // 2. tauri expects a fixed port, fail if that port is not available
  server: {
    port: 5520,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 5521,
        }
      : undefined,
    watch: {
      // 3. tell Vite to ignore watching `src-tauri`
      ignored: ["**/src-tauri/**"],
    },
  },
}));
