// The DEEPER read (spec §7.3/§7.4): one anchored metagraph snapshot, fully decoded — its own
// ordinal and height, its signing validators, and the shape AND payload of its application state.
//
// This re-downloads the ~2.5 MB global snapshot to reach a single entry. That cost is accepted
// deliberately: the read is cached immutably per (ordinal, address) pair and only ever runs on an
// explicit gesture on one card, never on a poll and never across the chain.
import { unstable_cache } from "next/cache";
import { NextResponse } from "next/server";
import { decodeChannelContent } from "../../../decodeChannel";
import type { ChannelSnapDeep } from "@/src/data/types";

export const maxDuration = 30;

const L0 = "https://l0-lb-mainnet.constellationnetwork.io";

async function fetchDeep(ordinal: number, address: string, snapOrdinal: number): Promise<ChannelSnapDeep> {
  const r = await fetch(`${L0}/global-snapshots/${ordinal}`, {
    cache: "no-store",
    signal: AbortSignal.timeout(8000),
  });
  if (!r.ok) throw new Error(`l0 ${r.status}`);
  const j = (await r.json()) as { value?: { stateChannelSnapshots?: Record<string, { value?: { fee?: number; content?: unknown[] } }[]> } };
  const sc = j?.value?.stateChannelSnapshots;
  if (!sc) throw new Error("no stateChannelSnapshots");
  const entries = sc[address];
  if (!entries || !entries.length) throw new Error("channel not in this snapshot");

  // A metagraph can anchor SEVERAL snapshots into one tick (DOR routinely dozens) — the read
  // targets the REQUESTED snapshot's own ordinal (2026-08-07; taking "the newest" made every
  // row of a tick show one shared decode). Falls back to the newest when the target is absent
  // or 0 (an undecodable row has no ordinal to ask for).
  let best: ChannelSnapDeep | null = null;
  for (const e of entries) {
    const d = await decodeChannelContent(e?.value?.content);
    if (!d) continue;
    const row: ChannelSnapDeep = {
      globalOrdinal: ordinal,
      metaId: address,
      ordinal: d.ordinal,
      height: d.height,
      subHeight: d.subHeight,
      epochProgress: d.epochProgress,
      lastSnapshotHash: d.lastSnapshotHash,
      fee: e?.value?.fee ?? 0,
      bytes: Array.isArray(e?.value?.content) ? e.value!.content!.length : 0,
      blocks: d.blocks,
      signers: d.signers,
      stateKeys: d.stateKeys,
      stateBytes: d.stateBytes,
      stateProof: d.stateProof,
      state: d.state,
      dataBlockSigners: d.dataBlockSigners,
      dataTxCount: d.dataTxCount,
      dataTx: d.dataTx,
    };
    if (snapOrdinal > 0 && row.ordinal === snapOrdinal) return row; // the requested one
    if (!best || row.ordinal > best.ordinal) best = row;
  }
  if (!best) throw new Error("nothing decodable in this channel");
  return best;
}

const cachedDeep = (ordinal: number, address: string, snapOrdinal: number) =>
  unstable_cache(
    () => fetchDeep(ordinal, address, snapOrdinal),
    ["snapshot-channel-v3", String(ordinal), address, String(snapOrdinal)],
    { revalidate: 86400 },
  )();

export async function GET(req: Request, ctx: { params: Promise<{ ordinal: string; address: string }> }) {
  const { ordinal: ordStr, address } = await ctx.params;
  const ordinal = Number(ordStr);
  const snapOrdinal = Number(new URL(req.url).searchParams.get("snap") ?? 0) || 0;
  if (!Number.isFinite(ordinal) || ordinal <= 0 || !address) {
    return NextResponse.json({ error: "bad request" }, { status: 400 });
  }
  try {
    const data = await cachedDeep(ordinal, address, snapOrdinal);
    return NextResponse.json(data, {
      headers: { "Cache-Control": "public, max-age=86400, immutable" },
    });
  } catch {
    // The L0 node prunes after ~30 min — an honest 404, not a fabricated body.
    return NextResponse.json({ available: false, ordinal, address }, { status: 404 });
  }
}
