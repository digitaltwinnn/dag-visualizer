"use client";
import { switchLedgerRegister } from "@/src/store/applyClickActions";
import { useStore } from "@/src/store/store";
import NetLink from "@/components/NetLink";
import { BLOCKS_PAGE, LISTED_VIEWS } from "@/components/views";

// THE FOOTER'S VIEW LINKS (user, 2026-09-04 — "shouldn't a footer be a consistent anchor?"):
// the same three destinations on every surface. A plain left-click COMMITS through the store —
// a real navigation would tear down and reboot the WebGL engine for a switch the command bar
// does as a store write, and setMode also closes any open doc overlay, so from /about a view
// link lands straight in the scene. The real href keeps middle-click / new-tab / copy-link
// honest. Hidden BELOW THE DESKTOP TIER (the bar's own switch carries the views there) — on phone
// the row would overflow 390px, and on a 900px tablet it ran 885px into an 868px strip, so
// "Source code" and the project tag each broke onto two lines (test pass, 2026-10-03). The group
// hides as ONE span, separators included, so no dangling mid-dot survives.
export default function FooterViewLinks() {
  const setMode = useStore((s) => s.setMode);
  // The Blocks register follows its view, Snapshots: a destination of its own in the footer, though
  // the bar's switch holds no sixth button.
  const links = LISTED_VIEWS.flatMap((v) => [
    { key: v.id, name: v.name, slug: v.slug, mode: v.id, register: "snapshots" as const },
    ...(v.id === "ledger" ? [{ key: BLOCKS_PAGE.slug, name: BLOCKS_PAGE.name, slug: BLOCKS_PAGE.slug, mode: v.id, register: "blocks" as const }] : []),
  ]);
  return (
    <span className="flex items-center gap-2 max-[1100px]:hidden">
      {links.map((v, i) => (
        <span key={v.key} className="flex items-center gap-2">
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
              setMode(v.mode);
              if (v.mode === "ledger") switchLedgerRegister(v.register);
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
