import { lazy, Suspense, useState } from "react";
import { ListVideo } from "lucide-react";
import { useI18n } from "../../shared/i18n";
import type { MultiExecTarget } from "../workspace/multiExec/targets";
import type { MacroRuntime } from "./macroReplay";

const MacroDialog = lazy(async () => ({ default: (await import("./MacroDialog")).MacroDialog }));

export function MacroLauncher({ targets, selectedKeys, runtime, onOpen }: {
  targets: readonly MultiExecTarget[]; selectedKeys: ReadonlySet<string>; runtime: MacroRuntime; onOpen(): void;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  return <>
    <button className="text-tool-button multi-exec-bar-mode" type="button"
      disabled={!targets.some((target) => selectedKeys.has(target.key))}
      onClick={() => { onOpen(); setOpen(true); }}>
      <ListVideo className="ui-icon" aria-hidden="true" /><span>{t("macros.title")}</span>
    </button>
    {open ? <Suspense fallback={<span role="status">{t("commands.loading")}</span>}>
      <MacroDialog targets={targets.filter((target) => selectedKeys.has(target.key))} runtime={runtime} onClose={() => setOpen(false)} />
    </Suspense> : null}
  </>;
}
