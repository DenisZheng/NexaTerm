import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

// 前端单元/组件测试配置。
// 与 vite.config.ts 分离：后者是 async 函数且承载 Tauri dev server 端口/HMR 等运行时配置，测试不需要也不应继承。
export default defineConfig({
  plugins: [react()],
  test: {
    include: ["src/**/*.test.{ts,tsx}"],
    // 默认 node 环境；需要 DOM 的组件测试在文件首行用 `// @vitest-environment jsdom` 显式声明，
    // 纯逻辑测试不背 jsdom 的启动成本，DOM 依赖也在文件头一眼可见。
    environment: "node",
    clearMocks: true,
    // 没有匹配到任何测试文件时必须失败：门禁不能因为测试被误删而静默退化回 no-op。
    passWithNoTests: false,
  },
});
