// A quiet notice that the app is a work in progress — pinned at the very top, above the command
// bar. Static + presentational; no state. Full disclaimer stays visible (honesty); restrained
// Instrument-Glass ribbon, restrained amber accent.
export default function ExperimentalBanner() {
  return (
    <div id="experimental-banner" role="note">
      <span className="xb-mark" aria-hidden>△</span>
      <span className="xb-label">Experimental</span>
      <span className="xb-note">unofficial community project — not affiliated with the official Constellation Network</span>
    </div>
  );
}
