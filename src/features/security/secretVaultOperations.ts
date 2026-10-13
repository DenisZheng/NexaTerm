export type VaultOperationKind = "refresh" | "unlock" | "local" | "enable" | "disable" | "lock";
interface Token { kind: VaultOperationKind; nonce: symbol }

/** 只持操作身份；后端调用串行，lock 可取代旧 mutation 的 UI 结果。 */
export function createSecretVaultOperations() {
  let active = true;
  let read: Token | null = null;
  let mutation: Token | null = null;
  let tail: Promise<unknown> = Promise.resolve();
  const current = (token: Token) => active && (token.kind === "refresh" ? read === token : mutation === token);
  return {
    begin(kind: VaultOperationKind): Token | null {
      if (!active || (mutation && (kind !== "lock" || mutation.kind === "lock"))) return null;
      const token = { kind, nonce: Symbol(kind) };
      if (kind === "refresh") read = token;
      else { read = null; mutation = token; }
      return token;
    },
    run<T>(token: Token, request: () => Promise<T>): Promise<T | null> {
      const job = tail.then(() => current(token) ? request() : null);
      tail = job.then(() => undefined, () => undefined);
      return job;
    },
    isCurrent: current,
    finish(token: Token) {
      if (read === token) { read = null; return true; }
      if (mutation === token) { mutation = null; return true; }
      return false;
    },
    activity() { return { reading: Boolean(read), mutation: mutation?.kind ?? null }; },
    hasMutation() { return mutation !== null; },
    activate() { active = true; },
    suspend() { active = false; },
    isActive() { return active; },
  };
}
