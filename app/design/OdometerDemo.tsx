"use client";
import { useEffect, useState } from "react";
import Odometer from "@/components/Odometer";
export default function OdometerDemo() {
  const [n, setN] = useState(1203);
  useEffect(() => {
    const t = setInterval(() => setN((x) => x + Math.floor(Math.random() * 40)), 1500);
    return () => clearInterval(t);
  }, []);
  return <Odometer value={n} className="text-2xl font-mono font-bold" />;
}
