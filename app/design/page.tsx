import type { Metadata } from "next";
import AppShell from "@/components/AppShell";

// /design — the internal styleguide (components/docs/DesignDoc.tsx has the content and its
// history; the demo components live beside this route in app/design/). Renders the full
// AppShell with the Design document open as the DocLayer overlay, like /about. Still
// robots-disallowed; carries its OWN title and no canonical (it would point at the marketing
// root otherwise).
export const metadata: Metadata = {
  title: "Design — DAG Visualizer",
  robots: { index: false, follow: false },
  alternates: { canonical: undefined },
};

export default function DesignPage() {
  return <AppShell doc="design" />;
}
