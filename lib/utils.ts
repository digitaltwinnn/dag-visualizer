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
      "font-size": [{ text: ["micro", "label", "body", "title"] }],
      tracking: [{ tracking: ["caps"] }],
      rounded: [{ rounded: ["btn"] }],
    },
  },
});

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
