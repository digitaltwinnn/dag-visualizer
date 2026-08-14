import { NextResponse } from "next/server";
import { ARCHIVE_SINCE, getArchiveInfo } from "./probe";

// The archive census for the client (the node card's Archive fact): which DAG L0 validators
// serve deep history and which prune to a recent window. Ports stay server-side — the client
// only needs membership.

export const maxDuration = 30;

export async function GET() {
  try {
    const info = await getArchiveInfo();
    return NextResponse.json(
      {
        archival: info.archival.map((t) => t.ip),
        pruned: info.pruned,
        total: info.total,
        since: ARCHIVE_SINCE,
      },
      { headers: { "Cache-Control": "public, max-age=3600, stale-while-revalidate=21600" } },
    );
  } catch {
    return NextResponse.json({ error: "probe unavailable" }, { status: 503 });
  }
}
