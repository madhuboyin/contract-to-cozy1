// apps/frontend/src/components/localUpdates/LocalUpdatesCarousel.tsx

import React, { useEffect, useMemo, useRef, useState } from "react";
import { LocalUpdatesCarouselProps } from "./localUpdates.types";
import { LocalUpdateCard } from "./LocalUpdateCard";

function categoryLabel(cat: string) {
  switch (cat) {
    case "INTERNET":
      return "Internet";
    case "INSURANCE":
      return "Insurance";
    case "MAINTENANCE":
      return "Maintenance";
    case "ENERGY":
      return "Energy";
    default:
      return "Update";
  }
}

export function LocalUpdatesCarousel({
  updates,
  onDismiss,
  onCtaClick,
  variant = "card",
}: LocalUpdatesCarouselProps) {
  const items = useMemo(() => (updates ?? []).slice(0, 3), [updates]);
  const [idx, setIdx] = useState(0);
  const pausedRef = useRef(false);
  const touchStartX = useRef<number | null>(null);

  useEffect(() => {
    if (items.length <= 1 || variant === "ticker") return;

    const t = setInterval(() => {
      if (pausedRef.current) return;
      setIdx((prev) => (prev + 1) % items.length);
    }, 7000);

    return () => clearInterval(t);
  }, [items.length, variant]);

  useEffect(() => {
    // Reset index when list changes
    setIdx(0);
  }, [items.length]);

  if (!items.length) {
    if (variant === "ticker") return null;

    return <div className="w-full rounded-2xl border bg-white px-4 py-3 text-sm text-slate-700">
      Local home updates will appear here when services are available in your area.
    </div>;
  }

  const current = items[idx];

  if (variant === "ticker") {
    const queued = items[0];
    if (!queued) return null;
    const isPartner = queued.isSponsored;
    return (
      <div className="w-full">
        <div
          className={`overflow-hidden rounded-xl px-3 py-2.5 ${
            isPartner
              ? "border border-dashed border-gray-200 bg-gray-50 opacity-90"
              : "border border-gray-200 bg-white"
          }`}
        >
          <div className="flex min-h-[44px] items-center gap-2">
            {isPartner ? (
              <span className="shrink-0 rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-gray-400">
                Partner Offer
              </span>
            ) : (
              <span className="hidden shrink-0 rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[11px] font-medium text-slate-600 sm:inline-flex">
                {categoryLabel(current.category)}
              </span>
            )}

            <button
              type="button"
              onClick={() => onCtaClick(queued.id)}
              className="min-w-0 flex-1 truncate text-left text-sm font-medium text-slate-800 hover:text-brand-700"
              title={queued.title}
            >
              {queued.title}
            </button>

            <button
              type="button"
              onClick={() => onDismiss(queued.id)}
              className="shrink-0 rounded-md px-2 py-1 text-slate-400 hover:bg-white hover:text-slate-700"
              aria-label="Dismiss update"
            >
              ✕
            </button>
          </div>
        </div>
      </div>
    );
  }

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
