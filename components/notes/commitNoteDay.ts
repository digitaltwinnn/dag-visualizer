import { noteDayActions } from "@/src/engine/domain/pickActions";
import { applyClickActions } from "@/src/store/applyClickActions";
import { useStore } from "@/src/store/store";
import { notableDaySpan } from "./noteDays";

/** A NOTABLE DAY, COMMITTED — one home for the AI card's row, the timeline's mark and a chart
 *  plane's coin (user, 2026-10-30: "the notable days are related to a chart, so if we click it and
 *  it selects the range it should also set the related explorer filter so the correct chart shows
 *  up"). The day's plane comes forward through the one executor (rule 2: `noteDayActions`), then
 *  the day becomes the range. The range is a setting (`setTrendRange`), as a brush's is. */
export function commitNoteDay(day: { dayMs: number; networkId: string | null }): void {
  const { filter, trendFocus } = useStore.getState();
  applyClickActions(noteDayActions(day.networkId, filter, trendFocus));
  useStore.getState().setTrendRange(notableDaySpan(day.dayMs));
}
