import type { InventoryItem } from '@/types';
import type { IncidentDTO } from '@/types/incidents.types';

type ServicePriceRadarLaunchOptions = {
  propertyId: string;
  launchSurface?: string | null;
  serviceCategory?: string | null;
  serviceSubcategory?: string | null;
  serviceLabelRaw?: string | null;
  quoteAmount?: number | string | null;
  quoteVendorName?: string | null;
  linkedEntityType?: string | null;
  linkedEntityId?: string | null;
};

function setParam(params: URLSearchParams, key: string, value: string | number | null | undefined) {
  if (value === null || value === undefined) return;
  const nextValue = String(value).trim();
  if (!nextValue) return;
  params.set(key, nextValue);
}

function inferCategoryFromText(input: string): string | null {
  const text = input.trim().toLowerCase();
  if (!text) return null;

  if (text.includes('water heater') || text.includes('tankless')) return 'WATER_HEATER';
  if (/(hvac|furnace|air conditioning|air conditioner|a\/c|ac unit|heat pump|thermostat|duct)/.test(text)) {
    return 'HVAC';
  }
  if (/(roof|shingle|flashing|attic vent)/.test(text)) return 'ROOFING';
  if (/(plumb|pipe|drain|sewer|toilet|faucet|sink|garbage disposal|sump pump|leak)/.test(text)) {
    return 'PLUMBING';
  }
  if (/(electric|panel|breaker|outlet|switch|wiring|light fixture|generator)/.test(text)) {
    return 'ELECTRICAL';
  }
  if (/(window|door|garage door|sliding door)/.test(text)) return 'WINDOWS_DOORS';
  if (/(foundation|slab|crawlspace|structural crack)/.test(text)) return 'FOUNDATION';
  if (/(gutter|downspout)/.test(text)) return 'GUTTERS';
  if (/(drainage|grading|runoff|yard drain|french drain)/.test(text)) return 'LANDSCAPING_DRAINAGE';
  if (/(mold|remediation)/.test(text)) return 'MOLD_REMEDIATION';
  if (/(alarm|detector|security|camera|doorbell|co detector|smoke detector)/.test(text)) {
    return 'SECURITY_SAFETY';
  }
  if (/(appliance|refrigerator|fridge|washer|dryer|dishwasher|oven|range|microwave)/.test(text)) {
    return 'APPLIANCE_REPAIR';
  }

  return null;
}

export function buildServicePriceRadarHref({
  propertyId,
  launchSurface,
  serviceCategory,
  serviceSubcategory,
  serviceLabelRaw,
  quoteAmount,
  quoteVendorName,
  linkedEntityType,
  linkedEntityId,
}: ServicePriceRadarLaunchOptions): string {
  const params = new URLSearchParams();
  setParam(params, 'launchSurface', launchSurface);
  setParam(params, 'category', serviceCategory);
  setParam(params, 'subcategory', serviceSubcategory);
  setParam(params, 'label', serviceLabelRaw);
  setParam(params, 'quoteAmount', quoteAmount);
  setParam(params, 'vendor', quoteVendorName);
  setParam(params, 'linkedEntityType', linkedEntityType);
  setParam(params, 'linkedEntityId', linkedEntityId);

  const query = params.toString();
  return `/dashboard/properties/${propertyId}/tools/service-price-radar${query ? `?${query}` : ''}`;
}

export function inferServicePriceRadarCategoryFromInventoryItem(
  item: Pick<InventoryItem, 'category' | 'name'>
): string | null {
  const categoryMap: Record<string, string> = {
    HVAC: 'HVAC',
    PLUMBING: 'PLUMBING',
    ELECTRICAL: 'ELECTRICAL',
    ROOF_EXTERIOR: 'ROOFING',
    APPLIANCE: 'APPLIANCE_REPAIR',
    SAFETY: 'SECURITY_SAFETY',
    SMART_HOME: 'SECURITY_SAFETY',
  };

  const textMatch = inferCategoryFromText(item.name || '');
  if (textMatch) return textMatch;

  return categoryMap[String(item.category || '').toUpperCase()] ?? null;
}

export function inferServicePriceRadarCategoryFromIncident(
  incident: Pick<IncidentDTO, 'category' | 'typeKey' | 'title' | 'summary'>
): string | null {
  const textSources = [incident.category, incident.typeKey, incident.title, incident.summary]
    .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
    .join(' ');

  return inferCategoryFromText(textSources);
}
