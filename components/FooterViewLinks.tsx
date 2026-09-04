"use client";
import { useStore } from "@/src/store/store";
import NetLink from "@/components/NetLink";
import { ROUTED_VIEWS } from "@/components/views";

// THE FOOTER'S VIEW LINKS, everywhere (user, 2026-09-04 — "shouldn't a footer be a consistent
// anchor?"): the same three destinations in the same group on the app and the doc pages. The
// difference is the mechanism, and it is the whole reason this is a client island:
//  · on a DOC page (`overDoc`) they are plain anchors into the routed views — entering the
//    visualizer boots the engine on a fresh document, nothing to preserve;
//  · IN-APP a plain anchor would be a full navigation, tearing down and rebooting the WebGL
//    engine for a switch the command bar does as a store write — so a plain left-click commits
//    through setMode instead (RouteSync publishes the URL exactly as it does for the switch),
//    while the real href keeps middle-click / new-tab / copy-link honest.
// Hidden on phone in both worlds (the row would overflow 390px; the header's icon switch and
// the app's own bar carry the views there) — the group hides as ONE span, its separators and
// its trailing divider included, so no dangling mid-dot survives the collapse.
export default function FooterViewLinks({ overDoc }: { overDoc: boolean }) {
  const setMode = useStore((s) => s.setMode);
  return (
    <span className="flex items-center gap-2 max-[700px]:hidden">
      {ROUTED_VIEWS.map((v, i) => (
        <span key={v.id} className="flex items-center gap-2">
          {/* On docs every item leads with a mid-dot (Home stands before the group); in-app the
              group leads the row, so the first item carries none. */}
          {(overDoc || i > 0) && (
            <span aria-hidden className="opacity-40">
              ·
            </span>
          )}
          <NetLink
            href={`/${v.slug}`}
            className="hover:text-foreground transition-colors"
            onClick={
              overDoc
                ? undefined
                : (e) => {
                    // Modified clicks keep native anchor behaviour (new tab etc.).
                    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
                    e.preventDefault();
                    setMode(v.id);
                  }
            }
          >
            {v.name}
          </NetLink>
        </span>
      ))}
      {/* In-app the group's trailing divider rides inside the phone-hidden span; on docs the
          divider stays with the caller, where it must survive the group's collapse to keep
          separating Home from the doc links. */}
      {!overDoc && <span aria-hidden className="w-px self-stretch bg-border mx-0.5" />}
    </span>
  );
}
