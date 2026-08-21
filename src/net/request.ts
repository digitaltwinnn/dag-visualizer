import type { NetworkId } from "@/src/engine/config";
import { parseNet } from "./parse";

// The SERVER network resolver: per request, same validator, same fallback as the client.
export function netOf(req: Request): NetworkId {
  return parseNet(new URL(req.url).search);
}
