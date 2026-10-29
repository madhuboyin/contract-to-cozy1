// Community inside Ask (register "Community"; FRD v1.479): the events, city alerts and trash and recycling information Desktop's Community page shows for a
// home's city. Pure: the routing patterns, which view a question asks for, and the declared actions that switch view. Read-only; nothing is saved.
export type CommunityView = 'ALL' | 'EVENTS' | 'ALERTS' | 'TRASH';

export const COMMUNITY_MESSAGES: Record<CommunityView, string> = {
  ALL: 'Show community updates for my home',
  EVENTS: 'Show community events near my home',
  ALERTS: 'Show city alerts for my area',
  TRASH: 'Show trash and recycling pickup for my home',
};
export const COMMUNITY_ACTION_IDS: Record<CommunityView, string> = {
  ALL: 'community-show-all', EVENTS: 'community-show-events', ALERTS: 'community-show-alerts', TRASH: 'community-show-trash',
};
export const COMMUNITY_VIEW_LABELS: Record<CommunityView, string> = { ALL: 'Show everything', EVENTS: 'Community events', ALERTS: 'City alerts', TRASH: 'Trash and recycling' };

/**
 * A question about what is going on in the home's community: events, the city's alerts or notices, or trash and recycling pickup. Writes ("add an event",
 * "log an event"), the home's own timeline, the event radar, the neighbourhood-change feed, weather, recalls and claims belong to other operations.
 */
export const communityPattern = new RegExp([
  String.raw`\b(?:community|local|city|neighbou?rhood|nearby)\s+(?:events?|festivals?|farmers?\s+markets?|happenings)\b`,
  String.raw`\b(?:events?|festivals?|farmers?\s+markets?|things to do)\b.{0,25}\b(?:near|around|in)\s+(?:my|the|our)\s+(?:home|house|area|neighbou?rhood|town|city)\b`,
  String.raw`\b(?:trash|garbage|recycling|rubbish|yard waste)\b.{0,30}\b(?:pick ?-?up|collection|schedule|day|days)\b`,
  String.raw`\b(?:when|what day)\b.{0,30}\b(?:trash|garbage|recycling)\b`,
  String.raw`\b(?:city|municipal|town|local)\s+(?:alerts?|notices?|announcements?|emergency notifications?)\b`,
  String.raw`\bcommunity\s+(?:alerts?|updates?|news)\b`,
].join('|'), 'i');
export const communityOtherIntentPattern = /\b(?:add|log|record|create|plan|host|organi[sz]e|weather|storm|forecast|recall|claim|maintenance|home event radar|event radar|risk replay|neighbou?rhood change|timeline|remind|notify|alert me)\b/i;

/** Which view a question asks for; a question that names more than one, or none, gets everything. */
export function communityViewFor(message: string): CommunityView {
  const wants: CommunityView[] = [];
  if (/\b(?:events?|festivals?|farmers?\s+markets?|things to do)\b/i.test(message)) wants.push('EVENTS');
  if (/\b(?:alerts?|notices?|announcements?|emergency|news)\b/i.test(message)) wants.push('ALERTS');
  if (/\b(?:trash|garbage|recycling|rubbish|yard waste|pick ?-?up|collection)\b/i.test(message)) wants.push('TRASH');
  return wants.length === 1 ? wants[0] : 'ALL';
}
