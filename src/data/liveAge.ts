/** The time a shared-live answer's DATA was true: when it arrived, minus how long the edge held it
 *  (the `Age` header, seconds) and how long the function's memo held it (`memoAgeMs`). A missing
 *  or non-numeric figure counts 0, and the result is never later than `receivedAt` — a negative
 *  age must not push a beat into the future. */
export function dataTime(receivedAt: number, ageHeader: string | null, memoAgeMs: number | undefined): number {
  const ageS = ageHeader == null ? 0 : Number(ageHeader);
  const edge = Number.isFinite(ageS) ? ageS * 1000 : 0;
  const memo = typeof memoAgeMs === "number" && Number.isFinite(memoAgeMs) ? memoAgeMs : 0;
  return Math.min(receivedAt, receivedAt - edge - memo);
}
