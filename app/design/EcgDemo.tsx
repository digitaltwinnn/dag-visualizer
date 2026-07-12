"use client";

// EcgMark reads `live` from the store and flatlines when the feed is down (its NO-SIGNAL state).
// /design has no data feed, so `live` is false and it would render a flatline — force it live
// here so the demo shows the beating trace (this standalone page has no other store consumers).
import { useEffect, useState } from "react";
import { useStore } from "@/src/store/store";
import EcgMark from "@/components/topbar/EcgMark";

export default function EcgDemo() {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    useStore.setState({ live: true });
    setReady(true);
  }, []);
  // Render after the store flip so the first paint isn't the flatline.
  return ready ? <EcgMark /> : null;
}
