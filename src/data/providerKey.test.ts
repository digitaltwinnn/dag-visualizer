import { describe, it, expect } from "vitest";
import { providerKey } from "./providerKey";

describe("providerKey", () => {
  it("slugs a provider name: lowercase, runs of non-alphanumerics one dash, trimmed, 48 chars", () => {
    expect(providerKey("Hetzner Online GmbH")).toBe("hetzner-online-gmbh");
    expect(providerKey("netcup GmbH | AS197540")).toBe("netcup-gmbh-as197540");
    expect(providerKey("  Amazon.com, Inc. ")).toBe("amazon-com-inc");
    expect(providerKey("x".repeat(60))!.length).toBe(48);
  });
  it("an unknown host is null, never an invented bucket", () => {
    expect(providerKey(undefined)).toBeNull();
    expect(providerKey(null)).toBeNull();
    expect(providerKey("")).toBeNull();
    expect(providerKey("---")).toBeNull();
    expect(providerKey("  ·  ")).toBeNull();
  });
});
