import { nodeHereOf } from "@/components/railCards";
import { useFeedRead } from "@/components/useFeedRead";
import { snapshotSignerRows } from "@/src/data/network";
import { useStore } from "@/src/store/store";

/** Whether the committed node belongs to what this view shows (`nodeHereOf`), the signatures read
 *  only for a node carried into Snapshots. */
export function useNodeHere(): boolean | undefined {
  const asks = useStore((s) => s.mode === "ledger" && s.inspect != null && s.inspectView !== "ledger");
  useFeedRead(["clusters", "api-geo", "exact"], "Node in this snapshot", asks);
  return useStore((s) =>
    nodeHereOf(s, (sel) => snapshotSignerRows(s.selNodes, s.snapshotExact[sel.globalOrdinal]?.rows ?? null, sel)),
  );
}
