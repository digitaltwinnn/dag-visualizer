"use client";

import { useEffect } from "react";
import { initNetwork } from "@/src/data/network";

// Kicks off the live data layer once, client-side. Renders nothing — it just bridges
// NetworkData → the store. Safe under StrictMode (initNetwork is idempotent).
export default function DataBridge() {
  useEffect(() => {
    initNetwork();
  }, []);
  return null;
}
