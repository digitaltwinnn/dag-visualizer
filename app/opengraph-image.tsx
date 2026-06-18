import { ImageResponse } from "next/og";

// Social-preview card (1200×630). Next attaches it to the OG + Twitter tags from
// metadata. Themed to match the app — dark bg + the glowing cyan core motif.
export const alt = "Constellation Hypergraph — interactive 3D network visualizer";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const CORE = "#2af5ff";
const BG = "#05060e";

export default function OgImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: BG,
          backgroundImage: `radial-gradient(circle at 50% 40%, rgba(42,245,255,0.18), ${BG} 62%)`,
          color: "#e8eefc",
          fontFamily: "sans-serif",
        }}
      >
        {/* the glowing Global L0 core */}
        <div
          style={{
            width: 132,
            height: 132,
            borderRadius: 132,
            marginBottom: 44,
            backgroundImage: `radial-gradient(circle at 50% 45%, #bff7ff, ${CORE} 55%, #1d6fb0)`,
            boxShadow: `0 0 90px 24px rgba(42,245,255,0.55)`,
          }}
        />
        <div style={{ fontSize: 72, fontWeight: 800, letterSpacing: -1 }}>
          Constellation Hypergraph
        </div>
        <div style={{ fontSize: 30, color: "#8a96b8", marginTop: 18, maxWidth: 880, textAlign: "center" }}>
          Interactive 3D map of the $DAG network: Global L0, Layer 1, metagraphs and live snapshots
        </div>
        {/* dot is a styled div, not a glyph — keeps Satori on its built-in Latin font
            (a bullet/em-dash forces a dynamic font fetch that can fail at build time). */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            marginTop: 40,
            fontSize: 22,
            fontWeight: 700,
            letterSpacing: 1,
            color: "#6ee7b0",
            border: "1px solid rgba(54,226,154,0.45)",
            borderRadius: 24,
            padding: "8px 22px",
          }}
        >
          <div style={{ width: 13, height: 13, borderRadius: 13, backgroundColor: "#6ee7b0" }} />
          <div>LIVE / mainnet</div>
        </div>
      </div>
    ),
    { ...size },
  );
}
