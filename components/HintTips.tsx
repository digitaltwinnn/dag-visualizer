"use client";

// STYLED TITLE HINTS (user, 2026-08-16 — "we didn't style the html type of hint you see when
// you hover a button; can that be styled according to our design"): the native `title` bubble
// is OS chrome and cannot be styled, so ONE delegated layer replaces it. On hover or keyboard
// focus of any `[title]` element the attribute moves to `data-hint` — a one-way, idempotent
// move that suppresses the native bubble — and this component renders the same text in the
// house register after the native-like delay. Delegation is the point: every current and
// future `title=` in the app inherits the design for free, and the copy stays exactly where
// it is authored.
//
// A11y: moving `title` off an element could strip an icon-only control's accessible name, so
// the move copies it to `aria-label` when the element has neither a label nor text of its own.
// Keyboard focus shows the hint too — more than the native behaviour ever offered.
//
// Not a control (pointer-events-none), STEADY once shown (no hold/fade — the useMinHold rule
// is for transient signals), and it never fights the app's own custom tooltips: the scene
// Tooltip, the callout and the strip tip render no `title` of their own.
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

const DELAY_MS = 450;
const GAP = 8; // hint offset from the element's edge

interface Hint {
  text: string;
  x: number;
  y: number;
}

export default function HintTips() {
  const [hint, setHint] = useState<Hint | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const anchor = useRef<Element | null>(null);

  useEffect(() => {
    const cancel = () => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = null;
      anchor.current = null;
      setHint(null);
    };

    const arm = (el: Element) => {
      // One-way move: title → data-hint (kills the native bubble forever on this element).
      const t = el.getAttribute("title");
      if (t) {
        el.setAttribute("data-hint", t);
        el.removeAttribute("title");
        // Preserve the accessible name an icon-only control derived from its title.
        if (!el.getAttribute("aria-label") && !(el.textContent || "").trim()) el.setAttribute("aria-label", t);
      }
      const text = el.getAttribute("data-hint");
      if (!text) return;
      if (timer.current) clearTimeout(timer.current);
      anchor.current = el;
      timer.current = setTimeout(() => {
        if (anchor.current !== el || !el.isConnected) return;
        const r = el.getBoundingClientRect();
        // Below the element, clamped to the viewport; flips above when there's no room.
        const x = Math.min(Math.max(8, r.left), innerWidth - 328);
        const below = r.bottom + GAP;
        const y = below + 60 > innerHeight ? Math.max(8, r.top - GAP - 40) : below;
        setHint({ text, x, y });
      }, DELAY_MS);
    };

    const over = (e: Event) => {
      const el = (e.target as Element | null)?.closest?.("[title], [data-hint]");
      if (!el) return;
      if (anchor.current === el) return;
      arm(el);
    };
    const out = (e: MouseEvent) => {
      const el = anchor.current;
      if (!el) return;
      const to = e.relatedTarget as Node | null;
      if (to && el.contains(to)) return;
      cancel();
    };
    const focusin = (e: Event) => over(e);
    const focusout = () => cancel();

    document.addEventListener("mouseover", over, true);
    document.addEventListener("mouseout", out, true);
    document.addEventListener("focusin", focusin, true);
    document.addEventListener("focusout", focusout, true);
    document.addEventListener("pointerdown", cancel, true);
    document.addEventListener("scroll", cancel, true);
    window.addEventListener("blur", cancel);
    return () => {
      document.removeEventListener("mouseover", over, true);
      document.removeEventListener("mouseout", out, true);
      document.removeEventListener("focusin", focusin, true);
      document.removeEventListener("focusout", focusout, true);
      document.removeEventListener("pointerdown", cancel, true);
      document.removeEventListener("scroll", cancel, true);
      window.removeEventListener("blur", cancel);
      cancel();
    };
  }, []);

  if (!hint) return null;
  return createPortal(
    <div
      id="hint-tip"
      role="tooltip"
      className="fixed z-40 pointer-events-none max-w-[320px] rounded-md border border-border bg-[var(--panel-solid)] backdrop-blur-[8px] px-2.5 py-1.5 text-label leading-snug text-muted-foreground whitespace-normal"
      style={{ left: hint.x, top: hint.y }}
    >
      {hint.text}
    </div>,
    document.body,
  );
}
