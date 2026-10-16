import { useState } from "react";
import { Network, Play, Square } from "lucide-react";
import { useI18n } from "../../shared/i18n";
import { AppSelect } from "../../shared/ui/AppSelect";
import { useLocalConnectionProbe } from "./useLocalConnectionProbe";
import type { LocalProbeKind } from "./localProbeTypes";
export function LocalConnectionDiagnostics({ active, initialHost = "", initialPort = 22 }: {
  active: boolean; initialHost?: string; initialPort?: number;
}) {
  const { t } = useI18n();
  const [host, setHost] = useState(initialHost);
  const [port, setPort] = useState(String(initialPort));
  const [kind, setKind] = useState<LocalProbeKind>("tcp");
  const targetHost = kind === "local_port" ? "127.0.0.1" : host;
  const probe = useLocalConnectionProbe(active);
  const desktop = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
  const portValid = kind === "dns" || (/^\d+$/.test(port) && Number(port) >= 1 && Number(port) <= 65535);
  return <section className="network-diagnostics" aria-label={t("localProbe.title")}>
    <header className="docker-tool-summary network-diagnostics-summary">
      <div><strong>{t("localProbe.title")}</strong><span>{t(kind === "local_port" ? "localProbe.localPortScope" : "localProbe.scope")}</span></div>
      <Network className="ui-icon" aria-hidden="true" />
    </header>
    <form className="network-diagnostic-form" onSubmit={(event) => {
      event.preventDefault();
      if (active && desktop && portValid && targetHost) void probe.run({ kind, host: targetHost, port: kind === "dns" ? 0 : Number(port) });
    }}>
      <AppSelect value={kind} onChange={setKind} disabled={probe.busy} ariaLabel={t("localProbe.kind")}
        options={[{ value: "dns", label: t("localProbe.dns") }, { value: "tcp", label: t("localProbe.tcp") },
          { value: "local_port", label: t("localProbe.local_port") }]} />
      {kind !== "local_port" ? <label className="network-diagnostic-field"><span>{t("localProbe.host")}</span>
        <input value={host} disabled={probe.busy} onChange={(event) => setHost(event.target.value)} spellCheck={false} />
      </label> : null}
      {kind !== "dns" ? <label className="network-diagnostic-field"><span>{t("localProbe.port")}</span>
        <input value={port} inputMode="numeric" disabled={probe.busy} aria-invalid={!portValid}
          onChange={(event) => setPort(event.target.value)} />
      </label> : null}
      {!desktop ? <p>{t("localProbe.desktop")}</p> : null}
      {!portValid ? <p role="alert">{t("localProbe.reason.invalid_port")}</p> : null}
      <div className="network-diagnostic-actions">
        <button className="toolbox-mini-button primary" type="submit" disabled={!active || !desktop || probe.busy || !targetHost || !portValid}>
          <Play className="ui-icon" aria-hidden="true" />{t("localProbe.run")}</button>
        <button className="toolbox-mini-button" type="button" disabled={!probe.busy} onClick={() => void probe.cancel()}>
          <Square className="ui-icon" aria-hidden="true" />{t("localProbe.cancel")}</button>
      </div>
      {probe.error ? <p role="alert" className="docker-inline-error">{t(`localProbe.error.${probe.error}`)}</p> : null}
      <div role="status" aria-live="polite">
        {probe.result ? <><strong>{t(`localProbe.status.${probe.result.status}`)}</strong>
          <p>{t(`localProbe.reason.${probe.result.reason}`)}</p>
          <small>{t(probe.result.kind === "local_port" ? "localProbe.localPortMetrics" : "localProbe.metrics", { ms: probe.result.duration_ms, count: probe.result.address_count })}</small>
          {probe.result.addresses_truncated ? <p>{t("localProbe.truncated")}</p> : null}
        </> : t(`localProbe.phase.${probe.phase}`)}
      </div>
    </form>
  </section>;
}
