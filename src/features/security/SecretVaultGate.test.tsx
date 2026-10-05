// @vitest-environment jsdom
import { StrictMode } from "react";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { getLocale, setLocalePreference, type Locale } from "../../shared/i18n";
import { SecretVaultGate } from "./SecretVaultGate";
import { useSecretVault } from "./useSecretVault";
import { secretVaultStatus, secretVaultUnlock, secretVaultUnlockLocal } from "../../shared/tauri/commands";

vi.mock("../../shared/tauri/runtime", () => ({ hasTauriRuntime: () => true }));
vi.mock("../../shared/tauri/commands", () => ({
  secretVaultStatus: vi.fn(),
  secretVaultUnlock: vi.fn(),
  secretVaultUnlockLocal: vi.fn(),
  secretVaultLock: vi.fn(),
  secretVaultEnableMasterPassword: vi.fn(),
  secretVaultDisableMasterPassword: vi.fn(),
}));

const locked = { initialized: true, unlocked: false };
const unlocked = { initialized: true, unlocked: true };
const keychainError = { code: "vault_local_keychain_unavailable", message: "系统凭据存储当前不可用，无法自动解锁保险库。" };

function VaultHarness({ masterPasswordEnabled = false }: { masterPasswordEnabled?: boolean }) {
  const vault = useSecretVault({ autoLockMinutes: 0, masterPasswordEnabled });
  return <>
    <output>{vault.ready ? "凭据可用" : "凭据不可用"}</output>
    {vault.requiresUnlock && <SecretVaultGate
      error={vault.error}
      loading={vault.loading}
      masterPasswordEnabled={masterPasswordEnabled}
      onRetry={vault.retry}
      onUnlock={vault.unlock}
      status={vault.status}
      unlocking={vault.unlocking}
    />}
  </>;
}

let previousLocale: Locale;

beforeEach(() => {
  previousLocale = getLocale();
  setLocalePreference("zh-CN");
  vi.resetAllMocks();
  vi.mocked(secretVaultStatus).mockResolvedValue(locked);
  vi.mocked(secretVaultUnlockLocal).mockRejectedValue(keychainError);
  vi.mocked(secretVaultUnlock).mockResolvedValue(unlocked);
});
afterEach(() => {
  cleanup();
  setLocalePreference(previousLocale);
});

describe("保险库启动与恢复", () => {
  it("已有保险库自动解锁失败只提供重试，不要求创建安全密码", async () => {
    render(<VaultHarness />);
    await screen.findByText(keychainError.message);
    expect(screen.queryByText("创建加密保险库")).toBeNull();
    expect(screen.queryByLabelText("安全密码")).toBeNull();
    expect(screen.getByRole("button", { name: "重试自动解锁" })).toBeTruthy();
    expect(screen.getByText("凭据不可用")).toBeTruthy();
    expect(secretVaultStatus).toHaveBeenCalledTimes(1);
    expect(secretVaultUnlockLocal).toHaveBeenCalledTimes(1);
    expect(secretVaultUnlock).not.toHaveBeenCalled();
  });

  it("首次本机初始化失败也不能切换为设置安全密码", async () => {
    vi.mocked(secretVaultStatus).mockResolvedValue({ initialized: false, unlocked: false });
    render(<VaultHarness />);
    await screen.findByRole("button", { name: "重试自动解锁" });
    expect(screen.queryByText("创建加密保险库")).toBeNull();
    expect(screen.queryByLabelText("安全密码")).toBeNull();
  });

  it("状态读取失败保持未知，不尝试创建或解锁；显式重试可恢复", async () => {
    vi.mocked(secretVaultStatus).mockRejectedValueOnce({ message: "状态读取失败" });
    render(<VaultHarness />);
    await screen.findByText("状态读取失败");
    expect(secretVaultUnlockLocal).not.toHaveBeenCalled();
    vi.mocked(secretVaultUnlockLocal).mockResolvedValueOnce(unlocked);
    fireEvent.click(screen.getByRole("button", { name: "重试自动解锁" }));
    await screen.findByText("凭据可用");
    expect(secretVaultUnlockLocal).toHaveBeenCalledTimes(1);
  });

  it("手动重试期间保持阻塞界面且不可重复提交，成功后才开放凭据", async () => {
    render(<VaultHarness />);
    const button = await screen.findByRole("button", { name: "重试自动解锁" });
    let complete!: (status: typeof unlocked) => void;
    vi.mocked(secretVaultUnlockLocal).mockImplementationOnce(() => new Promise((resolve) => { complete = resolve; }));
    fireEvent.click(button);
    await waitFor(() => expect(secretVaultUnlockLocal).toHaveBeenCalledTimes(2));
    expect((screen.getByRole("button", { name: "重试自动解锁" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(button);
    expect(secretVaultUnlockLocal).toHaveBeenCalledTimes(2);
    expect(screen.getByText("凭据不可用")).toBeTruthy();
    await act(async () => complete(unlocked));
    expect(screen.getByText("凭据可用")).toBeTruthy();
    expect(screen.queryByRole("form")).toBeNull();
    expect(secretVaultUnlock).not.toHaveBeenCalled();
  });

  it("重试失败保持错误且不进入自动重试循环", async () => {
    render(<VaultHarness />);
    fireEvent.click(await screen.findByRole("button", { name: "重试自动解锁" }));
    await waitFor(() => expect(secretVaultUnlockLocal).toHaveBeenCalledTimes(2));
    await waitFor(() => expect((screen.getByRole("button", { name: "重试自动解锁" }) as HTMLButtonElement).disabled).toBe(false));
    expect(screen.getByText(keychainError.message)).toBeTruthy();
    expect(secretVaultUnlockLocal).toHaveBeenCalledTimes(2);
  });

  it("StrictMode 不并发弹出两次系统授权", async () => {
    render(<StrictMode><VaultHarness /></StrictMode>);
    await screen.findByText(keychainError.message);
    expect(secretVaultUnlockLocal).toHaveBeenCalledTimes(1);
  });

  it("已开启高级保护时仍使用安全密码解锁原保险库", async () => {
    render(<VaultHarness masterPasswordEnabled />);
    fireEvent.change(await screen.findByLabelText("安全密码"), { target: { value: "example-test-password" } });
    fireEvent.click(screen.getByRole("button", { name: "解锁" }));
    await screen.findByText("凭据可用");
    expect(secretVaultUnlock).toHaveBeenCalledWith("example-test-password");
    expect(secretVaultUnlockLocal).not.toHaveBeenCalled();
  });

  it("高级保护状态查询失败不显示创建，重试读取后才能输入密码", async () => {
    vi.mocked(secretVaultStatus).mockRejectedValueOnce({ message: "状态读取失败" });
    render(<VaultHarness masterPasswordEnabled />);
    await screen.findByText("状态读取失败");
    expect(screen.queryByText("创建加密保险库")).toBeNull();
    expect(screen.queryByLabelText("安全密码")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "重试读取状态" }));
    await screen.findByLabelText("安全密码");
    expect(screen.getByText("解锁加密保险库")).toBeTruthy();
    expect(secretVaultUnlock).not.toHaveBeenCalled();
    expect(secretVaultUnlockLocal).not.toHaveBeenCalled();
  });

  it("后端已经解锁时直接使用现有状态，不重复访问钥匙串", async () => {
    vi.mocked(secretVaultStatus).mockResolvedValue(unlocked);
    render(<VaultHarness />);
    await screen.findByText("凭据可用");
    expect(secretVaultUnlockLocal).not.toHaveBeenCalled();
    expect(screen.queryByRole("form")).toBeNull();
  });
});
