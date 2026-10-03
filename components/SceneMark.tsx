"use client";

import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { IDENT_INK } from "@/components/identInk";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

// THE MARK A SCENE LABEL WEARS BEFORE ITS NAME — the one its subject's CARD wears before its
// title (user, 2026-10-03): the cube, the stacked cubes, the globe, the pin, the server, or a
// network's logo. Shared by the two scene-anchored labels, the subject callout and the hover
// card (one species, one container — `SCENE_GLASS`), so a thing reads as the same thing whether
// the pointer is over it, it is selected, or its card is open. The glyph comes from
// `iconForPick`, the cards' own glyph home; this component only draws it.
export type SceneMarkSpec =
  | { icon: LucideIcon; hue: string }
  | { logo: string | undefined; monogram: string; hue: string };

export function SceneMark({ mark }: { mark: SceneMarkSpec }) {
  if ("icon" in mark) {
    const Icon = mark.icon;
    return <Icon aria-hidden className="flex-none size-[15px]" style={{ color: mark.hue }} />;
  }
  return (
    <Avatar className="size-4 flex-none">
      {mark.logo && <AvatarImage src={mark.logo} alt="" />}
      <AvatarFallback className={cn("text-[9px] font-bold", IDENT_INK)} style={{ color: mark.hue }}>
        {mark.monogram.slice(0, 1)}
      </AvatarFallback>
    </Avatar>
  );
}
