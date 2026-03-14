import { api } from '@/lib/api/client';
import type { PageContextId } from './contextToolMappings';
import type { ToolId } from './toolRegistry';

type RelatedToolsEventName = 'related_tools_impression' | 'related_tools_click';

type TrackRelatedToolsInput = {
  propertyId?: string | null;
  pageContext: PageContextId;
  currentToolId?: ToolId | null;
  recommendedToolIds: ToolId[];
  clickedToolId?: ToolId | null;
  positionIndex?: number;
};

export async function trackRelatedToolsEvent(
  event: RelatedToolsEventName,
  {
    propertyId,
    pageContext,
    currentToolId,
    recommendedToolIds,
    clickedToolId,
    positionIndex,
  }: TrackRelatedToolsInput,
): Promise<void> {
  if (!propertyId) return;

  await api.trackHomeEventRadarEvent(propertyId, {
    event,
    section: 'related_tools',
    metadata: {
      page_context: pageContext,
      current_tool_id: currentToolId ?? null,
      recommended_tool_ids: recommendedToolIds,
      clicked_tool_id: clickedToolId ?? null,
      position_index: positionIndex ?? null,
    },
  });
}
