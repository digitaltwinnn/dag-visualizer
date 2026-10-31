"use client";

import { useEffect, useRef } from "react";
import { track } from "@vercel/analytics";
import { cn } from "@/lib/utils";
import { AI_NOTES_ICON } from "@/components/icons";
import { briefingReq, briefingWords } from "@/components/notes/briefingNote";
import { AI_TITLE } from "@/components/notes/noteSubject";
import TypedNote from "@/components/notes/TypedNote";
import useNote from "@/components/notes/useNote";
import { useBreakpoint } from "@/components/useBreakpoint";
import { VIEWS } from "@/components/views";
import { breakpointOf } from "@/src/data/breakpoint";
import { BRIEFING_STOPS, SCENE_WAIT_MS, STOP_MS, briefsOn, mayAdvance, nextStop } from "@/src/engine/domain/briefing";
import { NET } from "@/src/net/current";
import { useStore } from "@/src/store/store";

// THE BRIEFING (`domain/briefing.ts` has the tour as data, the design is in docs/superpowers/specs):
// the controller and the caption. It writes `store.briefing`, and everything else follows that one
// channel: the HUD stands down, the URL holds, the Engine runs the pace and lifts the scene.
//
// Skip, a click anywhere or Escape ends it where it stands: the visitor stays in that view, and the
// interface arrives through the HUD's own fade. The clock is frame-driven, so a hidden tab holds
// the tour instead of running it out unseen.

const SEEN_KEY = "dag:briefed";

function seenThisSession(): boolean {
  try {
    return sessionStorage.getItem(SEEN_KEY) != null;
  } catch {
    return false;
  }
}

function markSeen(): void {
  try {
    sessionStorage.setItem(SEEN_KEY, "1");
  } catch {
    // Private mode: the tour simply plays again next time.
  }
}

type End = "done" | "skip" | "tap" | "key" | "back" | "unready";

function endBriefing(stop: number, how: End): void {
  const s = useStore.getState();
  if (how === "done") s.setMode(BRIEFING_STOPS[0]);
  s.setBriefing(null); // after the mode, so the route publishes where the tour left off
  s.setRailsHidden(false);
  track("briefing-end", { how, at: BRIEFING_STOPS[stop] });
}

export default function Briefing() {
  const stop = useStore((s) => s.briefing);

  useEffect(() => {
    if (!briefsOn({ pathname: location.pathname, net: NET, seen: seenThisSession() })) return;
    markSeen();
    const s = useStore.getState();
    // Desktop's rails take width from the scene, and this is the app's own way to give it back.
    // Tablet and phone frame the scene for the full width already.
    if (breakpointOf(window.innerWidth) === "desktop") s.setRailsHidden(true);
    s.setBriefing(0);
  }, []);

  return stop == null ? null : <Tour stop={stop} />;
}

function Tour({ stop }: { stop: number }) {
  const phone = useBreakpoint() === "phone";
  const ready = useStore((s) => s.sceneReady);
  // Every stop's note is asked for at the start, so a line is on hand when its view arrives.
  const geo = useNote(briefingReq("geo"));
  const ledger = useNote(briefingReq("ledger"));
  const hyper = useNote(briefingReq("hyper"));
  const trend = useNote(briefingReq("trend"));
  const view = BRIEFING_STOPS[stop]!;
  const words = briefingWords(view, { geo, ledger, hyper, trend }[view].res);
  const name = VIEWS.find((v) => v.id === view)!.name;
  const fill = useRef<HTMLElement | null>(null);
  const skipRef = useRef<HTMLButtonElement | null>(null);

  // On the scene, not on the mount: a stop nobody could see is no stop, and the first mount runs
  // before analytics has its queue.
  useEffect(() => {
    if (ready) track("briefing-stop", { stop: view });
  }, [ready, view]);

  useEffect(() => {
    if (ready) skipRef.current?.focus({ preventScroll: true });
  }, [ready]);

  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    let waited = 0;
    let ran = 0;
    const tick = (now: number) => {
      const dt = Math.min(now - last, 100); // a tab coming back must not jump the tour
      waited += Math.min(now - last, 1000); // real time: a slow phone gets no longer behind a dead feed
      last = now;
      const s = useStore.getState();
      if (s.engineFailed || (!s.sceneReady && waited > SCENE_WAIT_MS)) return endBriefing(stop, "unready");
      if (s.sceneReady) ran += dt;
      if (fill.current) fill.current.style.transform = `scaleX(${Math.min(1, ran / STOP_MS)})`;
      if (mayAdvance(ran, s.motionPhase)) {
        const next = nextStop(stop);
        if (next == null) return endBriefing(stop, "done");
        s.setMode(BRIEFING_STOPS[next]);
        s.setBriefing(next);
        return;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [stop, view]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") endBriefing(stop, "key");
    };
    const onPop = () => endBriefing(stop, "back");
    window.addEventListener("keydown", onKey);
    window.addEventListener("popstate", onPop);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("popstate", onPop);
    };
  }, [stop]);

  const bars = (
    <div className="flex flex-1 gap-1" aria-hidden>
      {BRIEFING_STOPS.map((v, i) => (
        <span key={v} className="h-[3px] flex-1 overflow-hidden rounded-full bg-foreground/20">
          <i
            ref={i === stop ? fill : undefined}
            className="block h-full origin-left bg-[var(--ai-mark)]"
            style={{ transform: `scaleX(${i < stop ? 1 : 0})` }}
          />
        </span>
      ))}
    </div>
  );
  const skip = (
    <button
      ref={skipRef}
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        endBriefing(stop, "skip");
      }}
      className="h-7 rounded-full bg-foreground/10 px-3 text-label text-foreground hover:bg-foreground/20 touch:min-h-11 touch:px-4"
    >
      Skip
    </button>
  );
  const Mark = AI_NOTES_ICON;
  const who = words.ai && (
    <span className="flex shrink-0 items-center gap-1.5 text-label font-semibold text-[var(--ai-mark)]">
      <Mark aria-hidden className="size-3.5" />
      {AI_TITLE}
    </span>
  );

  return (
    <section
      aria-label="Network briefing"
      onClick={ready ? () => endBriefing(stop, "tap") : undefined}
      className={cn("fixed inset-0 z-50", ready ? "cursor-pointer" : "pointer-events-none")}
    >
      {/* The caption types itself in, so a screen reader hears this instead: one region, standing
          from the start, so the first stop is announced and each is announced once. */}
      <p className="sr-only" aria-live="polite">{ready ? `${name}: ${words.text}` : ""}</p>
      {ready && (
        <>
          <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-[44%] [background:linear-gradient(transparent,var(--scene-ground)_38%)]" />
          {phone && (
            <div className="absolute inset-x-0 top-0 flex flex-col gap-1 px-3 pt-[calc(env(safe-area-inset-top)+10px)]">
              {bars}
              <div className="flex items-center justify-between">
                <span aria-hidden className="text-title font-semibold text-foreground">{name}</span>
                {skip}
              </div>
            </div>
          )}
          <div className="absolute inset-x-0 bottom-0 px-[max(16px,3.7vw)] pb-[calc(env(safe-area-inset-bottom)+22px)]">
            {phone ? <div className="mb-1 min-h-5">{who}</div> : <p aria-hidden className="mb-2 text-figure text-muted-foreground">{name}</p>}
            <div aria-hidden className="min-h-[2.52em] max-w-[79%] text-briefing font-medium text-foreground max-[700px]:min-h-[3.8em] max-[700px]:max-w-full">
              <TypedNote key={`${stop}:${words.text}`} text={words.text} waited />
            </div>
            {!phone && (
              <div className="mt-3 flex items-center gap-3.5">
                {who}
                {bars}
                {skip}
              </div>
            )}
          </div>
        </>
      )}
    </section>
  );
}
