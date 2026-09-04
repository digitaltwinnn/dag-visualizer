"use client";

import { useState } from "react";
import { Check, ChevronDown, Info } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { SELECTED_ROW } from "@/components/selection";
import { useStore } from "@/src/store/store";
import NetLink from "@/components/NetLink";
import { DOC_ICONS } from "@/components/icons";
import { DOC_PAGES, DOC_PATHS, type DocPage } from "@/components/views";
import { cn } from "@/lib/utils";

// THE BAR'S DOC MENU (user, 2026-09-04 — "they are views but not at the same level of
// importance"): the doc pages get a top-bar home WITHOUT joining the view switch — a quiet
// circled-i popover in the right control zone, the NetworkSwitch/ThemeToggle idiom, one rank
// below the views exactly as their importance is. Rows are the same store toggles the footer's
// DocToggles are (real hrefs keep middle-click/new-tab honest; a plain click flips the overlay
// in place, and clicking the open page's row closes it). Phone declines it — the footer's
// About · Design row is the doc home there, and the bar has no width to spare.
export default function InfoMenu() {
  const doc = useStore((s) => s.docPage);
  const setDocPage = useStore((s) => s.setDocPage);
  const [open, setOpen] = useState(false);
  // The trigger wears the OPEN page's own mark (the ThemeToggle idiom — FACE[pref]): About's
  // circled-i doubles as the resting face, Design shows the swatch book, and the accent tint
  // says "currently doing something" either way.
  const Face = doc ? DOC_ICONS[doc] : Info;
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={doc ? `Pages: ${DOC_PAGES[doc].label} open` : "Pages: About and Design"}
          className={cn(
            "group flex flex-none items-center gap-1 h-9 py-1.5 px-2.5 rounded-btn! pointer-coarse:min-h-11",
            "bg-transparent border-0 text-muted-foreground hover:text-foreground hover:bg-wash-soft",
            // The trigger goes accent while a doc covers the scene — the same "this control is
            // currently doing something" word the FILTER and RAW labels speak.
            doc != null && "text-primary",
          )}
        >
          <Face aria-hidden className="size-4" />
          <ChevronDown aria-hidden className="size-3.5 opacity-70" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" sideOffset={8} className="w-56 p-1.5">
        {(Object.keys(DOC_PAGES) as DocPage[]).map((id) => {
          const RowIcon = DOC_ICONS[id];
          const current = doc === id;
          return (
            <NetLink
              key={id}
              href={DOC_PATHS[id]}
              aria-current={current ? "page" : undefined}
              className={cn(
                "flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-label no-underline",
                "text-muted-foreground hover:text-foreground hover:bg-wash-soft",
                current && SELECTED_ROW,
              )}
              onClick={(e) => {
                if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
                e.preventDefault();
                setDocPage(current ? null : id);
                setOpen(false);
              }}
            >
              <RowIcon aria-hidden className="size-4 flex-none opacity-80" />
              <span className="flex-1 text-left">{DOC_PAGES[id].label}</span>
              {current && <Check aria-hidden className="size-3.5 flex-none opacity-70" />}
            </NetLink>
          );
        })}
      </PopoverContent>
    </Popover>
  );
}
