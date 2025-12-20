// apps/frontend/src/components/localUpdates/LocalUpdatesCarousel.tsx

import React, { useEffect, useMemo, useRef, useState } from "react";
import { LocalUpdatesCarouselProps } from "./localUpdates.types";
import { LocalUpdateCard } from "./LocalUpdateCard";

export function LocalUpdatesCarousel({ updates, onDismiss, onCtaClick }: LocalUpdatesCarouselProps) {
  const items = useMemo(() => (updates ?? []).slice(0, 3), [updates]);
  const [idx, setIdx] = useState(0);
  const pausedRef = useRef(false);
  const touchStartX = useRef<number | null>(null);

  useEffect(() => {
    if (items.length <= 1) return;

    const t = setInterval(() => {
      if (pausedRef.current) return;
      setIdx((prev) => (prev + 1) % items.length);
    }, 7000);

    return () => clearInterval(t);
  }, [items.length]);

  useEffect(() => {
    // Reset index when list changes
    setIdx(0);
  }, [items.length]);

  if (!items.length) {
    return (
      <div className="w-full rounded-2xl border bg-white px-4 py-3 text-sm text-slate-700">
        Local home updates will appear here when services are available in your area.
      </div>
    );
  }

  const current = items[idx];

  return (
    <div
      className="w-full"
      onMouseEnter={() => (pausedRef.current = true)}
      onMouseLeave={() => (pausedRef.current = false)}
      onTouchStart={(e) => {
        touchStartX.current = e.touches[0]?.clientX ?? null;
        pausedRef.current = true;
      }}
      onTouchEnd={(e) => {
        const start = touchStartX.current;
        const end = e.changedTouches[0]?.clientX ?? null;
        touchStartX.current = null;
        pausedRef.current = false;

        if (start == null || end == null) return;
        const dx = end - start;

        // swipe threshold
        if (Math.abs(dx) < 35) return;

        if (dx < 0) {
          // next
          setIdx((prev) => (prev + 1) % items.length);
        } else {
          // prev
          setIdx((prev) => (prev - 1 + items.length) % items.length);
        }
      }}
    >
      <LocalUpdateCard
        update={current}
        onDismiss={() => onDismiss(current.id)}
        onCtaClick={() => onCtaClick(current.id)}
      />

      {items.length > 1 && (
        <div className="mt-2 flex items-center justify-center gap-2">
          {items.map((_, i) => (
            <button
              key={i}
              aria-label={`Go to update ${i + 1}`}
              className={`h-2 w-2 rounded-full ${i === idx ? "bg-slate-700" : "bg-slate-300"}`}
              onClick={() => setIdx(i)}
              type="button"
            />
          ))}
        </div>
      )}
    </div>
  );
}
