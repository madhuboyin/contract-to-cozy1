import { StatusCard, type StatusCardProps } from "./StatusCard";
import type { StatusBoardItemDTO, PatchStatusPayload } from "../statusBoardApi";

/**
 * Card handlers interface
 */
export interface CardHandlers {
  expandedId: string | null;
  onToggleExpand: (itemId: string) => void;
  onTogglePin: (item: StatusBoardItemDTO) => void;
  onToggleHide: (item: StatusBoardItemDTO) => void;
  onViewItem: (item: StatusBoardItemDTO) => void;
  onSaveOverride: (itemId: string, payload: PatchStatusPayload) => void;
}

/**
 * Props for CardGrid component
 */
export interface CardGridProps {
  /** Array of status board items to display */
  items: StatusBoardItemDTO[];
  /** Card interaction handlers */
  handlers: CardHandlers;
}

/**
 * Responsive card grid component.
 * 
 * Grid layout:
 * - Mobile (< 768px): 1 column
 * - Tablet (768px - 1024px): 2 columns
 * - Desktop (>= 1024px): 3 columns
 * 
 * Features:
 * - 16px gap spacing at all viewport sizes
 * - Uses item.id as React key for stability
 * - Maintains item reference throughout lifecycle
 * - Re-renders when items array changes
 * - Smooth transitions on viewport changes (300ms)
 * 
 * @example
 * <CardGrid
 *   items={filteredItems}
 *   handlers={{
 *     expandedId,
 *     onToggleExpand: (id) => setExpandedId(id),
 *     onTogglePin: handleTogglePin,
 *     onToggleHide: handleToggleHide,
 *     onViewItem: handleViewItem,
 *     onSaveOverride: handleSaveOverride
 *   }}
 * />
 */
export function CardGrid({ items, handlers }: CardGridProps) {
  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 transition-all duration-300">
      {items.map((item) => (
        <StatusCard
          key={item.id}
          item={item}
          isExpanded={handlers.expandedId === item.id}
          onToggleExpand={() => handlers.onToggleExpand(item.id)}
          onTogglePin={() => handlers.onTogglePin(item)}
          onToggleHide={() => handlers.onToggleHide(item)}
          onViewItem={() => handlers.onViewItem(item)}
          onSaveOverride={(payload) => handlers.onSaveOverride(item.id, payload)}
        />
      ))}
    </div>
  );
}
