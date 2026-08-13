// Ask Intelligence FRD §18.3, Phase 9C admin controls -- kill switch +
// decision monitoring log for home-action proactive delivery.
import { api } from './client';

export interface HomeActionProactiveDeliveryKillSwitchState {
  paused: boolean;
  reason: string | null;
  pausedBy: string | null;
  pausedAt: string | null;
}

export interface HomeActionProactiveDeliveryStatus {
  envEnabled: boolean;
  killSwitch: HomeActionProactiveDeliveryKillSwitchState;
  active: boolean;
}

export interface HomeActionProactiveDeliveryDecision {
  id: string;
  propertyId: string;
  userId: string;
  homeActionId: string;
  category: string;
  eligible: boolean;
  reasonCodes: string[];
  escalationBudgetBypassed: boolean;
  notificationId: string | null;
  createdAt: string;
}

export async function getHomeActionProactiveDeliveryStatus() {
  return (await api.get<HomeActionProactiveDeliveryStatus>('/api/admin/home-action-proactive-delivery/status')).data;
}

export async function listHomeActionProactiveDeliveryDecisions(limit = 50) {
  return (await api.get<HomeActionProactiveDeliveryDecision[]>('/api/admin/home-action-proactive-delivery/decisions', {
    params: { limit },
  })).data;
}

export async function pauseHomeActionProactiveDelivery(reason: string) {
  return (await api.post<HomeActionProactiveDeliveryKillSwitchState>('/api/admin/home-action-proactive-delivery/kill-switch/pause', { reason })).data;
}

export async function resumeHomeActionProactiveDelivery() {
  return (await api.post<HomeActionProactiveDeliveryKillSwitchState>('/api/admin/home-action-proactive-delivery/kill-switch/resume', {})).data;
}
