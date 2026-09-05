"use client";

import { useLayoutEffect, useRef, type ReactNode } from "react";

// THE HEIGHT EASE — the no-pop rule for a block whose CONTENT redistributes in place (user,
// 2026-09-04: "the node card size does still jump between views" — the pile rule hands facts
// to whichever ancestor card states them best, so a view switch re-committing different rungs
// grows or shrinks the node card in one frame). CSS cannot ease this: the block's height is
// `auto` before and after, and an auto→auto content change fires no transition
// (`interpolate-size` only bridges auto↔length). So the inner content is measured
// (ResizeObserver) and the box animates between the readings via WAAPI, on the roll clock's
// own tokens (read from the live CSSOM — WAAPI can't consume var()). Layout below follows the
// animated height each frame, which is the point: the whole pile eases.
//
// ⚠️ THE CARD'S OWN BOX RIDES THE EASE (user, second round: "it actually looks like the top
// part of the card is moving, instead of the bottom expanding/shrinking" — the first cut
// animated only this wrapper, so a keyed-in card rendered at its natural height instantly and
// the visible BORDER still snapped; only empty slot space eased). During the ease the inner
// column and the first panel inside (`.ig-panel`/`.rail-entry` — the outermost card) are
// stretched to 100% of the animated box with their own overflow clipped, so the border and
// the content window move with the ease; every style is cleared at rest. While OUR animation
// runs, the observer's events are self-driven echoes and are ignored — the clear at the end
// lets one fresh measurement through, which also self-heals a content change that landed
// mid-ease (a corrective settle to the true height).
//
// IT WRAPS EVERY LADDER RUNG and both explore cards: expand, collapse, ghost↔populated and
// fact redistribution all ease. The slab's "nothing animates" note is amended to GEOMETRY
// (seams, corners, washes — still static); heights ease. Reduced motion snaps everything, so
// that guarantee holds.
//
// The first measurement never animates (mount is BootFade's moment) — unless `growIn` says
// this box arrived AFTER its host lane booted: a slot joining the ladder mid-session (the
// snapshot slots arriving with the ledger, composition with hyper) snapped its full height
// into the pile and shoved every card below in one frame, so a growIn mount eases from 0.
// The leaving side stays a snap — animating an unmount needs exit-hold machinery (the
// accordion-clone lessons), not a casual add.
//
// ⚠️ FOLLOW, DON'T FIGHT: the pile already has animators — the pager pins and eases heights
// through a sibling slide, Radix disclosures run .disclose-panel inside card bodies. Their
// tell is that the content is STILL MOVING one frame later — so every would-be ease first
// waits ONE rAF and re-measures: still changing → a foreign animator owns this box, adopt
// silently and let it play (nothing was stretched, so the pager's pinned height is never
// touched); stable → the change was a discrete snap, ease it. (Review find, 2026-09-05: the
// earlier rapid-streak heuristic sat BEHIND the own-animation echo guard and could never
// accumulate, so the first frame of a pager slide got captured into a 0.65s ease whose
// cleanup then wiped the pager's pin mid-slide.) The cost is one frame of latency on a real
// snap — invisible, and it also absorbs the mount-shell-then-rows double pass into a single
// correctly-targeted ease.

export default function HeightEase({
  children,
  className,
  growIn = false,
}: { children: ReactNode; className?: string; growIn?: boolean }) {
  const outer = useRef<HTMLDivElement>(null);
  const inner = useRef<HTMLDivElement>(null);
  const anim = useRef<Animation | null>(null);
  const confirm = useRef(0);
  const stretched = useRef<HTMLElement[]>([]);
  const last = useRef(-1);
  const growInRef = useRef(growIn);
  growInRef.current = growIn;
  useLayoutEffect(() => {
    const o = outer.current!;
    const i = inner.current!;
    const clearStyles = () => {
      o.style.overflow = "";
      o.style.overflowClipMargin = "";
      i.style.height = "";
      for (const el of stretched.current) {
        el.style.height = "";
        el.style.overflow = "";
      }
      stretched.current = [];
    };
    const ro = new ResizeObserver(() => {
      // Self-driven echo: our own animation resizes `inner` every frame. The clear at the
      // end lets the next real measurement through.
      if (anim.current) return;
      const h = i.offsetHeight;
      if (h === last.current) return;
      const first = last.current < 0;
      if (first && (!growInRef.current || h === 0)) {
        last.current = h;
        return;
      }
      const from = first ? 0 : last.current;
      last.current = h;
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
      // The one-frame confirmation (see the follow-don't-fight note above): a foreign
      // animator shows up as the height still moving next frame.
      cancelAnimationFrame(confirm.current);
      confirm.current = requestAnimationFrame(() => {
        confirm.current = 0;
        const h2 = i.offsetHeight;
        if (h2 !== h) {
          last.current = h2;
          return;
        }
      const root = getComputedStyle(document.documentElement);
      const ms = (parseFloat(root.getPropertyValue("--tempo-roll")) || 0.65) * 1000;
      const ease = root.getPropertyValue("--ease-roll").trim() || "ease-out";
      // Stretch the WHOLE chain so the CARD's border tracks the eased box: inner, every
      // intermediate wrapper (a keyed swap div, the pager's gesture wrapper — percentage
      // heights resolve against `auto` as content height, so ONE unstretched link parks the
      // panel at its natural size while the box eases around it; measured as a frozen panel
      // bottom under a moving outer), and the outermost panel itself, which also clips its
      // own overflowing content (an element's overflow clips descendants, never its own
      // border or shadow).
      o.style.overflow = "clip";
      o.style.overflowClipMargin = "18px";
      i.style.height = "100%";
      const panel = i.querySelector<HTMLElement>(".ig-panel, .rail-entry");
      if (panel) {
        const chain: HTMLElement[] = [];
        for (let el: HTMLElement | null = panel; el && el !== i; el = el.parentElement) chain.push(el);
        for (const el of chain) el.style.height = "100%";
        panel.style.overflow = "clip";
        stretched.current = chain;
      }
      const a = o.animate([{ height: `${from}px` }, { height: `${h}px` }], {
        duration: ms,
        easing: ease,
      });
      anim.current = a;
      a.onfinish = a.oncancel = () => {
        if (anim.current === a) {
          anim.current = null;
          clearStyles();
        }
      };
      });
    });
    ro.observe(i);
    return () => {
      ro.disconnect();
      cancelAnimationFrame(confirm.current);
      anim.current?.cancel();
    };
  }, []);
  return (
    <div ref={outer} className={className}>
      <div ref={inner}>{children}</div>
    </div>
  );
}
