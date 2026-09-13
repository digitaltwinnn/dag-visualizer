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
// ⚠️ THE PIN LANDS BEFORE PAINT. The observer fires after layout and before the frame is
// painted; the confirmation rAF below it runs a whole frame later. Everything that keeps the
// box from showing its destination must therefore happen in the OBSERVER — see the pin note
// at the `o.style.height = from` line for what that fixed and why the stretch chain stays
// behind in the confirmation frame.
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
  settleKey,
}: { children: ReactNode; className?: string; growIn?: boolean; settleKey?: string }) {
  const outer = useRef<HTMLDivElement>(null);
  const inner = useRef<HTMLDivElement>(null);
  const anim = useRef<Animation | null>(null);
  const fade = useRef<Animation | null>(null);
  const confirm = useRef(0);
  const stretched = useRef<HTMLElement[]>([]);
  const last = useRef(-1);
  const growInRef = useRef(growIn);
  growInRef.current = growIn;
  // ⚠️ THE ARRIVAL IS A STATED FACT, NOT AN INFERRED ONE (user, 2026-09-13: "don't make it a
  // timing fix but do it structurally"). `settleKey` names WHAT THIS SLOT IS SHOWING — the
  // ladder passes its rung's tier. When it changes, the slot's occupant has been replaced, and
  // the replacement must ARRIVE rather than appear already finished.
  //
  // The first cut expressed that in CSS, as `tierSettleIn`/`tierSettleOut` keyframes restarting
  // because React happened to swap the inner element's type. Two things were wrong with it and
  // neither was the look: the trigger was an ACCIDENT of reconciliation (reuse the element and
  // the arrival silently stops happening; recreate one for any other reason and it fires when
  // nothing changed), and the fade ran on its own CSS clock that merely READ the same token as
  // the height — two animations agreeing by convention, free to drift the moment either is
  // retuned. Now the fact comes down as a prop and the fade is started by the same code, in the
  // same tick, with the same duration and easing object as the height. They cannot disagree.
  //
  // The flag is raised in a LAYOUT EFFECT, not during render: a render may be thrown away under
  // concurrent rendering, and an arrival armed by a discarded render would fire on the next
  // unrelated resize. Layout effects run after the commit and before the browser's layout step,
  // so the flag is always up before the observer below can read it in the same frame.
  const settleRef = useRef(settleKey);
  const arriving = useRef(false);
  useLayoutEffect(() => {
    if (settleRef.current === settleKey) return;
    settleRef.current = settleKey;
    arriving.current = true;   // consumed by the next ease; a mount never arms it
  }, [settleKey]);
  useLayoutEffect(() => {
    const o = outer.current!;
    const i = inner.current!;
    const clearStyles = () => {
      i.style.opacity = "";
      o.style.height = "";
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
      // ⚠️ PIN TO THE OLD HEIGHT *HERE*, IN THE OBSERVER, NOT IN THE CONFIRMATION FRAME
      // (user, 2026-09-13: "it briefly expands/snaps to its full height already before
      // starting the smooth grow towards its height"). An RO callback runs after layout and
      // BEFORE paint; the confirmation rAF below runs a whole frame later. So the frame that
      // changed the content used to PAINT at the new full height, and only the frame after
      // that dropped back to `from` and began easing — one 16ms flash of the destination,
      // then a jump backwards. It also explained the second half of the same report ("the
      // bottom cards section appears immediately"): in that flash frame every card below had
      // already been pushed to its final place, and they snapped back with it.
      //
      // Pinning the BOX before paint is enough to erase it. Only `o`'s own height and clip
      // are touched — never the stretch chain, which stays in the confirmation frame below,
      // so the follow-don't-fight guarantee is unchanged: a foreign animator's pin is still
      // never written by us, and the pin here is released the moment one is detected.
      o.style.height = `${from}px`;
      o.style.overflow = "clip";
      o.style.overflowClipMargin = "18px";
      // The one-frame confirmation (see the follow-don't-fight note above): a foreign
      // animator shows up as the height still moving next frame.
      cancelAnimationFrame(confirm.current);
      confirm.current = requestAnimationFrame(() => {
        confirm.current = 0;
        // `i` is not stretched yet, so this still reads the CONTENT's natural height —
        // the pin above constrains `o` alone.
        const h2 = i.offsetHeight;
        if (h2 !== h) {
          last.current = h2;
          clearStyles(); // a foreign animator owns this box — hand it straight back
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
      // The pin's base value becomes the DESTINATION now, so the moment the (fill: none)
      // animation finishes the inline height already equals what it rendered — clearStyles
      // then drops to `auto` with nothing to flash through.
      o.style.height = `${h}px`;
      i.style.height = "100%";
      const panel = i.querySelector<HTMLElement>(".ig-panel, .rail-entry");
      if (panel) {
        const chain: HTMLElement[] = [];
        for (let el: HTMLElement | null = panel; el && el !== i; el = el.parentElement) chain.push(el);
        for (const el of chain) el.style.height = "100%";
        panel.style.overflow = "clip";
        stretched.current = chain;
      }
      const timing = { duration: ms, easing: ease };
      const a = o.animate([{ height: `${from}px` }, { height: `${h}px` }], timing);
      anim.current = a;
      // THE ARRIVAL, on the height's own clock. `i` is HeightEase's OWN wrapper, never the
      // card — so this can never collide with what the card does with its own opacity (the
      // ladder's entries carry `--entry-dim` there, and the two simply multiply). Started in
      // this same tick from the same `timing`, so the slot's resize and its occupant's arrival
      // are one gesture by construction rather than by agreement.
      if (arriving.current) {
        arriving.current = false;
        i.style.opacity = "1";
        fade.current = i.animate([{ opacity: 0 }, { opacity: 1 }], timing);
      }
      a.onfinish = a.oncancel = () => {
        if (anim.current === a) {
          anim.current = null;
          fade.current?.cancel();
          fade.current = null;
          clearStyles();
        }
      };
      });
    });
    ro.observe(i);
    return () => {
      ro.disconnect();
      cancelAnimationFrame(confirm.current);
      fade.current?.cancel();
      anim.current?.cancel();
    };
  }, []);
  return (
    <div ref={outer} className={className}>
      <div ref={inner}>{children}</div>
    </div>
  );
}
