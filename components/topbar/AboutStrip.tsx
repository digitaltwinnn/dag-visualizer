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
// read live — a view switch while the strip is open re-orients it in place. The typography is the
// retired card's, which /about's own lead set: the lead at full `--foreground` and medium weight
// (two channels, so the distinction survives either face), a hairline dividing it from the
// secondary paragraphs, and those in the muted ink. Prose wants a MEASURE, not the bar's width —
// the block caps at a reading width and sits beside the title on desktop, under it on phone —
// and on phone the row caps its height and scrolls (the filter strip's own rule), so the
// three-paragraph hyper card never takes the screen.
export default function AboutStrip() {
  const mode = useStore((s) => s.mode);
  const { title, lines, caption } = ABOUT[mode];
  // THE EYEBROW IS THE VIEW'S NAME, NOT "ABOUT" (user, 2026-09-28): the button that opened the row
  // already says About, and what the row is about is the view — so the eyebrow names it, the
  // same word the switch and the phone face print. The copy's own `eyebrow` stays for /about.
  const eyebrow = VIEWS.find((v) => v.id === mode)?.name ?? "";
  const Icon = ABOUT_ICON;
  return (
    <div
      className="flex flex-wrap gap-x-8 gap-y-3 mx-2 px-2.5 pb-3 pt-2.5 border-t border-border/60 max-[700px]:max-h-[45vh] max-[700px]:overflow-y-auto max-[700px]:overscroll-contain slim-scroll"
      aria-label={`${eyebrow}: ${title}`}
    >
      {/* THE TITLE BLOCK — the card head's eyebrow-over-title, as the row's first column. */}
      <div className="flex flex-col gap-1 w-[220px] flex-none max-[700px]:w-full">
        <span className="flex items-center gap-2 text-micro tracking-caps uppercase text-muted-foreground">
          <Icon aria-hidden className="size-3.5 text-[var(--filter-accent,var(--primary))]" />
          {eyebrow}
          {caption && <span className="ml-auto text-muted-foreground/70">{caption}</span>}
        </span>
        <span className="text-title font-semibold tracking-[-0.01em] text-foreground">{title}</span>
      </div>
      {/* THE PROSE — lead, hairline, body, at a reading measure. */}
      <div className="flex flex-col gap-2 flex-1 min-w-0 max-w-[68ch]">
        {lines[0] != null && <p className="m-0 text-body text-foreground font-medium">{lines[0]}</p>}
        {lines.length > 1 && <div className="border-b border-border" aria-hidden />}
        {lines.slice(1).map((l, i) => (
          <p key={i} className="m-0 text-body text-muted-foreground">
            {l}
          </p>
        ))}
      </div>
    </div>
  );
}
