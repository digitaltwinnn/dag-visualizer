// A quiet notice that the app is a work in progress — pinned at the very top, above the command
// bar. Static + presentational; no state.
export default function ExperimentalBanner() {
  return (
    <div id="experimental-banner" role="note">
      Experimental — a community-built project, not affiliated with or part of the official Constellation Network
    </div>
  );
}
