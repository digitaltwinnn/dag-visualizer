import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GateError, gateChat } from "./gate";

const FAKE_KEY = "fake-key-do-not-leak-0123456789";
const MSGS = [{ role: "system" as const, content: "s" }, { role: "user" as const, content: "u" }];

const ok = (content: unknown) =>
  new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status: 200 });

let saved: { key?: string; model?: string };
beforeEach(() => {
  saved = { key: process.env.GATE_API_KEY, model: process.env.GATE_MODEL };
  process.env.GATE_API_KEY = FAKE_KEY;
  delete process.env.GATE_MODEL;
});
afterEach(() => {
  if (saved.key === undefined) delete process.env.GATE_API_KEY; else process.env.GATE_API_KEY = saved.key;
  if (saved.model === undefined) delete process.env.GATE_MODEL; else process.env.GATE_MODEL = saved.model;
});

async function kindOf(p: Promise<unknown>): Promise<GateError> {
  try { await p; } catch (e) { return e as GateError; }
  throw new Error("expected a rejection");
}

describe("gateChat", () => {
  it("returns the first choice's content", async () => {
    const fetchImpl = vi.fn(async () => ok("NOTE: Hello.")) as unknown as typeof fetch;
    await expect(gateChat(MSGS, { fetchImpl })).resolves.toBe("NOTE: Hello.");
  });

  it("posts the OpenAI-shaped body to the chat completions endpoint with the bearer key", async () => {
    const fetchImpl = vi.fn(async () => ok("x"));
    await gateChat(MSGS, { fetchImpl: fetchImpl as unknown as typeof fetch });
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://gateway.constellationgate.ai/v1/chat/completions");
    expect(init.method).toBe("POST");
    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toBe(`Bearer ${FAKE_KEY}`);
    expect(headers["Content-Type"]).toBe("application/json");
    expect(JSON.parse(init.body as string)).toEqual({
      model: "constellation/qwen3-8-flash-free",
      messages: MSGS,
      temperature: 0.3,
      max_tokens: 400,
    });
  });

  it("takes the model from GATE_MODEL when set", async () => {
    process.env.GATE_MODEL = "constellation/other";
    const fetchImpl = vi.fn(async () => ok("x"));
    await gateChat(MSGS, { fetchImpl: fetchImpl as unknown as typeof fetch });
    expect(JSON.parse((fetchImpl.mock.calls[0] as unknown as [string, RequestInit])[1].body as string).model).toBe("constellation/other");
  });

  it("answers nokey without calling fetch when the key is unset or blank", async () => {
    for (const v of [undefined, "", "  "]) {
      if (v === undefined) delete process.env.GATE_API_KEY; else process.env.GATE_API_KEY = v;
      const fetchImpl = vi.fn(async () => ok("x"));
      const e = await kindOf(gateChat(MSGS, { fetchImpl: fetchImpl as unknown as typeof fetch }));
      expect(e).toBeInstanceOf(GateError);
      expect(e.kind).toBe("nokey");
      expect(fetchImpl).not.toHaveBeenCalled();
    }
  });

  it("maps 429 to rate and other failures to http", async () => {
    const f429 = (async () => new Response("slow down", { status: 429 })) as unknown as typeof fetch;
    expect((await kindOf(gateChat(MSGS, { fetchImpl: f429 }))).kind).toBe("rate");
    const f500 = (async () => new Response("boom", { status: 500 })) as unknown as typeof fetch;
    expect((await kindOf(gateChat(MSGS, { fetchImpl: f500 }))).kind).toBe("http");
    const fBad = (async () => new Response("not json", { status: 200 })) as unknown as typeof fetch;
    expect((await kindOf(gateChat(MSGS, { fetchImpl: fBad }))).kind).toBe("http");
    const fNet = (async () => { throw new TypeError("fetch failed"); }) as unknown as typeof fetch;
    expect((await kindOf(gateChat(MSGS, { fetchImpl: fNet }))).kind).toBe("http");
  });

  it("maps an abort to timeout", async () => {
    const aborting = (async () => { throw new DOMException("aborted", "AbortError"); }) as unknown as typeof fetch;
    expect((await kindOf(gateChat(MSGS, { fetchImpl: aborting }))).kind).toBe("timeout");
  });

  it("aborts a call that outlives timeoutMs", async () => {
    const hanging = ((_u: string, init: RequestInit) =>
      new Promise((_res, rej) => {
        init.signal!.addEventListener("abort", () => rej(new DOMException("aborted", "AbortError")));
      })) as unknown as typeof fetch;
    expect((await kindOf(gateChat(MSGS, { fetchImpl: hanging, timeoutMs: 20 }))).kind).toBe("timeout");
  });

  it("maps missing, blank or non-string content to empty", async () => {
    for (const c of ["", "   \n", null, 42]) {
      const f = (async () => ok(c)) as unknown as typeof fetch;
      expect((await kindOf(gateChat(MSGS, { fetchImpl: f }))).kind).toBe("empty");
    }
    const noChoices = (async () => new Response("{}", { status: 200 })) as unknown as typeof fetch;
    expect((await kindOf(gateChat(MSGS, { fetchImpl: noChoices }))).kind).toBe("empty");
  });

  it("never carries the key or headers in an error message, whatever the cause said", async () => {
    const leaky = [
      (async () => { throw new Error(`connect failed, Authorization: Bearer ${FAKE_KEY}`); }) as unknown as typeof fetch,
      (async () => new Response(`bad token ${FAKE_KEY}`, { status: 401 })) as unknown as typeof fetch,
      (async () => new Response(`${FAKE_KEY}`, { status: 429 })) as unknown as typeof fetch,
      (async () => new Response(`${FAKE_KEY}`, { status: 200 })) as unknown as typeof fetch,
    ];
    for (const fetchImpl of leaky) {
      const e = await kindOf(gateChat(MSGS, { fetchImpl }));
      expect(e).toBeInstanceOf(GateError);
      expect(e.message).not.toContain(FAKE_KEY);
      expect(e.message).not.toMatch(/bearer|authorization/i);
      expect(JSON.stringify(e)).not.toContain(FAKE_KEY);
    }
  });
});
