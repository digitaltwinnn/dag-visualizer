// WHO SUBMITTED A DATA UPDATE — one table, one row per network that names its submitter (user,
// 2026-11-27). Digital Evidence's updates are `MetagraphBatchMessage`s carrying an `orgId` (an
// ORGANISATION); Dor's carry a `publicId` (a DEVICE). Every other network's updates name no one we
// can read, so it has no row and `submitterOf` answers null (rule 10: absent is absent, never a guess).
//
// Mechanical like `payloadKinds`: the id is read off the update's own field; an update without one
// (a missing field, a non-object, an empty string, an id of the wrong shape) has no submitter and is simply not counted — the
// block's other figures never depend on it. Dor's device ids are stored TRUNCATED to
// `DEVICE_ID_LEN`: devices are counted exactly (a union of ids), never named or broken down.

export type SubmitterKind = "organisation" | "device";

export interface SubmitterSpec {
  kind: SubmitterKind;
  /** What one update is, in the plural, as the UI says it. */
  unit: string;
  /** The submitter id of one update, or null when it names none. */
  read: (update: unknown) => string | null;
}

/** The two catalog ids, literal (no lookup by name in the catalog). */
export const DED_ID = "DAG0eQr94qUQSUhmYGNXt6CoBKWu5K6htvRMGC6M";
export const DOR_ID = "DAG0CyySf35ftDQDQBnd1bdQ9aPyUdacMghpnCuM";

/** Dor device ids are stored truncated to this many characters. */
export const DEVICE_ID_LEN = 16;

const isObj = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === "object" && !Array.isArray(v);
const text = (v: unknown): string | null => (typeof v === "string" && v.length > 0 ? v : null);
// THE ID'S SHAPE IS CHECKED HERE, IN THE ONE TABLE (final review, 2026-11-27): an id becomes a store
// field (`<bucket>|<id>`, `app/api/submitters/keys.ts`), so one malformed id — a `|`, a megabyte —
// would throw inside the sampler and the walk and stall both. An id of the wrong shape is no
// submitter (null, not counted), like a missing one.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const HEX_RE = /^[0-9a-f]+$/i;

export const SUBMITTERS: Readonly<Record<string, SubmitterSpec>> = {
  [DED_ID]: {
    kind: "organisation",
    unit: "batches",
    read: (u) => {
      if (!isObj(u) || !isObj(u.MetagraphBatchMessage)) return null;
      const id = text(u.MetagraphBatchMessage.orgId);
      return id !== null && UUID_RE.test(id) ? id : null;
    },
  },
  [DOR_ID]: {
    kind: "device",
    unit: "check-ins",
    read: (u) => {
      if (!isObj(u)) return null;
      const id = text(u.publicId);
      return id !== null && HEX_RE.test(id) ? id.slice(0, DEVICE_ID_LEN) : null;
    },
  },
};

/** The submitter of one update on a network, or null (unlisted network, or an update naming none). */
export function submitterOf(netId: string, update: unknown): string | null {
  return Object.hasOwn(SUBMITTERS, netId) ? SUBMITTERS[netId].read(update) : null;
}

/** Updates per submitter, busiest first, ties by id; updates naming no submitter are not counted. */
export function tallySubmitters(netId: string, updates: readonly unknown[]): { id: string; updates: number }[] {
  const by = new Map<string, number>();
  for (const u of updates) {
    const id = submitterOf(netId, u);
    if (id !== null) by.set(id, (by.get(id) ?? 0) + 1);
  }
  return [...by].map(([id, n]) => ({ id, updates: n })).sort((a, b) => b.updates - a.updates || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

/** An organisation's name where known, else "Org" and the first 8 characters of its id. */
export function submitterLabel(id: string, names: Readonly<Record<string, string>>): string {
  return Object.hasOwn(names, id) ? names[id] : `Org ${id.slice(0, 8)}`;
}
