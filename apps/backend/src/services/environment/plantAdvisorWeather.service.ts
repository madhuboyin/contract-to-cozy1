import { prisma } from '../../lib/prisma';
import type { EnvironmentInsight, EnvironmentInsightSections } from './environmentInsights.service';

export type PlantWeatherTrigger = 'heat' | 'freeze' | 'low_humidity' | 'storm' | 'air_quality';
export type PlantAdvisorContextLevel = 'added_plants' | 'saved_recommendations' | 'room_profiles' | 'setup';

export interface PlantAdvisorWeatherModule {
  id: string;
  trigger: PlantWeatherTrigger;
  relatedInsightId: string | null;
  title: string;
  summary: string;
  contextLevel: PlantAdvisorContextLevel;
  plantNames: string[];
  roomNames: string[];
  action: { label: string; href: string };
}

interface PlantContext {
  profiles: Array<{ roomId: string; roomName: string; roomType: string | null }>;
  plants: Array<{
    recommendationId: string;
    name: string;
    roomId: string;
    roomName: string;
    status: string;
    isAddedToHome: boolean;
    humidityPreference: string;
    lightLevel: string;
    maintenanceLevel: string;
    wateringCadenceDays: number | null;
  }>;
}

interface PlantWeatherHomeContext {
  coolingType?: string | null;
  heatingType?: string | null;
  hasSecondaryHeat?: boolean | null;
}

const unique = (values: string[]) => [...new Set(values.filter(Boolean))];
const formatList = (values: string[]) => {
  if (values.length <= 1) return values[0] ?? '';
  if (values.length === 2) return `${values[0]} and ${values[1]}`;
  return `${values.slice(0, -1).join(', ')}, and ${values[values.length - 1]}`;
};

function contextLevel(context: PlantContext): PlantAdvisorContextLevel {
  if (context.plants.some(plant => plant.isAddedToHome)) return 'added_plants';
  if (context.plants.length > 0) return 'saved_recommendations';
  if (context.profiles.length > 0) return 'room_profiles';
  return 'setup';
}

function setupCopy(trigger: PlantWeatherTrigger): Pick<PlantAdvisorWeatherModule, 'title' | 'summary'> {
  const titles: Record<PlantWeatherTrigger, string> = {
    heat: 'Help your plants through the heat',
    freeze: 'Help your plants through cold weather',
    low_humidity: 'Help your plants through dry air',
    storm: 'Prepare your plants for storm-related changes',
    air_quality: 'Keep plant care steady while outdoor air is poor',
  };
  return {
    title: titles[trigger],
    summary: 'Set up a room in Plant Advisor to receive weather-aware placement and care recommendations.',
  };
}

function personalizedCopy(
  trigger: PlantWeatherTrigger,
  context: PlantContext,
  home: PlantWeatherHomeContext
): Pick<PlantAdvisorWeatherModule, 'title' | 'summary'> {
  const level = contextLevel(context);
  const confirmed = context.plants.filter(plant => plant.isAddedToHome);
  const relevantPlants = confirmed.length > 0 ? confirmed : context.plants;
  const plantNames = unique(relevantPlants.map(plant => plant.name)).slice(0, 3);
  const roomNames = unique((relevantPlants.length > 0 ? relevantPlants.map(plant => plant.roomName) : context.profiles.map(profile => profile.roomName))).slice(0, 3);
  const subject = plantNames.length > 0
    ? `${formatList(plantNames)}${roomNames.length > 0 ? ` in ${formatList(roomNames)}` : ''}`
    : `Your ${formatList(roomNames)} plant profile${roomNames.length === 1 ? '' : 's'}`;
  const ownershipQualifier = level === 'saved_recommendations' ? 'Saved recommendations are not treated as confirmed plants. ' : '';

  if (trigger === 'heat') {
    const directLightPlants = relevantPlants.filter(plant => plant.lightLevel === 'BRIGHT_DIRECT').map(plant => plant.name);
    const coolingContext = home.coolingType && home.coolingType !== 'UNKNOWN'
      ? `Because this home uses ${home.coolingType.toLowerCase().replace(/_/g, ' ')} cooling, monitor how sustained operation changes room temperature and humidity. `
      : '';
    return {
      title: 'Help your indoor plants through the heat',
      summary: `${subject} may need closer soil-moisture checks as rooms warm up. ${coolingContext}${directLightPlants.length > 0 ? `Watch direct-sun exposure for ${formatList(unique(directLightPlants).slice(0, 2))} near hot windows.` : 'Watch for unusually hot window exposure and avoid watering on schedule without checking the soil.'} ${ownershipQualifier}`.trim(),
    };
  }
  if (trigger === 'freeze') {
    const heatingContext = home.heatingType && home.heatingType !== 'UNKNOWN'
      ? `This home uses ${home.heatingType.toLowerCase().replace(/_/g, ' ')} heat, so check whether plant rooms remain evenly heated. `
      : '';
    return {
      title: 'Protect indoor plants from the cold',
      summary: `${subject} may be sensitive to cold glass and drafts. ${heatingContext}Move vulnerable plants back from exterior doors and windows while keeping their usual light needs in mind. ${ownershipQualifier}`.trim(),
    };
  }
  if (trigger === 'low_humidity') {
    const humidityLovers = relevantPlants.filter(plant => plant.humidityPreference === 'HIGH').map(plant => plant.name);
    return {
      title: 'Dry air may affect your plants',
      summary: humidityLovers.length > 0
        ? `${formatList(unique(humidityLovers).slice(0, 3))} prefer higher humidity. Check for drying soil or leaf edges before changing their care routine. ${ownershipQualifier}`.trim()
        : `${subject} may experience drier conditions. Check soil and leaves before adjusting watering or placement. ${ownershipQualifier}`.trim(),
    };
  }
  if (trigger === 'storm') {
    const outageContext = home.hasSecondaryHeat === false
      ? 'No backup heat source is recorded, so room temperatures may change more quickly during a prolonged cold-weather outage. '
      : '';
    return {
      title: 'Prepare your plants for storm-related changes',
      summary: `${subject} may experience drafts, reduced light, or temperature changes during a power interruption. ${outageContext}Keep plants away from frequently opened exterior doors and avoid abrupt placement changes unless needed. ${ownershipQualifier}`.trim(),
    };
  }
  return {
    title: 'Keep plant care steady while outdoor air is poor',
    summary: `${subject} should remain away from open windows while outdoor air quality is poor. Keep normal care based on soil, light, and plant needs; houseplants are not a substitute for indoor-air filtration. ${ownershipQualifier}`.trim(),
  };
}

export function derivePlantAdvisorWeatherModules(
  propertyId: string,
  sections: EnvironmentInsightSections,
  insights: EnvironmentInsight[],
  context: PlantContext,
  home: PlantWeatherHomeContext = {}
): PlantAdvisorWeatherModule[] {
  const triggerInsights = new Map<PlantWeatherTrigger, EnvironmentInsight>();
  for (const insight of insights) {
    if (['heat', 'freeze', 'storm', 'air_quality'].includes(insight.category)) {
      triggerInsights.set(insight.category as PlantWeatherTrigger, insight);
    }
  }

  const triggers: Array<{ trigger: PlantWeatherTrigger; relatedInsightId: string | null }> = [];
  for (const trigger of ['heat', 'freeze', 'storm', 'air_quality'] as const) {
    const insight = triggerInsights.get(trigger);
    if (insight) triggers.push({ trigger, relatedInsightId: insight.id });
  }
  const currentHumidity = sections.weather.status === 'ok' ? sections.weather.data.current.humidityPercent : null;
  if (currentHumidity !== null && currentHumidity <= 30) {
    triggers.push({ trigger: 'low_humidity', relatedInsightId: null });
  }

  const level = contextLevel(context);
  const relevantPlants = context.plants.filter(plant => level !== 'added_plants' || plant.isAddedToHome);
  const roomNames = unique((relevantPlants.length > 0 ? relevantPlants.map(plant => plant.roomName) : context.profiles.map(profile => profile.roomName))).slice(0, 3);
  const plantNames = unique(relevantPlants.map(plant => plant.name)).slice(0, 3);

  return triggers.map(({ trigger, relatedInsightId }) => {
    const copy = level === 'setup' ? setupCopy(trigger) : personalizedCopy(trigger, context, home);
    const roomId = relevantPlants[0]?.roomId ?? context.profiles[0]?.roomId;
    const query = new URLSearchParams({ launchSurface: 'environment-report', weatherContext: trigger });
    if (roomId) query.set('roomId', roomId);
    return {
      id: `plant-advisor-${trigger}`,
      trigger,
      relatedInsightId,
      ...copy,
      contextLevel: level,
      plantNames,
      roomNames,
      action: {
        label: level === 'setup' ? 'Set up Plant Advisor' : level === 'room_profiles' ? 'Get plant recommendations' : 'Review my plants',
        href: `/dashboard/properties/${propertyId}/tools/plant-advisor?${query.toString()}`,
      },
    };
  });
}

export async function getPlantAdvisorWeatherModules(
  property: PlantWeatherHomeContext & { id: string },
  sections: EnvironmentInsightSections,
  insights: EnvironmentInsight[]
): Promise<PlantAdvisorWeatherModule[]> {
  const propertyId = property.id;
  const [profileRows, recommendationRows, addedEvents] = await Promise.all([
    prisma.roomPlantProfile.findMany({
      where: { propertyId },
      orderBy: { updatedAt: 'desc' },
      include: { room: { select: { id: true, name: true, type: true } } },
    }),
    prisma.roomPlantRecommendation.findMany({
      where: { propertyId, status: 'SAVED' },
      orderBy: [{ updatedAt: 'desc' }, { rank: 'asc' }],
      include: {
        room: { select: { id: true, name: true } },
        plantCatalog: {
          select: {
            commonName: true,
            humidityPreference: true,
            lightLevel: true,
            maintenanceLevel: true,
            wateringCadenceDays: true,
          },
        },
      },
    }),
    prisma.homeEvent.findMany({
      where: { propertyId, subtype: 'SMART_PLANT_ADVISOR' },
      select: { meta: true },
    }),
  ]);

  const latestProfiles = new Map<string, (typeof profileRows)[number]>();
  for (const profile of profileRows) {
    if (!latestProfiles.has(profile.roomId)) latestProfiles.set(profile.roomId, profile);
  }
  const addedRecommendationIds = new Set(
    addedEvents
      .map(event => event.meta && typeof event.meta === 'object' && !Array.isArray(event.meta)
        ? (event.meta as Record<string, unknown>).recommendationId
        : null)
      .filter((id): id is string => typeof id === 'string')
  );
  const context: PlantContext = {
    profiles: [...latestProfiles.values()].map(profile => ({
      roomId: profile.roomId,
      roomName: profile.room.name,
      roomType: profile.detectedRoomType ?? profile.room.type ?? null,
    })),
    plants: recommendationRows.map(recommendation => ({
      recommendationId: recommendation.id,
      name: recommendation.plantCatalog.commonName,
      roomId: recommendation.roomId,
      roomName: recommendation.room.name,
      status: recommendation.status,
      isAddedToHome: addedRecommendationIds.has(recommendation.id),
      humidityPreference: recommendation.plantCatalog.humidityPreference,
      lightLevel: recommendation.plantCatalog.lightLevel,
      maintenanceLevel: recommendation.plantCatalog.maintenanceLevel,
      wateringCadenceDays: recommendation.plantCatalog.wateringCadenceDays,
    })),
  };

  return derivePlantAdvisorWeatherModules(propertyId, sections, insights, context, property);
}
