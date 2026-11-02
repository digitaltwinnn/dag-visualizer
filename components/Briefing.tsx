"use client";

import { useEffect, useRef, useState } from "react";
import { track } from "@vercel/analytics";
import { cn } from "@/lib/utils";
import { AI_NOTES_ICON } from "@/components/icons";
import { briefingReq, briefingWords } from "@/components/notes/briefingNote";
import { AI_TITLE } from "@/components/notes/noteSubject";
import TypedNote from "@/components/notes/TypedNote";
import useNote from "@/components/notes/useNote";
import EcgMark from "@/components/topbar/EcgMark";
import { useBreakpoint } from "@/components/useBreakpoint";
import { VIEWS } from "@/components/views";
import { SITE_ORIGIN } from "@/src/data/site";
import { BRIEFING_STOPS, BRIEFING_WORDS_OUT_MS, SCENE_WAIT_MS, STOP_MS, briefsOn, hasLanded, mayAdvance, nextStop, prevStop } from "@/src/engine/domain/briefing";
import { NET } from "@/src/net/current";
import { useStore } from "@/src/store/store";

// THE BRIEFING (`domain/briefing.ts` has the tour as data, the design is in docs/superpowers/specs):
// the controller and the caption. It writes `store.briefing`, and everything else follows that one
// channel: the HUD stands down, the URL holds, the Engine runs the pace and lifts the scene.
//
// Skip or Escape ends it where it stands: the visitor stays in that view, the words fade, and the
// interface arrives through the HUD's own fade. The scene stays the scene (user, 2026-11-01): the
// pointer passes through to the canvas, a drag orbits as it always does, and it holds the clock. It
// is framed as the view rests, the HUD standing invisible where it will land, so the end moves
// nothing on desktop and tablet. Run to its end, it takes three beats (`BRIEFING_WORDS_OUT_MS`): the
// words go, the scene moves alone, the HUD arrives as it lands.
// The clock is frame-driven, so a hidden tab holds the tour instead of running it out unseen.

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

type End = "done" | "skip" | "key" | "back" | "unready";

function endBriefing(stop: number, how: End): void {
  const s = useStore.getState();
  if (how === "done") s.setMode(BRIEFING_STOPS[0]);
  s.setBriefing(null); // after the mode, so the route publishes where the tour left off
  track("briefing-end", { how, at: BRIEFING_STOPS[stop] });
}

/** Move the tour to a stop: the clock starts over there, so a stop stepped to gets its full time. */
const goTo = (i: number) => {
  const s = useStore.getState();
  s.setMode(BRIEFING_STOPS[i]!);
  s.setBriefing(i);
};

export default function Briefing() {
  const stop = useStore((s) => s.briefing);
  // The stop on screen outlives the tour by the words' own fade, so an end never cuts them.
  const [shown, setShown] = useState<number | null>(null);
  if (stop != null && stop !== shown) setShown(stop);

  useEffect(() => {
    if (stop != null || shown == null) return;
    const id = setTimeout(() => setShown(null), BRIEFING_WORDS_OUT_MS);
    return () => clearTimeout(id);
  }, [stop, shown]);

  useEffect(() => {
    if (!briefsOn({ pathname: location.pathname, net: NET, seen: seenThisSession() })) return;
    markSeen();
    useStore.getState().setBriefing(0);
  }, []);

  return shown == null ? null : <Tour stop={shown} leaving={stop == null} />;
}

function Tour({ stop, leaving }: { stop: number; leaving: boolean }) {
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
  // The last stop's time is up: the ending's three beats run from here.
  const [ending, setEnding] = useState(false);
  const fading = ending || leaving;
  // The scene is pressed: a drag, or the moment before one. A visitor turning a view has not finished
  // with it. Read off the press itself, so a press that never moves holds the tour too.
  const held = useRef(false);

  // On the scene, not on the mount: a stop nobody could see is no stop, and the first mount runs
  // before analytics has its queue.
  useEffect(() => {
    if (ready) track("briefing-stop", { stop: view });
  }, [ready, view]);

  useEffect(() => {
    if (fading) return;
    let raf = 0;
    let last = performance.now();
    let waited = 0;
    let ran = 0;
    const tick = (now: number) => {
      const since = Math.max(0, now - last); // a frame's own time can fall before the stop began
      const dt = Math.min(since, 1000); // a tab coming back must not jump the tour; a slow phone keeps real time
      waited += dt;
      last = now;
      const s = useStore.getState();
      if (s.engineFailed || (!s.sceneReady && waited > SCENE_WAIT_MS)) return endBriefing(stop, "unready");
      if (s.sceneReady && !held.current) ran += dt;
      if (fill.current) fill.current.style.transform = `scaleX(${Math.min(1, ran / STOP_MS)})`;
      if (!held.current && mayAdvance(ran, s.motionPhase)) {
        const next = nextStop(stop);
        if (next == null) return setEnding(true);
        goTo(next);
        return;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [stop, view, fading]);

  // THE ENDING'S SECOND AND THIRD BEATS: the globe comes back, and the HUD arrives as it lands.
  useEffect(() => {
    if (!ending || leaving) return;
    const start = performance.now();
    let raf = 0;
    let moved = false;
    let saw = false;
    const tick = (now: number) => {
      const since = now - start;
      const s = useStore.getState();
      if (!moved && since >= BRIEFING_WORDS_OUT_MS) {
        moved = true;
        s.setMode(BRIEFING_STOPS[0]);
        s.setBriefingLanding(true);
      } else if (moved) {
        saw ||= s.motionPhase != null;
        if (hasLanded(since - BRIEFING_WORDS_OUT_MS, saw, s.motionPhase)) return endBriefing(stop, "done");
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [ending, leaving, stop]);

  useEffect(() => {
    const press = (e: PointerEvent) => {
      if (e.target instanceof HTMLCanvasElement) held.current = true;
    };
    const release = () => {
      held.current = false;
    };
    window.addEventListener("pointerdown", press);
    window.addEventListener("pointerup", release);
    window.addEventListener("pointercancel", release);
    window.addEventListener("blur", release);
    return () => {
      window.removeEventListener("pointerdown", press);
      window.removeEventListener("pointerup", release);
      window.removeEventListener("pointercancel", release);
      window.removeEventListener("blur", release);
    };
  }, []);

  useEffect(() => {
    if (leaving) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") endBriefing(stop, ending ? "done" : "key");
      if (ending) return;
      const step = e.key === "ArrowRight" ? nextStop(stop) : e.key === "ArrowLeft" ? prevStop(stop) : null;
      if (step != null) goTo(step);
    };
    const onPop = () => endBriefing(stop, ending ? "done" : "back");
    window.addEventListener("keydown", onKey);
    window.addEventListener("popstate", onPop);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("popstate", onPop);
    };
  }, [stop, ending, leaving]);

  const live = fading ? "pointer-events-none" : "pointer-events-auto";
  const bars = (
    <div className={cn("flex flex-1 gap-1", live)}>
      {/* Each segment is a way back or forward. Out of the Tab order, so Skip stays the first stop
          for a keyboard, which has the arrow keys. A stop's fill is keyed on the tour's stop: the
          clock writes it by hand, and React would not repaint one stepped back past. */}
      {BRIEFING_STOPS.map((v, i) => (
        <button
          key={v}
          type="button"
          tabIndex={-1}
          aria-label={`Go to ${VIEWS.find((x) => x.id === v)!.name}`}
          onClick={() => goTo(i)}
          className="group -my-3 flex-1 py-3 touch:-my-5 touch:py-5"
        >
          <span className="block h-[3px] overflow-hidden rounded-full bg-foreground/20 group-hover:bg-foreground/40">
            <i
              key={stop}
              ref={i === stop ? fill : undefined}
              className="block h-full origin-left bg-[var(--ai-mark)]"
              style={{ transform: `scaleX(${i < stop ? 1 : 0})` }}
            />
          </span>
        </button>
      ))}
    </div>
  );
  const skip = (
    <button
      type="button"
      onClick={() => endBriefing(stop, "skip")}
      className={cn("h-10 rounded-full bg-foreground px-6 text-body font-semibold text-background hover:bg-foreground/85 touch:min-h-11", live)}
    >
      Skip
    </button>
  );
  // The top bar that carries the brand is stood down, so the tour says where you are itself.
  const site = (
    <span className="flex shrink-0 items-center gap-1.5 text-body font-semibold text-foreground">
      <EcgMark />
      {new URL(SITE_ORIGIN).host}
    </span>
  );
  const Mark = AI_NOTES_ICON;
  const who = words.ai && (
    <span className="flex shrink-0 items-center gap-1.5 text-label font-semibold text-[var(--ai-mark)]">
      <Mark aria-hidden className="size-3.5" />
      Powered by {AI_TITLE}
    </span>
  );

  return (
    <section
      aria-label="Network briefing"
      className="fixed inset-0 z-50 pointer-events-none"
    >
      {/* The caption types itself in, so a screen reader hears this instead: one region, standing
          from the start, so the first stop is announced and each is announced once. */}
      <p className="sr-only" aria-live="polite">{ready ? `${name}: ${words.text}` : ""}</p>
      {ready && (
        <div
          className={cn("absolute inset-0 transition-opacity ease-out motion-reduce:transition-none", fading && "opacity-0")}
          style={{ transitionDuration: `${BRIEFING_WORDS_OUT_MS}ms` }}
        >
          <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-[44%] [background:linear-gradient(transparent,var(--scene-ground)_38%)]" />
          {phone ? (
            <div className="absolute inset-x-0 top-0 flex flex-col gap-1 px-3 pt-[calc(env(safe-area-inset-top)+10px)]">
              {bars}
              <div className="flex items-center justify-between">
                {site}
                {skip}
              </div>
            </div>
          ) : (
            <div className="absolute inset-x-0 top-0 flex items-center gap-3.5 px-[max(16px,3.7vw)] pt-[calc(env(safe-area-inset-top)+24px)]">
              {site}
              {bars}
              {skip}
            </div>
          )}
          <div className="absolute inset-x-0 bottom-0 px-[max(16px,3.7vw)] pb-[calc(env(safe-area-inset-bottom)+22px)]">
            <div className="mb-1 flex min-h-5 justify-center max-[700px]:justify-start">{who}</div>
            <div aria-hidden className="mx-auto min-h-[2.52em] max-w-[79%] text-balance text-center text-briefing font-medium text-foreground max-[700px]:mx-0 max-[700px]:min-h-[3.8em] max-[700px]:max-w-full max-[700px]:text-left max-[700px]:text-wrap">
              <TypedNote key={`${stop}:${words.text}`} text={words.text} always />
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
