import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Constellation Hypergraph",
  description:
    "Interactive 3D visualizer of the Constellation Network: Global L0, Layer 1, metagraphs and live $DAG snapshots.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
