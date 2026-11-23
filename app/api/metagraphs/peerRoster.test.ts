import { describe, it, expect } from "vitest";
import { peerRosterUrls } from "./peerRoster";

describe("peerRosterUrls — a failed layer is asked of the network's other machines", () => {
  it("carries the layer's port to each known peer, leaving the listed host out", () => {
    expect(peerRosterUrls("http://77.42.35.194:9100", ["135.181.37.178", "77.42.35.194", "77.42.74.164"])).toEqual([
      "http://135.181.37.178:9100",
      "http://77.42.74.164:9100",
    ]);
  });
  it("asks no more than the cap, each peer once", () => {
    expect(peerRosterUrls("http://10.0.0.1:9100", ["10.0.0.2", "10.0.0.2", "10.0.0.3", "10.0.0.4", "10.0.0.5"], 2)).toEqual([
      "http://10.0.0.2:9100",
      "http://10.0.0.3:9100",
    ]);
  });
  it("has nothing to try with no peers, no port, or an address it cannot read", () => {
    expect(peerRosterUrls("http://10.0.0.1:9100", [])).toEqual([]);
    expect(peerRosterUrls("https://l0.example.net", ["10.0.0.2"])).toEqual([]);
    expect(peerRosterUrls("not a url", ["10.0.0.2"])).toEqual([]);
  });
});
