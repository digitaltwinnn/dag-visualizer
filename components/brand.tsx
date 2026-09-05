// The brand's ONE waveform — the ECG trace every brand mark draws. Live surfaces animate it
// (components/topbar/EcgMark.tsx, store-subscribed, sweeping beat); static surfaces render it
// still (BrandMark below — the doc pages' header, where a page explaining the product must not
// pretend to carry a feed). One `d` path here so the two can never disagree about the shape;
// there is no var() to share between an SVG `d` and a component, which is why this is a module.
export const BEAT = "M0 12 H10 L13 12 L15 4 L18 20 L21 9 L24 12 H34"; // spike
export const FLAT = "M0 12 H34"; // flatline (EcgMark's NO SIGNAL state)

// The static brand mark: the same waveform, no subscription, no sweeping beat. Every mark on a
// doc page is a logo, not a reading.
export function BrandMark() {
  return (
    <span className="text-primary flex-none" aria-hidden>
      <svg width="34" height="24" viewBox="0 0 34 24" fill="none">
        <path
          d={BEAT}
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity="0.9"
        />
      </svg>
    </span>
  );
}
