import { NextResponse } from "next/server";
import { ARCHIVE_SINCE, getArchiveInfo } from "./probe";

// The archive census for the client (the node card's Archive fact): what depth of its own
// chain each probed node serves — the global L0 cluster and every catalog metagraph's L0
// cluster alike. Ports stay server-side; the client only needs reach.

export const maxDuration = 60;

export async function GET() {
  try {
    const info = await getArchiveInfo();
    return NextResponse.json(
      {
        entries: info.entries.map((e) => ({
          ip: e.ip,
          chain: e.chain,
          kind: e.kind,
          floor: e.floor,
          latest: e.latest,
          floorTs: e.floorTs ?? null,
        })),
        total: info.total,
        archivalCount: info.archival.length,
        since: ARCHIVE_SINCE,
      },
      { headers: { "Cache-Control": "public, max-age=3600, stale-while-revalidate=21600" } },
    );
  } catch {
    return NextResponse.json({ error: "probe unavailable" }, { status: 503 });
  }
}
