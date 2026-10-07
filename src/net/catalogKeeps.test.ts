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
const EVER: Record<string, readonly string[]> = {
  mainnet: [
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
  ],
  integrationnet: [
    "DAG6BDkunF5NcyneYvgaEZTZiyF18QUdr7XuC3oY", // ChainStats
    "DAG0chGHJTDN17VdgedukaZCxAPXwospruMoPL1E", // Digital Evidence
    "DAG2uPStsfJvszi559PFgY8VoJM2pKmvBC2u93Z4", // BLDR
    "DAG1JkGeewaTBHMLwk6aehofLbjoSxZ8DKo1yvA4", // ACY
    "DAG5bjTe13TY8GB6AN9HXiTCPXHJhdK5AFEMZfvx", // PacaSwap
    "DAG1jF8FDHEC8VhZwpVyyc6zDy8XE7JRAAAypmhr", // ACX
    "DAG4iv2b5XE9WNc7fLeyvF2bFkHkmCqhXZMrQH6N", // The Void
    "DAG0svaNZVPenLPujZ3hgHcYK2MmZJVyF4QjkaTk", // Hypermatrix
    "DAG3GzFbfN6m5uEQpS6PwYHmTUZ373d5VWPA4uUi", // The Upsider AI
    "DAG06mK9MUCiUchQnEwgqvSAcNmwKowgudWWf3ga", // BioFi
    "DAG3qrtBnL8Zc9QjTPX9YW9v79eJdFNeS6YnLWjK", // Common Crawl
    "DAG7VNFvsf65gvVCYPkxVZYd2xYAsq4KFBYr8gKn", // AutoSight
    "DAG1GH7r7RX1Ca7MbuvqUPT37FAtTfGM1WYQ4otZ", // El Paca
    "DAG8CHWAjGJP7JfHnHJ8BZ53AA4kq8xhniZZJRVY", // Cyberlete
    "DAG3spUrLbFXgxhhapFRjLj72P7WV2f4h9f98dXV", // Intrana
    "DAG387n6WmUQXfE6zyAd6R5EiYhmgQjWxt2e8NKP", // National Digifoundry
    "DAG4dWrdALPQmvF5UBpuXrqdkMHea1H5f7rjb4qY", // Metagraph Token
    "DAG5kfY9GoHF1CYaY8tuRJxmB3JSzAEARJEAkA2C", // Dor Technologies
  ],
  testnet: [
    "DAG1VF44t1ZaxK9gknpEYRysm3MBm7rsxhaARUGb", // PacaSwap
    "DAG6kKgcDKGWiT6paYfaqTAXxFZUaJWjbp9wjtyk", // ACX
    "DAG6tBEdBr1KsBByorcag2e2rAmhnL1hPV9fnfVD", // ACY
    "DAG8gMagrwoJ4nAMjbGx17WB5D6nqBEPZYChc3zH", // Dor Technologies
    "DAG5j83gnnxMX1S5ZAZAszU9CRxsqJLxtRmyFPj6", // Constellation Test Token
  ],
};

describe("the catalog keeps every network it ever had", () => {
  for (const [net, ids] of Object.entries(EVER)) {
    it(`${net}: every address is still tracked (retire a network, never delete it)`, () => {
      const tracked = new Set(lineageIds(net));
      expect(ids.filter((id) => !tracked.has(id))).toEqual([]);
    });
  }
});
