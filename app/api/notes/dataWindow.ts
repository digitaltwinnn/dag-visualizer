import { HOSTS } from "@/src/engine/config";
import { cachedExact } from "../snapshot/cachedExact";
import { DATA_NOTE_TICKS, type DataTickRead } from "@/src/data/noteFactsData";

// THE DATA BLOCKS' WINDOW, FOR THE DATA BLOCKS NOTE — the live half of its facts
// (`noteFactsData.ts`): the newest `DATA_NOTE_TICKS` global snapshots' exact reads, the same window
// the chamber holds (option 2, user 2026-11-07: "let's see if it holds up w.r.t. costs"). Read when the
// note is written, at most hourly, through the route's own day-long cache (`cachedExact`), so a tick
// a visitor's tab already read costs nothing here, and one the note reads first is served to the
// next visitor from the cache. `POOL` reads run at once, as the client's own pool does.
//
// HONESTY (rule 10): a tick whose read fails is NOT READ (`rows: null`) — the facts state the window
// over the ticks read, as a floor — and a failed latest-ordinal read answers an empty window: no note
// rather than a note about nothing.

export interface DataWindowRead {
  ticks: DataTickRead[];
  /** The window's stretch, from the oldest tick's time to the newest's, or null when unread. */
  fromMs: number | null;
  toMs: number | null;
}

const POOL = 8;

async function globalAt(ordinal: number | "latest"): Promise<{ ordinal: number; timestamp: string } | null> {
  try {
    const r = await fetch(`${HOSTS.be}/global-snapshots/${ordinal}`, { headers: { Accept: "application/json" }, cache: "no-store", signal: AbortSignal.timeout(6000) });
    if (!r.ok) return null;
    const d = ((await r.json()) as { data?: { ordinal?: unknown; timestamp?: unknown } }).data;
    return typeof d?.ordinal === "number" && typeof d?.timestamp === "string" ? { ordinal: d.ordinal, timestamp: d.timestamp } : null;
  } catch {
    return null;
  }
}

/** The newest window's exact reads, newest first. */
export async function readDataWindow(ticks: number = DATA_NOTE_TICKS): Promise<DataWindowRead> {
  const latest = await globalAt("latest");
  if (!latest) return { ticks: [], fromMs: null, toMs: null };
  const ordinals = Array.from({ length: ticks }, (_, i) => latest.ordinal - i).filter((o) => o > 0);
  const out: DataTickRead[] = [];
  for (let i = 0; i < ordinals.length; i += POOL) {
    const batch = await Promise.all(
      ordinals.slice(i, i + POOL).map(async (ordinal) => {
        try {
          return { ordinal, rows: (await cachedExact(ordinal)).rows };
        } catch {
          return { ordinal, rows: null };
        }
      }),
    );
    out.push(...batch);
  }
  const oldest = ordinals.length ? await globalAt(ordinals[ordinals.length - 1]!) : null;
  return { ticks: out, fromMs: oldest ? Date.parse(oldest.timestamp) : null, toMs: Date.parse(latest.timestamp) };
}
