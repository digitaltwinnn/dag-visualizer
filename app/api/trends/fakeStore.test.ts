import { afterEach, describe, expect, it, vi } from "vitest";
import { fakeStore } from "./fakeStore";
import { writeStore } from "./store";

// THE FAKE IS HELD TO THE REAL CLIENT (PR review I1/M12): `writeStore()` — the real `@upstash/redis`
// behind the real wrapper — answers a stubbed fetch with what Redis would send for the values below,
// and the fake, given the same stored values, must hand back exactly the same. A client upgrade that
// changes its deserialisation fails here, not in production.

/** Values as Redis holds them, chosen for every branch of the client's parsing. */
const RAW: Record<string, string> = {
  count: "140",
  stamp: "1764252000000",
  big: "12345678901234567890", // a number that is not a safe integer
  frac: "1.5",
  name: JSON.stringify({ name: "Open Poker", source: "ded", namedAt: 1764252000000 }),
  word: "not json",
  bool: "true",
  nul: "null",
  sketch: "hll12:AAAA",
};
const FIELDS = Object.keys(RAW);

const b64 = (s: string) => Buffer.from(s).toString("base64");
/** The client's default `responseEncoding: "base64"`: each string element base64-encoded. */
const encode = (result: unknown) => (Array.isArray(result) ? result.map((v) => (typeof v === "string" ? b64(v) : v)) : typeof result === "string" ? b64(result) : result);

/** The real store over a stubbed REST endpoint: `answer` is Redis's reply to one command. The client
 *  auto-pipelines, so a request body is one command or a list of them. */
function realStore(answer: (cmd: string[]) => unknown) {
  vi.stubEnv("UPSTASH_KV_REST_API_URL", "https://fake.upstash.io");
  vi.stubEnv("UPSTASH_KV_REST_API_TOKEN", "t");
  vi.stubGlobal("fetch", vi.fn(async (_url: string, init: { body: string }) => {
    const body = JSON.parse(init.body) as string[] | string[][];
    const out = Array.isArray(body[0]) ? (body as string[][]).map((c) => ({ result: encode(answer(c)) })) : { result: encode(answer(body as string[])) };
    return new Response(JSON.stringify(out), { status: 200, headers: { "content-type": "application/json" } });
  }));
  return writeStore();
}

function seeded() {
  const f = fakeStore();
  f.data.set("h", new Map(Object.entries(RAW)));
  for (const [k, v] of Object.entries(RAW)) f.str.set(`s:${k}`, v);
  return f;
}

describe("fakeStore hands values back as @upstash/redis does", () => {
  afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

  it("HGETALL", async () => {
    const real = realStore(() => FIELDS.flatMap((f) => [f, RAW[f]!]));
    const got = await real.hgetall("h");
    expect(await seeded().hgetall("h")).toEqual(got);
    // the shapes the readers must cope with
    expect(got).toMatchObject({ count: 140, stamp: 1764252000000, big: RAW.big, frac: RAW.frac, word: "not json", bool: true, nul: null, sketch: RAW.sketch });
    expect(got!.name).toEqual({ name: "Open Poker", source: "ded", namedAt: 1764252000000 });
  });

  it("HGETALL of an absent hash is null", async () => {
    expect(await realStore(() => []).hgetall("none")).toBeNull();
    expect(await fakeStore().hgetall("none")).toBeNull();
  });

  it("HMGET, absent fields included", async () => {
    const asked = [...FIELDS, "absent"];
    const real = realStore((cmd) => cmd.slice(2).map((f) => RAW[f] ?? null));
    const got = await real.hmget("h", asked);
    expect(await seeded().hmget("h", asked)).toEqual(got);
    expect(got[FIELDS.indexOf("frac")]).toBe(1.5); // HMGET parses what HGETALL keeps
    expect(got.at(-1)).toBeNull();
    const none = realStore((cmd) => cmd.slice(2).map(() => null));
    expect(await none.hmget("h", ["a", "b"])).toEqual(await fakeStore().hmget("h", ["a", "b"]));
  });

  it("GET and MGET", async () => {
    const keys = [...FIELDS.map((k) => `s:${k}`), "s:absent"];
    const real = realStore((cmd) => (cmd[0] === "get" ? RAW[cmd[1]!.slice(2)] ?? null : cmd.slice(1).map((k) => RAW[k.slice(2)] ?? null)));
    const fake = seeded();
    expect(await fake.mget(keys)).toEqual(await real.mget(keys));
    for (const k of keys) expect(await fake.get(k)).toEqual(await real.get(k));
    expect(await real.get("s:sketch")).toBe(RAW.sketch); // a sketch survives as its string (R22)
  });
});
