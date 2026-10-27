import { describe, it, expect } from "vitest";
import type { NoteResponse } from "@/src/data/noteTypes";
import { bodyOf, createNoteLoader, MAX_RETRIES, queryOf, RETRY_MS, TTL_MS, type NoteReq } from "./noteLoader";

const OK: NoteResponse = { state: "ok", text: "Two sentences.", writtenAt: 1, spanFrom: 0, spanTo: 2, days: [] };
const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const REQ: NoteReq = { view: "trend", subject: "dag", span: "1h" };

function rig(answers: Array<Response | Error>) {
  const calls: { url: string; init?: RequestInit }[] = [];
  const sleeps: number[] = [];
  let clock = 1_000;
  const loader = createNoteLoader({
    urlOf: (p) => p,
    fetchImpl: async (url, init) => {
      calls.push({ url, init });
      const a = answers.shift();
      if (!a) throw new Error("no more answers");
      if (a instanceof Error) throw a;
      return a;
    },
    sleep: async (ms) => {
      sleeps.push(ms);
    },
    now: () => clock,
  });
  return { loader, calls, sleeps, advance: (ms: number) => (clock += ms) };
}

describe("queryOf / bodyOf", () => {
  it("sends a pill as span and a brushed range as from/to", () => {
    expect(queryOf(REQ)).toBe("view=trend&subject=dag&span=1h");
    expect(queryOf({ view: "trend", subject: "dag", span: "r100-200" })).toBe("view=trend&subject=dag&from=100&to=200");
    expect(queryOf({ view: "geo", subject: "cc:DE" })).toBe("view=geo&subject=cc%3ADE");
  });
  it("posts a pill as span and a range as fromMs/toMs", () => {
    expect(bodyOf(REQ)).toEqual({ view: "trend", subject: "dag", span: "1h" });
    expect(bodyOf({ view: "trend", subject: "dag", span: "r100-200" })).toEqual({ view: "trend", subject: "dag", fromMs: 100, toMs: 200 });
  });
});

describe("loadNote", () => {
  it("GET ok answers the note and holds it", async () => {
    const { loader, calls } = rig([reply(OK)]);
    expect(await loader.get(REQ)).toEqual(OK);
    expect(await loader.get(REQ)).toEqual(OK);
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe("/api/notes?view=trend&subject=dag&span=1h");
    expect(loader.peek(REQ)).toEqual(OK);
  });

  it("a held answer goes stale after the TTL", async () => {
    const { loader, calls, advance } = rig([reply(OK), reply(OK)]);
    await loader.get(REQ);
    advance(TTL_MS + 1);
    expect(loader.peek(REQ)).toBeNull();
    await loader.get(REQ);
    expect(calls).toHaveLength(2);
  });

  it("pending re-fetches and lands on the note", async () => {
    const { loader, calls, sleeps } = rig([reply({ state: "pending" }), reply({ state: "pending" }), reply(OK)]);
    expect(await loader.get(REQ)).toEqual(OK);
    expect(calls).toHaveLength(3);
    expect(sleeps).toEqual([RETRY_MS, RETRY_MS]);
  });

  it("pending forever gives up as unavailable after four re-fetches, and is not held", async () => {
    const { loader, calls, sleeps } = rig(Array.from({ length: 10 }, () => reply({ state: "pending" })));
    expect(await loader.get(REQ)).toEqual({ state: "unavailable" });
    expect(calls).toHaveLength(1 + MAX_RETRIES);
    expect(sleeps).toHaveLength(MAX_RETRIES);
    expect(loader.peek(REQ)).toBeNull();
  });

  it("a network error is unavailable", async () => {
    const { loader } = rig([new Error("offline")]);
    expect(await loader.get(REQ)).toEqual({ state: "unavailable" });
  });

  it("a non-2xx or an unreadable body is unavailable", async () => {
    expect(await rig([reply({ error: "bad" }, 400)]).loader.get(REQ)).toEqual({ state: "unavailable" });
    expect(await rig([reply({ nonsense: 1 })]).loader.get(REQ)).toEqual({ state: "unavailable" });
  });

  it("GET request then request(): the POST's answer is used and stored under the GET key", async () => {
    const { loader, calls } = rig([reply({ state: "request" }), reply(OK)]);
    expect(await loader.get(REQ)).toEqual({ state: "request" });
    expect(await loader.request(REQ)).toEqual(OK);
    expect(calls[1]!.url).toBe("/api/notes/request");
    expect(calls[1]!.init?.method).toBe("POST");
    expect(JSON.parse(calls[1]!.init!.body as string)).toEqual({ view: "trend", subject: "dag", span: "1h" });
    expect(await loader.get(REQ)).toEqual(OK);
    expect(calls).toHaveLength(2); // no re-GET showed the CDN's stale `request`
  });

  it("a brushed range POSTs fromMs/toMs", async () => {
    const { loader, calls } = rig([reply(OK)]);
    await loader.request({ view: "trend", subject: "dag", span: "r100-200" });
    expect(JSON.parse(calls[0]!.init!.body as string)).toEqual({ view: "trend", subject: "dag", fromMs: 100, toMs: 200 });
  });

  it("a POST 429 is unavailable", async () => {
    const { loader } = rig([reply({ state: "unavailable" }, 429)]);
    expect(await loader.request(REQ)).toEqual({ state: "unavailable" });
    expect(loader.peek(REQ)).toBeNull();
  });

  it("a POST network error is unavailable", async () => {
    const { loader } = rig([new Error("offline")]);
    expect(await loader.request(REQ)).toEqual({ state: "unavailable" });
  });

  it("a POST that answers pending polls the GET, and a stale CDN request counts as still pending", async () => {
    const { loader, calls } = rig([reply({ state: "pending" }), reply({ state: "request" }), reply(OK)]);
    expect(await loader.request(REQ)).toEqual(OK);
    expect(calls.map((c) => c.init?.method ?? "GET")).toEqual(["POST", "GET", "GET"]);
  });

  it("two askers on one key share one in-flight fetch", async () => {
    const { loader, calls } = rig([reply(OK)]);
    const [a, b] = await Promise.all([loader.get(REQ), loader.get({ ...REQ })]);
    expect(a).toEqual(OK);
    expect(b).toEqual(OK);
    expect(calls).toHaveLength(1);
  });

  it("two requests on one key share one POST", async () => {
    const { loader, calls } = rig([reply(OK)]);
    await Promise.all([loader.request(REQ), loader.request(REQ)]);
    expect(calls).toHaveLength(1);
  });

  it("different subjects do not share", async () => {
    const { loader, calls } = rig([reply(OK), reply(OK)]);
    await loader.get(REQ);
    await loader.get({ ...REQ, subject: "all" });
    expect(calls).toHaveLength(2);
  });
});
