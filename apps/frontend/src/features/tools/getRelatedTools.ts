import { CONTEXT_TOOL_MAPPINGS, type PageContextId } from './contextToolMappings';
import { isToolId, type ToolId } from './toolRegistry';

const DEFAULT_MAX_ITEMS = 3;
const ABSOLUTE_MAX_ITEMS = 4;
const MIN_ITEMS_TO_RENDER = 2;

type GetRelatedToolIdsInput = {
  context?: PageContextId | null;
  currentToolId?: ToolId | null;
  maxItems?: number;
};

export function getContextToolId(context?: PageContextId | null): ToolId | null {
  return isToolId(context) ? context : null;
}

export function filterRelatedToolIds({
  candidateToolIds,
  currentToolId,
  maxItems = DEFAULT_MAX_ITEMS,
}: {
  candidateToolIds: readonly ToolId[];
  currentToolId?: ToolId | null;
  maxItems?: number;
}): ToolId[] {
  const limit = Math.min(Math.max(maxItems, 1), ABSOLUTE_MAX_ITEMS);
  const seen = new Set<ToolId>();
  const results: ToolId[] = [];

  for (const toolId of candidateToolIds) {
    if (toolId === currentToolId) continue;
    if (seen.has(toolId)) continue;
    seen.add(toolId);
    results.push(toolId);

    if (results.length === limit) {
      break;
    }
  }

  return results.length >= MIN_ITEMS_TO_RENDER ? results : [];
}

export function getRelatedToolIds({
  context,
  currentToolId,
  maxItems = DEFAULT_MAX_ITEMS,
}: GetRelatedToolIdsInput): ToolId[] {
  if (!context) return [];

  const effectiveCurrentToolId = currentToolId ?? getContextToolId(context);
  const related = CONTEXT_TOOL_MAPPINGS[context] ?? [];

  return filterRelatedToolIds({
    candidateToolIds: related,
    currentToolId: effectiveCurrentToolId,
    maxItems,
  });
}
