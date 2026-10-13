import { useEffect, useRef } from "react";

/** 恢复页面后的首个输入先检查超时，不能把过期计时当成新活动。 */
export function useVaultIdleLock({ enabled, minutes, onLock }: { enabled: boolean; minutes: number; onLock: () => Promise<unknown> }) {
  const lastActivity = useRef<number | null>(null);
  const lockRef = useRef(onLock);
  lockRef.current = onLock;
  useEffect(() => {
    if (!enabled || minutes === 0) { lastActivity.current = null; return; }
    if (lastActivity.current === null) lastActivity.current = Date.now();
    const interval = minutes * 60 * 1000;
    let timer: number | undefined;
    let expired = false;
    function checkDeadline() {
      if (expired) return true;
      if (Date.now() - lastActivity.current! < interval) return false;
      expired = true;
      window.clearTimeout(timer);
      void lockRef.current();
      return true;
    }
    function schedule() {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => { if (!checkDeadline()) schedule(); }, Math.max(0, interval - (Date.now() - lastActivity.current!)));
    }
    function activity() {
      if (checkDeadline()) return;
      lastActivity.current = Date.now();
      schedule();
    }
    schedule();
    window.addEventListener("keydown", activity);
    window.addEventListener("pointerdown", activity);
    window.addEventListener("wheel", activity);
    window.addEventListener("focus", checkDeadline);
    document.addEventListener("visibilitychange", checkDeadline);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("keydown", activity);
      window.removeEventListener("pointerdown", activity);
      window.removeEventListener("wheel", activity);
      window.removeEventListener("focus", checkDeadline);
      document.removeEventListener("visibilitychange", checkDeadline);
    };
  }, [enabled, minutes]);
}
