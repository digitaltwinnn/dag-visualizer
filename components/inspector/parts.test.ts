import { describe, it, expect } from "vitest";
import { metaKindWord, shareWords, countable } from "./parts";

// The lead sentences state a share in words, so rounding must never make them false.
describe("shareWords", () => {
  it("rounds an ordinary share", () => {
    expect(shareWords(15, 18)).toBe("83%");
    expect(shareWords(18, 18)).toBe("100%");
  });
  it("never says 0% for a part that exists, nor 100% for one that is not the whole", () => {
    expect(shareWords(1, 300)).toBe("under 1%");
    expect(shareWords(299, 300)).toBe("over 99%");
    expect(shareWords(0, 300)).toBe("0%");
  });
  it("says nothing when there is no whole", () => {
    expect(shareWords(0, 0)).toBeNull();
  });
});

describe("countable", () => {
  it("draws squares up to 60 and bars above", () => {
    expect(countable(60)).toBe(true);
    expect(countable(61)).toBe(false);
  });
});

// THE METAGRAPH HEAD'S PILL IS THE KIND (user, 2026-10-30: the collapsed Metagraph card "has no
// right side element … should be the type as a pill? 'currency', 'hypergraph'"). The ticker chip
// was the aside and stood down where the ticker IS the name (DAG, USDC.dag), so those entries had
// nothing on the right; the kind is one word every network has. A bare "metagraph" (an unknown
// type) adds nothing beside the eyebrow and shows no pill.
describe("metaKindWord — the one qualifier the Metagraph head's pill shows", () => {
  const node = (roles: string[]) => ({ roles } as never);
  it("names the hypergraph, a currency, a data and a data and currency metagraph", () => {
    expect(metaKindWord("dag", [])).toBe("hypergraph");
    expect(metaKindWord("x", [node(["l0", "cl1"])])).toBe("currency");
    expect(metaKindWord("x", [node(["l0", "dl1"])])).toBe("data");
    expect(metaKindWord("x", [node(["l0", "cl1", "dl1"])])).toBe("data and currency");
  });
  it("has no word for an unknown type: the eyebrow already says metagraph", () => {
    expect(metaKindWord("x", [])).toBeNull();
  });
});
