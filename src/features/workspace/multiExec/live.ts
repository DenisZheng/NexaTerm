import {
  selectLiveFanoutTargets,
  type MultiExecTarget,
} from "./targets";

export interface MultiExecLiveDelivery {
  error: unknown | null;
  key: string;
  status: "written" | "failed";
}

export async function writeMultiExecLiveInput(input: {
  data: string;
  selectedKeys: ReadonlySet<string>;
  sourceKey: string;
  targets: readonly MultiExecTarget[];
  write(sessionId: string, data: string): Promise<void>;
}): Promise<MultiExecLiveDelivery[]> {
  const targets = selectLiveFanoutTargets(
    input.targets,
    input.selectedKeys,
    input.sourceKey,
  );
  const results = await Promise.allSettled(
    targets.map((target) => input.write(target.sessionId, input.data)),
  );

  return targets.map((target, index) => {
    const result = results[index];
    return result?.status === "fulfilled"
      ? { error: null, key: target.key, status: "written" as const }
      : {
          error: result?.status === "rejected" ? result.reason : new Error("Missing live delivery result."),
          key: target.key,
          status: "failed" as const,
        };
  });
}
