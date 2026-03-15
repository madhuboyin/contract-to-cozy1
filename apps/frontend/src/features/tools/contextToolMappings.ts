import type { ToolId } from './toolRegistry';

export type PageContextId =
  | ToolId
  | 'property-detail'
  | 'property-hub'
  | 'rooms'
  | 'room-detail'
  | 'find-services'
  | 'warranties'
  | 'maintenance'
  | 'claims'
  | 'insurance'
  | 'dashboard';

export type ContextToolMapping = Readonly<Record<PageContextId, readonly ToolId[]>>;

export const CONTEXT_TOOL_MAPPINGS: ContextToolMapping = {
  // Pricing and quote review tools ladder into explanation and downstream math.
  'service-price-radar': ['negotiation-shield', 'cost-explainer', 'true-cost'],
  'negotiation-shield': ['service-price-radar', 'cost-explainer', 'true-cost'],
  'cost-explainer': ['true-cost', 'break-even', 'cost-growth'],
  'true-cost': ['cost-explainer', 'break-even', 'sell-hold-rent'],
  'sell-hold-rent': ['break-even', 'cost-volatility', 'capital-timeline'],
  'break-even': ['sell-hold-rent', 'true-cost', 'cost-growth'],
  'cost-volatility': ['cost-growth', 'break-even', 'sell-hold-rent'],
  'property-tax': ['true-cost', 'cost-growth', 'capital-timeline'],
  'cost-growth': ['cost-volatility', 'break-even', 'true-cost'],
  'insurance-trend': ['true-cost', 'cost-volatility', 'home-risk-replay'],

  // Monitoring tools naturally connect current signals, historical context, and follow-up planning.
  'home-event-radar': ['home-risk-replay', 'home-timeline', 'status-board'],
  'home-risk-replay': ['home-event-radar', 'home-timeline', 'status-board'],
  'home-timeline': ['home-risk-replay', 'home-event-radar', 'seller-prep'],
  'seller-prep': ['sell-hold-rent', 'home-timeline', 'capital-timeline'],
  'status-board': ['home-event-radar', 'home-risk-replay', 'home-timeline'],
  'capital-timeline': ['home-timeline', 'seller-prep', 'cost-growth'],

  // Property-level contexts should surface the strongest monitoring + planning helpers only.
  'property-detail': ['home-event-radar', 'home-risk-replay', 'status-board'],
  'property-hub': ['home-event-radar', 'home-risk-replay', 'status-board'],
  rooms: ['status-board', 'home-timeline', 'home-risk-replay'],
  'room-detail': ['status-board', 'home-risk-replay', 'service-price-radar'],
  'find-services': ['service-price-radar', 'negotiation-shield', 'cost-explainer'],
  warranties: ['status-board', 'home-risk-replay', 'insurance-trend'],
  maintenance: ['service-price-radar', 'status-board', 'home-risk-replay'],
  claims: ['home-event-radar', 'home-risk-replay', 'negotiation-shield'],
  insurance: ['insurance-trend', 'home-risk-replay', 'status-board'],
  dashboard: ['home-event-radar', 'status-board', 'home-risk-replay'],
  'home-digital-will': ['home-event-radar', 'home-risk-replay', 'status-board'],
  // Asset discovery and system modeling surface each other naturally.
  'hidden-asset-finder': ['home-digital-twin', 'home-digital-will', 'status-board'],
  // From the digital twin, capital planning and risk history are the most relevant follow-ons.
  'home-digital-twin': ['capital-timeline', 'status-board', 'home-risk-replay'],
};
