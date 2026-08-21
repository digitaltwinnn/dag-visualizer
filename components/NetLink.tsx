"use client";

import { useEffect, useState } from "react";
import { netUrl } from "@/src/net/current";

// An internal link that carries ?net= through (multi-network design §5): navigating to /about
// or /design on a dev network must not snap the accent back to mainnet cyan. The href starts
// as the bare mainnet path on the server AND the client's first render (so hydration sees no
// mismatch — React 19 answers one by regenerating the tree, which strips the pre-paint
// data-net stamp off <html>), then a mount effect swaps in the ?net= form as a real update.
// suppressHydrationWarning was tried first and is NOT equivalent: it keeps the SERVER value,
// so the link never gains the param at all.
export default function NetLink({
  href,
  ...rest
}: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) {
  const [h, setH] = useState(href);
  useEffect(() => setH(netUrl(href)), [href]);
  return <a {...rest} href={h} />;
}
