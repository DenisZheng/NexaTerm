// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ConfirmDialog } from "./ConfirmDialog";

afterEach(cleanup);

function renderDialog(overrides: Partial<Parameters<typeof ConfirmDialog>[0]> = {}) {
  const onConfirm = vi.fn<() => void | Promise<void>>();
  const onOpenChange = vi.fn<(open: boolean) => void>();
  render(
    <ConfirmDialog
      cancelLabel="返回"
      confirmLabel="删除"
      description="此操作不可撤销。"
      open
      title="删除连接？"
      onConfirm={onConfirm}
      onOpenChange={onOpenChange}
      {...overrides}
    />,
  );
  return { onConfirm, onOpenChange };
}

describe("ConfirmDialog", () => {
  it("open=false 时不渲染任何内容", () => {
    renderDialog({ open: false });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.queryByText("删除连接？")).toBeNull();
  });

  it("open=true 时展示标题、说明与两个按钮", () => {
    renderDialog();
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(screen.getByText("删除连接？")).toBeTruthy();
    expect(screen.getByText("此操作不可撤销。")).toBeTruthy();
    expect(screen.getByRole("button", { name: "删除" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "返回" })).toBeTruthy();
  });

  it("确认后先执行 onConfirm，再以 false 关闭", async () => {
    const { onConfirm, onOpenChange } = renderDialog();

    fireEvent.click(screen.getByRole("button", { name: "删除" }));

    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onConfirm.mock.invocationCallOrder[0]).toBeLessThan(onOpenChange.mock.invocationCallOrder[0]);
  });

  it("onConfirm 未完成期间两个按钮禁用且 Escape 不能关闭；完成后才关闭", async () => {
    let finishConfirm!: () => void;
    const pending = new Promise<void>((resolve) => {
      finishConfirm = resolve;
    });
    const { onOpenChange } = renderDialog({ onConfirm: () => pending });

    fireEvent.click(screen.getByRole("button", { name: "删除" }));

    const confirmButton = screen.getByRole("button", { name: "删除" }) as HTMLButtonElement;
    const cancelButton = screen.getByRole("button", { name: "返回" }) as HTMLButtonElement;
    await waitFor(() => expect(confirmButton.disabled).toBe(true));
    expect(cancelButton.disabled).toBe(true);

    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(onOpenChange).not.toHaveBeenCalled();

    finishConfirm();
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    expect(onOpenChange).toHaveBeenCalledTimes(1);
  });

  it("取消只触发 onOpenChange(false)，不执行 onConfirm", async () => {
    const { onConfirm, onOpenChange } = renderDialog();

    fireEvent.click(screen.getByRole("button", { name: "返回" }));

    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    expect(onConfirm).not.toHaveBeenCalled();
  });
});
