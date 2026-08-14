import { describe, it, expect } from "vitest";
import { isPublicNodeIp } from "./probe";

// The probe builds plain-HTTP URLs from upstream-supplied IPs; this guard is what keeps a
// poisoned cluster list from aiming the server at internal address space.
describe("isPublicNodeIp", () => {
  it("accepts public unicast IPv4", () => {
    expect(isPublicNodeIp("52.53.46.33")).toBe(true);
    expect(isPublicNodeIp("95.216.148.239")).toBe(true);
    expect(isPublicNodeIp("213.165.84.174")).toBe(true);
  });
  it("rejects private, loopback, link-local, CGNAT and multicast space", () => {
    expect(isPublicNodeIp("10.0.0.1")).toBe(false);
    expect(isPublicNodeIp("127.0.0.1")).toBe(false);
    expect(isPublicNodeIp("172.16.5.5")).toBe(false);
    expect(isPublicNodeIp("172.31.255.1")).toBe(false);
    expect(isPublicNodeIp("192.168.1.1")).toBe(false);
    expect(isPublicNodeIp("169.254.0.1")).toBe(false);
    expect(isPublicNodeIp("100.64.0.1")).toBe(false);
    expect(isPublicNodeIp("224.0.0.1")).toBe(false);
    expect(isPublicNodeIp("0.0.0.0")).toBe(false);
  });
  it("rejects non-IPv4 shapes and out-of-range octets", () => {
    expect(isPublicNodeIp("example.com")).toBe(false);
    expect(isPublicNodeIp("::1")).toBe(false);
    expect(isPublicNodeIp("1.2.3")).toBe(false);
    expect(isPublicNodeIp("1.2.3.4.5")).toBe(false);
    expect(isPublicNodeIp("300.1.1.1")).toBe(false);
    expect(isPublicNodeIp("52.53.46.33:9000")).toBe(false);
  });
});
