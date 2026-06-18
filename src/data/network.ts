import { useStore } from "@/src/store/store";
// Existing data layer, reused untouched. Browser-only (fetch/setInterval); imported
// from client code, initialized in an effect. Types come in a later phase.
// @ts-expect-error - vanilla JS module, no type declarations yet
import { NetworkData } from "../../js/api.js";
// @ts-expect-error - vanilla JS module, no type declarations yet
import { METAGRAPHS } from "../../js/config.js";

let net: NetworkData | null = null;

// Idempotent: NetworkData is a singleton living for the app's lifetime. The guard
// makes React StrictMode's double-mount (dev) a no-op rather than a second poller.
export function initNetwork(): NetworkData | null {
  if (typeof window === "undefined") return net;
  if (net) return net;

  net = new NetworkData();
  const { setLive, setNodes, setMetagraphs, setLatestOrdinal, setActivity, setPriceUsd } =
    useStore.getState();

  setMetagraphs(METAGRAPHS.length); // publicly listed metagraphs we track

  net.on("status", ({ live }: { live: boolean }) => setLive(live));
  net.on("cluster", ({ l0, l1 }: { l0: unknown[]; l1: unknown[] }) =>
    setNodes(l0.length, l1.length),
  );
  net.on("price", (p: { usd?: number } | null) =>
    setPriceUsd(p && typeof p.usd === "number" ? p.usd : null),
  );
  net.on("global", (evt: { latest?: { ordinal: number } }) => {
    if (evt.latest) {
      setLatestOrdinal(evt.latest.ordinal);
      setActivity(net!.getActivity());
    }
  });

  net.init();
  return net;
}

// Exposed for later phases (engine subscribes for Lane A; panels read the store).
export function getNetwork(): NetworkData | null {
  return net;
}
