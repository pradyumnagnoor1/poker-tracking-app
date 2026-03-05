"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

const THRESHOLD = 72;

export default function PullToRefresh({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const startY = useRef(0);
  const pullYRef = useRef(0);
  const [pullY, setPullY] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const refreshingRef = useRef(false);

  useEffect(() => {
    const onStart = (e: TouchEvent) => {
      startY.current = window.scrollY === 0 ? e.touches[0].clientY : 0;
    };

    const onMove = (e: TouchEvent) => {
      if (!startY.current) return;
      const delta = e.touches[0].clientY - startY.current;
      if (delta > 0) {
        pullYRef.current = Math.min(delta, THRESHOLD + 30);
        setPullY(pullYRef.current);
      }
    };

    const onEnd = () => {
      if (pullYRef.current >= THRESHOLD && !refreshingRef.current) {
        refreshingRef.current = true;
        setRefreshing(true);
        router.refresh();
        setTimeout(() => {
          refreshingRef.current = false;
          setRefreshing(false);
        }, 1000);
      }
      startY.current = 0;
      pullYRef.current = 0;
      setPullY(0);
    };

    window.addEventListener("touchstart", onStart, { passive: true });
    window.addEventListener("touchmove", onMove, { passive: true });
    window.addEventListener("touchend", onEnd);

    return () => {
      window.removeEventListener("touchstart", onStart);
      window.removeEventListener("touchmove", onMove);
      window.removeEventListener("touchend", onEnd);
    };
  }, [router]);

  const progress = Math.min(pullY / THRESHOLD, 1);

  return (
    <>
      {(pullY > 8 || refreshing) && (
        <div
          className="fixed top-0 left-0 right-0 z-50 flex justify-center pointer-events-none"
          style={{
            paddingTop: "max(env(safe-area-inset-top), 12px)",
            opacity: refreshing ? 1 : progress,
          }}
        >
          <div
            className={`w-7 h-7 rounded-full border-2 border-gray-600 border-t-white ${refreshing ? "animate-spin" : ""}`}
            style={!refreshing ? { transform: `rotate(${progress * 270}deg)` } : undefined}
          />
        </div>
      )}
      {children}
    </>
  );
}
