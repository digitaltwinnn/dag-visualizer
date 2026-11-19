import { NextResponse } from "next/server";
import { HOSTS } from "@/src/engine/config";
import { isTracked } from "@/src/net/lineage";
import { unlistedChains } from "../../../network/unlistedChains";
import { META_LADDER, clampLimit } from "../../limit";
import { memo, readChain } from "../../upstream";
import { SNAPSHOT_WINDOW, cacheControl } from "../../windows";

// One chain's newest snapshots (catch-up and self-heal), the limit rounded up to `META_LADDER`. The
// id must be a tracked chain or a listed unlisted one, so the route is not an open proxy to the
// explorer. If the unlisted list cannot be read, an untracked id cannot be verified and gets a 503.
export const runtime = "nodejs";
export const maxDuration = 30;

const NO_STORE = { "Cache-Control": "no-store" };

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const limit = clampLimit(new URL(req.url).searchParams.get("limit"), META_LADDER);

  if (!isTracked(id)) {
    let unlisted: string[];
    try {
      unlisted = await unlistedChains();
    } catch (e) {
      console.error("live/meta: cannot verify chain id", e);
      return NextResponse.json({ error: "cannot verify chain" }, { status: 503, headers: NO_STORE });
    }
    if (!unlisted.includes(id)) return NextResponse.json({ error: "unknown chain" }, { status: 404 });
  }

  try {
    const { value, ageMs } = await memo(`meta:${id}:${limit}`, SNAPSHOT_WINDOW.memoMs, () => readChain(HOSTS.be, id, limit));
    return NextResponse.json(
      { snapshots: value, memoAgeMs: ageMs },
      { headers: { "Cache-Control": cacheControl(SNAPSHOT_WINDOW) } },
    );
  } catch (e) {
    console.error("live/meta: read failed", e);
    return NextResponse.json({ error: "live feed unavailable" }, { status: 503, headers: NO_STORE });
  }
}
