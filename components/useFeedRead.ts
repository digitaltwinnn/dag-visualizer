"use client";

import { useEffect } from "react";
import type { FeedId } from "@/src/data/api";
import { holdFeed } from "@/src/data/feedUse";

/** THIS SURFACE READS THESE FEEDS — held while it is mounted and `on` (src/data/feedUse.ts has
 *  the rule). A HUD surface mounts only in the view it belongs to, so the view needs no stating.
 *  `components/feedReadBoundary.test.ts` requires every file that reads a feed's data to call it. */
export function useFeedRead(feeds: readonly FeedId[], who: string, on = true): void {
  const key = feeds.join(",");
  useEffect(() => {
    if (!on) return;
    const releases = key.split(",").map((f) => holdFeed(f as FeedId, who));
    return () => releases.forEach((r) => r());
  }, [key, who, on]);
}
