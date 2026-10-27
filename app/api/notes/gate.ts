// THE GATE CLIENT — one chat call to the Constellation Gate (OpenAI shape), nothing else. The
// model is free-tier only: there is no fallback model and no paid route, so a failure is an
// error the caller counts, never a reason to try elsewhere.
//
// SECRETS: `GATE_API_KEY` is read from `process.env` at CALL time, sent only in the Authorization
// header, and never logged, returned or placed in an error. A `GateError` message is built from
// its `kind` (and a status code) alone: whatever the upstream or the runtime said — which can
// echo a header — is dropped, not forwarded.
//
// Model text is untrusted: this returns the string and nothing here renders it.

export type GateErrorKind = "nokey" | "rate" | "http" | "timeout" | "empty";

const MESSAGES: Record<GateErrorKind, string> = {
  nokey: "Gate key is not configured",
  rate: "Gate rate limit",
  http: "Gate request failed",
  timeout: "Gate request timed out",
  empty: "Gate answered with no text",
};

export class GateError extends Error {
  readonly kind: GateErrorKind;
  constructor(kind: GateErrorKind, detail?: string) {
    super(detail ? `${MESSAGES[kind]} (${detail})` : MESSAGES[kind]);
    this.name = "GateError";
    this.kind = kind;
  }
}

const ENDPOINT = "https://gateway.constellationgate.ai/v1/chat/completions";
const DEFAULT_MODEL = "constellation/qwen3-8-flash-free";
const DEFAULT_TIMEOUT_MS = 20_000;

export interface GateMessage { role: "system" | "user"; content: string }

export async function gateChat(
  messages: GateMessage[],
  opts?: { fetchImpl?: typeof fetch; timeoutMs?: number },
): Promise<string> {
  const key = process.env.GATE_API_KEY?.trim();
  if (!key) throw new GateError("nokey");
  const model = process.env.GATE_MODEL?.trim() || DEFAULT_MODEL;
  const doFetch = opts?.fetchImpl ?? fetch;

  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), opts?.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  try {
    let res: Response;
    try {
      res = await doFetch(ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
        body: JSON.stringify({ model, messages, temperature: 0.3, max_tokens: 400 }),
        signal: ctl.signal,
      });
    } catch (e) {
      const name = (e as { name?: string } | null)?.name;
      throw new GateError(name === "AbortError" || name === "TimeoutError" ? "timeout" : "http");
    }
    if (res.status === 429) throw new GateError("rate");
    if (!res.ok) throw new GateError("http", String(res.status));
    let body: unknown;
    try {
      body = await res.json();
    } catch (e) {
      const name = (e as { name?: string } | null)?.name;
      throw new GateError(name === "AbortError" ? "timeout" : "http");
    }
    const content = (body as { choices?: { message?: { content?: unknown } }[] } | null)?.choices?.[0]?.message?.content;
    if (typeof content !== "string" || !content.trim()) throw new GateError("empty");
    return content;
  } finally {
    clearTimeout(timer);
  }
}
