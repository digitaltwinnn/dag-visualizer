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
    <div className="panel-head">
      <div className="panel-head-titles">
        {eyebrow && <span className="panel-eyebrow">{eyebrow}</span>}
        <h2>{title}</h2>
      </div>
      <div className="panel-head-aside">
        {caption != null && <span className="panel-cap">{caption}</span>}
        {onToggle && (
          <button
            className="panel-collapse"
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
