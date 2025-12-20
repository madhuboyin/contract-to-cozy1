// apps/frontend/src/components/localUpdates/LocalUpdateCard.tsx

import React from "react";
import { LocalUpdateDTO } from "./localUpdates.types";

function categoryLabel(cat: LocalUpdateDTO["category"]) {
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

export function LocalUpdateCard({
  update,
  onDismiss,
  onCtaClick,
}: {
  update: LocalUpdateDTO;
  onDismiss: () => void;
  onCtaClick: () => void;
}) {
  return (
    <div className="w-full rounded-2xl border bg-white shadow-sm px-4 py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-slate-600">
              {categoryLabel(update.category)}
            </span>
            {update.isSponsored && (
              <span className="text-[11px] font-medium text-slate-500 border rounded-full px-2 py-0.5">
                Partner update
              </span>
            )}
          </div>

          <div className="mt-1 text-sm font-semibold text-slate-900 line-clamp-1">
            {update.title}
          </div>

          <div className="mt-1 text-sm text-slate-700 line-clamp-2">
            {update.shortDescription}
          </div>
        </div>

        <button
          aria-label="Dismiss update"
          onClick={onDismiss}
          className="text-slate-400 hover:text-slate-700 rounded-lg px-2 py-1"
          type="button"
        >
          ✕
        </button>
      </div>

      <div className="mt-3 flex items-center justify-between">
        <button
          onClick={onCtaClick}
          className="text-sm font-semibold text-teal-700 hover:text-teal-800"
          type="button"
        >
          {update.ctaText}
        </button>

        <span className="text-xs text-slate-500">
          Source: {update.sourceName}
        </span>
      </div>
    </div>
  );
}
