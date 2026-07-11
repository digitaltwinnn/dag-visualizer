// The ONE executor for the pick decision table (src/engine/domain/pickActions): every caller
// — the Engine's scene clicks, GeoExplore's country/node rows, LiveStrip's bars — applies its
// actions through here, so an action kind always maps to exactly one store effect. New action
// kinds get their effect HERE (and a test in applyClickActions.test.ts), never inline in a
// caller.
import { useStore } from "./store";
import type { ClickAction } from "@/src/engine/domain/pickActions";

export function applyClickActions(actions: ClickAction[]): void {
  const st = useStore.getState();
  for (const a of actions) {
    switch (a.kind) {
      case "filter":
        st.setFilter(a.id);
        break;
      case "country":
        st.setCountry(a.cc);
        break;
      case "inspect":
        st.setInspect(a.pick);
        break;
      case "snapshot":
        // Selecting a snapshot both sets the card subject and the follow state (the live tip
        // re-follows the heartbeat; anything older pins — see snapshotSelectActions).
        st.setFollowing(a.follow);
        st.setSnap(a.pick);
        break;
      case "layer":
        st.setLayer(a.pick);
        break;
    }
  }
}
