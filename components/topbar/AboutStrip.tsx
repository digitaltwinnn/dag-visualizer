"use client";

import { ABOUT } from "@/components/aboutCopy";
import { ABOUT_ICON } from "@/components/icons";
import { VIEWS } from "@/components/views";
import { useStore } from "@/src/store/store";

// "ABOUT THIS VIEW" AS A STRIP TENANT (2026-09-28) — the command bar's fourth grow-downward row,
// opened by the info button in the bar's view-scoped island. It replaced the left rail's About
// card, which had led every Explore rail since 2026-08-08 and read out of place there (user: "the
// static about card is a bit out-of-place on the left column … about belongs where?"). The HUD's
// four zones are instruments — the bar holds global state, the left rail interaction, the right
// rail the facts of a committed subject, the band readings — and orientation PROSE is none of
// those: it is documentation, whose one home is /about. This tenant is the in-view door to it,
// one tap away and closed by default, beside the ECG's "how live is this app" strip: the bar
// already holds the view's name, so "what is this view" belongs under the same glass.
//
// The copy is `ABOUT[mode]`, the ONE home shared with /about's "What you can explore" section,
// read live — a view switch while the strip is open re-orients it in place. Prose wants a MEASURE,
// not the bar's width, and on phone the row caps its height and scrolls (the filter strip's own
// rule), so a long paragraph never takes the screen.
// LAYOUT D1 (user's pick, 2026-09-29, over the two-column B): the head STACKED above ONE
// paragraph. The copy became one passage per view in the same round, so there is nothing to split
// into columns or into a lead and secondaries — one voice at one weight, set to a reading measure
// (72ch) rather than the bar's width — and that column is CENTRED in the bar (user, 2026-09-29:
// left-aligned, the bar's right half was empty glass). The text inside stays left-aligned: a
// ragged-left paragraph reads worse than the space it would fill. On phone the row still caps its
// height and scrolls.
export default function AboutStrip() {
  const mode = useStore((s) => s.mode);
  const { title, text, caption } = ABOUT[mode];
  // THE EYEBROW IS "<THE VIEW'S NAME> VIEW", NOT "ABOUT" (user, 2026-09-28, two rounds): the
  // button that opened the row already says About, and what the row is about is the view — so
  // the eyebrow names it, the switch's own word plus "view" so it reads as a place rather than a
  // bare label. The copy's own `eyebrow` stays for /about.
  const eyebrow = `${VIEWS.find((v) => v.id === mode)?.name ?? ""} view`;
  const Icon = ABOUT_ICON;
  return (
    <div
      className="flex flex-col items-center mx-2 px-2.5 pb-3.5 pt-3 border-t border-border/60 max-[700px]:max-h-[45vh] max-[700px]:overflow-y-auto max-[700px]:overscroll-contain slim-scroll"
      role="region"
      aria-label={`${eyebrow}: ${title}`}
    >
      {/* ONE column for head and text, measured in the PARAGRAPH's type (`text-body` here, so the
          `ch` is the body's): two separately-capped blocks resolved 72ch at two font sizes and
          centred to different left edges (measured 560 vs 657px). */}
      <div className="flex flex-col gap-2.5 w-full max-w-[72ch] min-w-0 text-body">
      <div className="flex flex-col gap-1 min-w-0">
        <span className="flex items-center gap-2 text-micro tracking-caps uppercase text-muted-foreground">
          <Icon aria-hidden className="size-3.5 text-[var(--filter-accent,var(--primary))]" />
          {eyebrow}
          {caption && <span className="ml-auto text-muted-foreground/70">{caption}</span>}
        </span>
        <span className="text-title font-semibold tracking-[-0.01em] text-foreground">{title}</span>
      </div>
      <p className="m-0 leading-relaxed text-foreground-dim">{text}</p>
      </div>
    </div>
  );
}
