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
  const isPartner = update.isSponsored;

  return (
    <div
      className={`w-full rounded-2xl px-4 py-3 ${
        isPartner
          ? 'border border-dashed border-gray-200 bg-gray-50 opacity-90 shadow-sm'
          : 'border border-gray-200 bg-white shadow-sm'
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            {isPartner ? (
              <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-gray-400">
                Partner Offer
              </span>
            ) : (
              <span className="text-xs font-semibold text-slate-600">
                {categoryLabel(update.category)}
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
