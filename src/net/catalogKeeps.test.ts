import { describe, expect, it } from "vitest";
import { lineageIds } from "./lineage";

// A NETWORK IS NEVER DELETED FROM THE CATALOG — IT IS RETIRED (user, 2026-10-07: "inactive networks
// like SWAP and PACA will be removed … how can we ensure that we can still view these networks in
// trend view history etc and keep their colors"). The catalog row is what gives a network its
// name, ticker, colour and History row; the trends store keeps its measured past forever. Delete
// the row and that past turns into a raw address with no row to show it.
//
// So every address the catalog has ever held is listed here, and must stay tracked. A network that
// stops gets a `retiredAt` date on its row (src/engine/config.ts) — never a deletion. A NEW network
// or a re-registration adds its address here in the same change.
const EVER: readonly string[] = [
  "DAG6A8Dw78yWv9z8pHqjJ4JVwSqq9V9Ha7CRUQnY", // BioFi
  "DAG2JaVh5yYiPCGLLEFi6tfkKk77WA4FzivVdBek", // BioFi
  "DAG0eQr94qUQSUhmYGNXt6CoBKWu5K6htvRMGC6M", // Digital Evidence
  "DAG0rgR8sdn8u2YBYb5Ftjy4zmuqUX3v9XsE2j94", // Cyberlete
  "DAG7X5idd4aLfp4XC6WQdG1eDfR3LGPVEwtUUB2W", // PacaSwap
  "DAG0S16WDgdAvh8VvroR6MWLdjmHYdzAF5S181xh", // USDC.dag
  "DAG7Ghth1WhWK83SB3MtXnnHYZbCsmiRTwJrgaW1", // The Upsider AI
  "DAG06z64ifT2HzXoHfMexRfrcnpYFEwMqjFiPKze", // National Digifoundry
  "DAG6oJ5BgUbxjeSYKxgjT1YEUZ3QBS1MN5XkstfT", // Toughbook Connect
  "DAG7fwxZJpqBpXeHqjomVkvUfC9NgZeQ11qjmB5e", // Common Crawl
  "DAG7ChnhUF7uKgn8tXy45aj4zn9AFuhaZr8VXY43", // El Paca
  "DAG0CyySf35ftDQDQBnd1bdQ9aPyUdacMghpnCuM", // Dor Technologies
];

describe("the catalog keeps every network it ever had", () => {
  it("every address is still tracked (retire a network, never delete it)", () => {
    const tracked = new Set(lineageIds());
    expect(EVER.filter((id) => !tracked.has(id))).toEqual([]);
  });
});
