import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

// tailwind-merge must be TAUGHT the custom @theme utilities (globals.css), or it misclassifies
// them: an unknown `text-*` reads as a text COLOR, so `cn("text-body", "text-muted-foreground")`
// silently DROPPED the size class and the copy fell back to the inherited 16px (the post-sweep
// "huge hints" regression — About-card eyebrows/prose, the dossier Desc). Register the HUD type
// scale as font-size classes (so they merge against each other and text-[..px], and coexist with
// colors), plus the custom tracking/rounded steps so they merge within their own groups too.
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      "font-size": [{ text: ["label", "body", "title", "prose"] }],
      tracking: [{ tracking: ["caps"] }],
      rounded: [{ rounded: ["btn"] }],
    },
  },
});

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** A SMALL CONTROL'S HIT AREA ON TOUCH (user, 2026-10-03: "make it work for touch on mobile /
 *  tablet"). The app's icon controls are 24px by design — the rail is dense and a pointer is
 *  precise — but a fingertip needs about 44. Rather than swell the glyphs and re-compose every row
 *  they sit in, a coarse pointer gets an invisible pseudo 10px larger on each side: the control
 *  LOOKS the same and catches a thumb. `touch:` is the TOUCH TIER (globals.css, 2026-10-09): a
 *  coarse pointer on the phone or tablet tier — so a phone gets it, a touch laptop's desktop rail
 *  does not, and a narrow desktop window under a mouse does not either. Rows are different — they
 *  have the room, so they simply grow (`touch:min-h-11`).
 *  ⚠️ The host must not already use `::after`, and neighbours closer than 20px will overlap their
 *  hit areas — the later one in DOM order wins the shared strip, which is acceptable for a pair. */
export const TOUCH_HIT =
  "touch:relative touch:after:absolute touch:after:-inset-2.5 touch:after:content-['']";
