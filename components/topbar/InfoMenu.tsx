"use client";

import { Check } from "lucide-react";
import { SELECTED_ROW } from "@/components/selection";
import { useStore } from "@/src/store/store";
import NetLink from "@/components/NetLink";
import { DOC_ICONS } from "@/components/icons";
import { DOC_PAGES, DOC_PATHS, type DocPage } from "@/components/views";
import { cn } from "@/lib/utils";

// The doc-page rows — SECTION of the SettingsMenu since 2026-09-08 (user consolidation; the
// circled-i popover this file carried retired with it). Originally the bar's doc menu (user,
// 2026-09-04 — "they are views but not at the same level of importance"): one rank below the
// view switch, exactly as their importance is. Rows are the same store toggles the footer's
// DocToggles are (real hrefs keep middle-click/new-tab honest; a plain click flips the overlay
// in place, and clicking the open page's row closes it).
export default function DocRows({ onDone }: { onDone: () => void }) {
  const doc = useStore((s) => s.docPage);
  const setDocPage = useStore((s) => s.setDocPage);
  return (
    <>
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
              onDone();
            }}
          >
            <RowIcon aria-hidden className="size-4 flex-none opacity-80" />
            <span className="flex-1 text-left">{DOC_PAGES[id].label}</span>
            {current && <Check aria-hidden className="size-3.5 flex-none opacity-70" />}
          </NetLink>
        );
      })}
    </>
  );
}
