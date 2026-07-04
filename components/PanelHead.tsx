"use client";

// The one header used by every rail panel (Filter / Learn / Leaderboard) so they
// read as one control surface. Title (+ optional scope eyebrow) on the left; an
// optional caption and/or collapse toggle on the right. Collapse is uniform: pass
// `collapsed` + `onToggle` and the panel shows a +/− that hides its `.panel-body`.
export default function PanelHead({
  title,
  eyebrow,
  caption,
  collapsed,
  onToggle,
}: {
  title: string;
  eyebrow?: string;
  caption?: React.ReactNode;
  collapsed?: boolean;
  onToggle?: () => void;
}) {
  return (
    <div className="flex items-start justify-between gap-2 py-[var(--panel-pad-y)] px-[var(--panel-pad-x)] border-b border-border">
      <div className="flex flex-col gap-[3px] min-w-0">
        {eyebrow && (
          <span className="block text-[8.5px] font-bold tracking-[0.1em] uppercase text-accent leading-none">
            {eyebrow}
          </span>
        )}
        <h2 className="m-0 text-[15px] font-semibold leading-[1.2] inline-flex items-center gap-2 min-w-0 before:content-[''] before:flex-none before:w-[9px] before:h-[9px] before:rounded-full before:bg-[var(--filter-accent,var(--accent))]">
          {title}
        </h2>
      </div>
      <div className="flex items-center gap-1.5 flex-none pt-px">
        {caption != null && (
          <span className="text-[10.5px] text-muted-foreground text-right tabular-nums">{caption}</span>
        )}
        {onToggle && (
          <button
            className="bg-transparent border-none text-muted-foreground text-[18px] leading-none cursor-pointer w-5 h-[18px] p-0 hover:text-foreground"
            title={collapsed ? "Expand" : "Collapse"}
            aria-expanded={!collapsed}
            onClick={onToggle}
          >
            {collapsed ? "+" : "–"}
          </button>
        )}
      </div>
    </div>
  );
}
