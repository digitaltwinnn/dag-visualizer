"use client";
import { useEffect, useRef, useState } from "react";
import { useStore } from "@/src/store/store";
import { bootPhase, type BootPhase } from "@/src/data/bootPhase";

const BOOT_TIMEOUT_MS = 8000;

// The app's cold-start phase. Latches once LIVE — a later feed drop is Phase-7's per-panel NO
// SIGNAL, not the boot overlay coming back.
export function useBootPhase(): BootPhase {
  const engineReady = useStore((s) => s.engineReady);
  const sceneReady = useStore((s) => s.sceneReady);
  const engineFailed = useStore((s) => s.engineFailed);
  const latestSnapshot = useStore((s) => s.latestSnapshot);
  const metaList = useStore((s) => s.metaList);
  const live = useStore((s) => s.live);
  const [timedOut, setTimedOut] = useState(false);
  const latched = useRef(false);

  useEffect(() => {
    const id = setTimeout(() => setTimedOut(true), BOOT_TIMEOUT_MS);
    return () => clearTimeout(id);
  }, []);

  const hasData = latestSnapshot != null || metaList.length > 0;
  const phase = bootPhase({ engineReady, engineFailed, sceneReady, hasData, live, timedOut });
  if (phase === "live") latched.current = true;
  return latched.current ? "live" : phase;
}
