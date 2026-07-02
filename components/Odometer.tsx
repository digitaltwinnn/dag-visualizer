"use client";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { formatVital } from "@/src/util/odometer";

// A headline numeric that roll-animates when its value changes: the old text slides up and
// out while the new slides in from below. Reduced-motion (or first paint) swaps instantly.
export default function Odometer({
  value,
  className,
}: {
  value: number | null | undefined;
  className?: string;
}) {
  const next = formatVital(value);
  const [shown, setShown] = useState(next);
  const [prev, setPrev] = useState<string | null>(null);
  const first = useRef(true);
  const shownRef = useRef(shown);
  useEffect(() => {
    shownRef.current = shown;
  });

  useEffect(() => {
    if (first.current) {
      first.current = false;
      setShown(next);
      return;
    }
    if (next === shownRef.current) return;
    const reduce =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) {
      setShown(next);
      return;
    }
    setPrev(shownRef.current);
    setShown(next);
    const t = setTimeout(() => setPrev(null), 420); // matches the roll keyframe
    return () => clearTimeout(t);
  }, [next]);

  return (
    <span className={cn("odometer", className)} aria-label={next} aria-live="polite" role="status">
      {prev !== null && <span className="odometer-out" aria-hidden>{prev}</span>}
      <span className={prev !== null ? "odometer-in" : undefined}>{shown}</span>
    </span>
  );
}
