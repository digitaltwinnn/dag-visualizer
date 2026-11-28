import { describe, expect, it } from "vitest";
import { settle, view, submittersUrl, type Keyed } from "./useSubmitters";
import type { SubmittersWindow } from "@/app/api/submitters/assemble";

const w = (net: string) => ({ net }) as unknown as SubmittersWindow;
const DED = submittersUrl({ net: "ded", window: "24h" });
const DOR = submittersUrl({ net: "dor", window: "24h" });

describe("useSubmitters state is keyed by url", () => {
  const ded: Keyed = { url: DED, data: w("ded"), error: false };
  it("never returns another url's data after the query changes", () => {
    expect(view(ded, DOR, null).data).toBeNull();
    expect(view(ded, DOR, w("dor-cached")).data).toEqual(w("dor-cached"));
    expect(view(ded, DED, null).data).toEqual(w("ded"));
    expect(view(ded, null, null)).toEqual({ data: null, error: false });
  });
  it("a failed load for the new url does not fall back to the old url's data", () => {
    const next = settle(ded, DOR, null, null);
    expect(next).toEqual({ url: DOR, data: null, error: true });
  });
  it("a failed load keeps its own url's last data, or its cache entry", () => {
    expect(settle(ded, DED, null, null).data).toEqual(w("ded"));
    expect(settle(ded, DOR, null, w("dor-cached")).data).toEqual(w("dor-cached"));
  });
  it("a success replaces and clears the error", () => {
    expect(settle({ url: DOR, data: null, error: true }, DOR, w("dor"), null)).toEqual({ url: DOR, data: w("dor"), error: false });
  });
});
