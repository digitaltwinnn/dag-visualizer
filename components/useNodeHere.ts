import { nodeHereOf } from "@/components/railCards";
import { useFeedRead } from "@/components/useFeedRead";
import { snapshotSignerRows } from "@/src/data/network";
import { VIEW_POLICIES } from "@/src/engine/domain/viewPolicy";
import { useStore } from "@/src/store/store";

/** Whether the committed node belongs to what this view shows (`nodeHereOf`), the signatures read
 *  only for a node carried into Snapshots. */
export function useNodeHere(): boolean | undefined {
  const asks = useStore((s) => VIEW_POLICIES[s.mode].tickScoped && s.inspect != null && s.inspectView !== s.mode);
  useFeedRead(["clusters", "api-geo", "exact"], "Node in this snapshot", asks);
  return useStore((s) =>
    nodeHereOf(s, (sel) => snapshotSignerRows(s.selNodes, s.snapshotExact[sel.globalOrdinal]?.rows ?? null, sel)),
  );
}
