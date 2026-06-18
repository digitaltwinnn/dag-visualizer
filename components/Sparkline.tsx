"use client";

import { LineChart, Line, YAxis } from "recharts";

// Tiny inline trend line (Recharts) — used in the stats header. Recharts is also the
// foundation for the larger charts to come (axes/tooltips/area/bar), so reuse it.
export default function Sparkline({
  data,
  color,
  width = 60,
  height = 22,
}: {
  data: number[] | undefined;
  color: string;
  width?: number;
  height?: number;
}) {
  if (!data || data.length < 2) return null;
  const points = data.map((v, i) => ({ i, v }));
  return (
    <LineChart width={width} height={height} data={points} margin={{ top: 3, right: 1, bottom: 3, left: 1 }}>
      {/* hidden axis, scaled to the data so the line uses the full height */}
      <YAxis hide domain={["dataMin", "dataMax"]} />
      <Line
        type="monotone"
        dataKey="v"
        stroke={color}
        strokeWidth={1.5}
        dot={false}
        isAnimationActive={false}
      />
    </LineChart>
  );
}
