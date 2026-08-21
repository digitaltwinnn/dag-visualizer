import type { NetworkId } from "@/src/engine/config";

// THE one ?net= validator. Both resolvers (current.ts on the client, request.ts on the
// server) route through it, and the inline <head> script in app/layout.tsx mirrors this
// list textually (an inline script cannot import). Query string ONLY, never the hash: a
// hash never reaches the server, so a hash-read here would give a client styled for one
// network talking to another network's routes. Exact ids, no case folding, unknowns fall
// back to mainnet.
export function parseNet(search: string | null | undefined): NetworkId {
  const m = /[?&]net=([^&]*)/.exec(search ?? "");
  const v = m?.[1];
  return v === "integrationnet" || v === "testnet" ? v : "mainnet";
}
