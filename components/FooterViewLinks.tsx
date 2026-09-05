"use client";
import { useStore } from "@/src/store/store";
import NetLink from "@/components/NetLink";
import { ROUTED_VIEWS } from "@/components/views";

// THE FOOTER'S VIEW LINKS (user, 2026-09-04 — "shouldn't a footer be a consistent anchor?"):
// the same three destinations on every surface. A plain left-click COMMITS through the store —
// a real navigation would tear down and reboot the WebGL engine for a switch the command bar
// does as a store write, and setMode also closes any open doc overlay, so from /about a view
// link lands straight in the scene. The real href keeps middle-click / new-tab / copy-link
// honest. Hidden on phone (the row would overflow 390px; the bar's own switch carries the views
// there) — the group hides as ONE span, separators included, so no dangling mid-dot survives.
export default function FooterViewLinks() {
  const setMode = useStore((s) => s.setMode);
  return (
    <span className="flex items-center gap-2 max-[700px]:hidden">
      {ROUTED_VIEWS.map((v, i) => (
        <span key={v.id} className="flex items-center gap-2">
          {i > 0 && (
            <span aria-hidden className="opacity-70 text-muted-foreground">
              ·
            </span>
          )}
          <NetLink
            href={`/${v.slug}`}
            className="hover:text-foreground transition-colors"
            onClick={(e) => {
              // Modified clicks keep native anchor behaviour (new tab etc.).
              if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
              e.preventDefault();
              setMode(v.id);
            }}
          >
            {v.name}
          </NetLink>
        </span>
      ))}
      {/* The group's trailing BETWEEN-GROUPS hairline rides inside the phone-hidden span, so
          the collapse takes its divider with it (short + self-centred — never self-stretch,
          which ran through the tucked strip). */}
      <span aria-hidden className="w-px h-3.5 self-center bg-muted-foreground/35" />
    </span>
  );
}
