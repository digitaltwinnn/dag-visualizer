"use client";

import { netUrl } from "@/src/net/current";

// An internal link that carries ?net= through (multi-network design §5): navigating to /about
// or /design on a dev network must not snap the accent back to mainnet cyan. A client
// component because the network is a page parameter only the browser knows —
// suppressHydrationWarning covers the one-attribute difference: the server renders the
// mainnet href (no location during SSR) and the client corrects it on hydration.
export default function NetLink({
  href,
  ...rest
}: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) {
  return <a suppressHydrationWarning {...rest} href={netUrl(href)} />;
}
