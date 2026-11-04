// DELEGATED STAKE, AS THE REGISTRY STATES IT (2026-11-04 — user: "start sampling current stake
// information"). The Global L0's delegated-staking registry (`/node-params`, the list the
// node-names route already reads for operator names) carries, per registered validator, the DAG
// delegated to it and the addresses delegating. The registry is a CURRENT reading only — no
// upstream keeps its past — so the sampler records it once an hour and stake has a history from
// the day this shipped (like the fleet gauges, never backfillable).
//
// Pure: the entries in, one reading out. Amounts arrive in datum (1e-8 DAG) and leave in DAG —
// the registry's total (~9e16 datum) is past 2^53, where a datum sum stops being exact.

export interface RegistryEntry {
  peerId?: string;
  node?: { state?: string } | null;
  nodeMetadataParameters?: { name?: string };
  totalAmountDelegated?: number;
  totalAddressesAssigned?: number;
}

export interface StakeValidator {
  /** The first 16 hex of the peer id — the stake family's field key (`keys.ts` `stakeSlotOf`). */
  key: string;
  id: string;
  name: string;
  /** DAG delegated to it. */
  dag: number;
  /** Addresses delegating to it. */
  addrs: number;
  /** Whether it stood in the cluster, Ready, when the registry was read. */
  live: boolean;
}

export interface StakeReading {
  /** Every validator's delegated DAG, summed. */
  total: number;
  /** The part delegated to validators standing in the cluster. */
  live: number;
  /** Addresses delegating, summed per validator — an address delegating to two validators counts
   *  twice, so this is DELEGATIONS, never distinct delegators (the registry names no address). */
  delegations: number;
  /** Validators holding any delegated stake. */
  validators: number;
  perValidator: StakeValidator[];
}

const DATUM = 1e8;
export const validatorKey = (peerId: string): string => peerId.slice(0, 16);

/** The registry's entries as one reading, or null when it holds none (an absent gauge is an honest
 *  gap — a zero would read as every delegation withdrawn). */
export function stakeReading(entries: unknown): StakeReading | null {
  if (!Array.isArray(entries)) return null;
  const perValidator: StakeValidator[] = [];
  for (const e of entries as RegistryEntry[]) {
    if (!e?.peerId) continue;
    perValidator.push({
      key: validatorKey(e.peerId),
      id: e.peerId,
      name: e.nodeMetadataParameters?.name?.trim() ?? "",
      dag: (Number(e.totalAmountDelegated) || 0) / DATUM,
      addrs: Number(e.totalAddressesAssigned) || 0,
      live: e.node?.state === "Ready",
    });
  }
  if (!perValidator.length) return null;
  let total = 0, live = 0, delegations = 0, validators = 0;
  for (const v of perValidator) {
    total += v.dag;
    if (v.live) live += v.dag;
    delegations += v.addrs;
    if (v.dag > 0) validators++;
  }
  return { total, live, delegations, validators, perValidator };
}
