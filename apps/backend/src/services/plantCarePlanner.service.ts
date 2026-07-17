import { prisma } from '../lib/prisma';
import { APIError } from '../middleware/error.middleware';
import { getWeatherReport } from './environment/weatherReport.service';
import { getAirQuality } from './environment/airQuality.service';
import { getDrought } from './environment/drought.service';
import { getHardinessZone } from './environment/hardinessZone.service';
import { resolveCountyFips } from './environment/fipsResolver.service';
import { getPropertyContext } from '../modules/propertyContext';
import { evaluatePlantAdvisorApplicability } from './plantAdvisor/applicabilityPolicy';
import type { PropertyContextSnapshot } from '../modules/propertyContext';

export interface PlantWeatherSignals {
  heat: boolean;
  freeze: boolean;
  storm: boolean;
  lowHumidity: boolean;
  poorAirQuality: boolean;
  heavyRain: boolean;
  droughtCategory: string | null;
}

export interface PlantCareRecommendation {
  id: string;
  homePlantId: string;
  plantName: string;
  locationName: string;
  priority: 'NOW' | 'SOON' | 'ROUTINE';
  title: string;
  guidance: string;
  wateringCadenceDays: number | null;
  adjustedCheckCadenceDays: number | null;
  placementWarning: string | null;
  triggers: string[];
}

export interface GardenZoneRecommendation {
  id: string;
  gardenZoneId: string;
  zoneName: string;
  title: string;
  guidance: string;
  priority: 'NOW' | 'SOON' | 'SEASONAL';
  season: 'SPRING' | 'SUMMER' | 'FALL' | 'WINTER';
  hardinessZone: string | null;
  actions: string[];
}

type PlannerPlant = {
  id: string;
  name: string;
  locationType: 'INDOOR' | 'OUTDOOR';
  roomName: string | null;
  zoneName: string | null;
  humidityPreference: string | null;
  lightLevel: string | null;
  wateringCadenceDays: number | null;
  lastWateredAt?: Date | null;
};

type PlannerZone = {
  id: string;
  name: string;
  sunExposure: string;
  soilDrainage: string;
  irrigationType: string;
  frostPocket: boolean;
};

const seasonForMonth = (month: number): GardenZoneRecommendation['season'] => {
  if (month >= 2 && month <= 4) return 'SPRING';
  if (month >= 5 && month <= 7) return 'SUMMER';
  if (month >= 8 && month <= 10) return 'FALL';
  return 'WINTER';
};

export function derivePlantCareRecommendations(
  plants: PlannerPlant[],
  signals: PlantWeatherSignals,
  now = new Date()
): PlantCareRecommendation[] {
  const recommendations: PlantCareRecommendation[] = [];
  for (const plant of plants) {
    const triggers: string[] = [];
    const guidance: string[] = [];
    let placementWarning: string | null = null;
    let priority: PlantCareRecommendation['priority'] = 'ROUTINE';
    let adjustedCheckCadenceDays = plant.wateringCadenceDays;

    if (signals.heat) {
      triggers.push('heat');
      priority = 'SOON';
      if (plant.wateringCadenceDays) adjustedCheckCadenceDays = Math.max(2, Math.round(plant.wateringCadenceDays * 0.75));
      guidance.push('Check soil moisture more often during sustained heat; water only when the plant and soil indicate it is needed.');
      if (plant.lastWateredAt && adjustedCheckCadenceDays) {
        const daysSinceWatered = Math.max(0, Math.floor((now.getTime() - plant.lastWateredAt.getTime()) / 86_400_000));
        guidance.push(`Watering was recorded ${daysSinceWatered} day${daysSinceWatered === 1 ? '' : 's'} ago; use the soil check to decide whether action is due.`);
        if (daysSinceWatered >= adjustedCheckCadenceDays) priority = 'NOW';
      }
      if (plant.lightLevel === 'BRIGHT_DIRECT') placementWarning = 'Watch for leaf stress near unusually hot windows or reflected outdoor heat.';
    }
    if (signals.lowHumidity && plant.humidityPreference === 'HIGH') {
      triggers.push('low_humidity');
      priority = 'SOON';
      guidance.push('This plant prefers higher humidity; inspect for dry leaf edges before changing its routine.');
    }
    if (signals.freeze) {
      triggers.push('freeze');
      priority = 'NOW';
      placementWarning = plant.locationType === 'INDOOR'
        ? 'Move it back from cold glass, exterior doors, and persistent drafts while preserving adequate light.'
        : 'Use species-appropriate frost protection or move containers to shelter before temperatures fall.';
    }
    if (signals.storm) {
      triggers.push('storm');
      if (priority !== 'NOW') priority = 'SOON';
      guidance.push(plant.locationType === 'INDOOR'
        ? 'Keep care steady if a power interruption changes room temperature or light.'
        : 'Secure or shelter containers before strong wind arrives.');
    }
    if (signals.poorAirQuality && plant.locationType === 'INDOOR') {
      triggers.push('poor_air_quality');
      guidance.push('Keep the plant away from open windows while outdoor air is poor; plants do not replace indoor-air filtration.');
    }
    if (signals.droughtCategory && plant.locationType === 'OUTDOOR') {
      triggers.push('drought');
      if (priority !== 'NOW') priority = 'SOON';
      guidance.push('Follow local watering restrictions and check root-zone moisture before supplemental watering.');
    }

    if (triggers.length === 0) continue;
    recommendations.push({
      id: `${plant.id}:${triggers.join('-')}`,
      homePlantId: plant.id,
      plantName: plant.name,
      locationName: plant.roomName ?? plant.zoneName ?? (plant.locationType === 'OUTDOOR' ? 'Outdoor area' : 'Indoor room'),
      priority,
      title: priority === 'NOW' ? `Protect ${plant.name} now` : `Weather-aware care for ${plant.name}`,
      guidance: guidance.join(' '),
      wateringCadenceDays: plant.wateringCadenceDays,
      adjustedCheckCadenceDays,
      placementWarning,
      triggers,
    });
  }
  const priorityRank = { NOW: 0, SOON: 1, ROUTINE: 2 } as const;
  return recommendations.sort((a, b) => priorityRank[a.priority] - priorityRank[b.priority]);
}

export function deriveGardenZoneRecommendations(
  zones: PlannerZone[],
  signals: PlantWeatherSignals,
  hardinessZone: string | null,
  now = new Date()
): GardenZoneRecommendation[] {
  const season = seasonForMonth(now.getUTCMonth());
  return zones.map(zone => {
    const actions: string[] = [];
    let priority: GardenZoneRecommendation['priority'] = 'SEASONAL';
    let title = `${season.charAt(0)}${season.slice(1).toLowerCase()} plan for ${zone.name}`;

    if (signals.freeze || zone.frostPocket) {
      priority = signals.freeze ? 'NOW' : 'SOON';
      title = `Frost preparation for ${zone.name}`;
      actions.push('Protect tender plants with species-appropriate covers and shelter movable containers.');
      if (zone.frostPocket) actions.push('This zone is marked as a frost pocket; monitor it earlier than the general property forecast.');
    }
    if (signals.droughtCategory) {
      if (priority === 'SEASONAL') priority = 'SOON';
      actions.push(`Plan for ${signals.droughtCategory} drought conditions and follow local watering restrictions.`);
      actions.push(zone.irrigationType === 'NONE'
        ? 'Favor locally appropriate drought-tolerant plants and establish a manual deep-watering plan.'
        : `Inspect ${zone.irrigationType.toLowerCase()} irrigation for leaks and target water to root zones.`);
    }
    if (signals.heavyRain) {
      if (priority === 'SEASONAL') priority = 'SOON';
      actions.push(zone.soilDrainage === 'SLOW'
        ? 'Slow drainage is recorded; avoid planting until standing water clears and verify roots will not remain saturated.'
        : 'Check drainage paths and postpone planting while soil is saturated.');
    }
    if (actions.length === 0) {
      if (season === 'SPRING') actions.push('Use the local last-frost window before installing tender plants.', 'Choose plants suited to the recorded sun and drainage conditions.');
      if (season === 'SUMMER') actions.push('Prioritize establishment watering and avoid planting during peak heat.', 'Inspect mulch depth without piling mulch against stems.');
      if (season === 'FALL') actions.push('Favor cool-season establishment where locally appropriate.', 'Reduce watering frequency as growth and evaporation slow.');
      if (season === 'WINTER') actions.push('Plan selections and placement now; avoid working frozen or saturated soil.', 'Verify mature plant size before spring purchasing.');
    }
    const context = [
      hardinessZone ? `hardiness zone ${hardinessZone}` : null,
      zone.sunExposure !== 'UNKNOWN' ? zone.sunExposure.toLowerCase().replace('_', ' ') : null,
      zone.soilDrainage !== 'UNKNOWN' ? `${zone.soilDrainage.toLowerCase()} drainage` : null,
    ].filter(Boolean).join(', ');
    return {
      id: `${zone.id}:${season}:${priority}`,
      gardenZoneId: zone.id,
      zoneName: zone.name,
      title,
      guidance: context ? `Recommendations use ${context}. Confirm species suitability with a local authoritative source before planting.` : 'Add sun and drainage details for more specific seasonal guidance.',
      priority,
      season,
      hardinessZone,
      actions,
    };
  });
}

export class PlantCarePlannerService {
  private async getContext(propertyId: string, userId: string): Promise<PropertyContextSnapshot> {
    return getPropertyContext(propertyId, { userId }, {
      scopes: ['EXTERIOR', 'RESPONSIBILITY', 'ROOMS'],
    });
  }

  private async assertOutdoorApplicable(propertyId: string, userId: string): Promise<void> {
    const decision = evaluatePlantAdvisorApplicability(await this.getContext(propertyId, userId), 'OUTDOOR');
    if (decision.status !== 'APPLICABLE') {
      const error = new APIError(`Outdoor Plant Advisor is not available: ${decision.reasonCodes.join(', ')}`, 422, 'PLANT_ADVISOR_NOT_APPLICABLE');
      (error as any).decision = decision;
      throw error;
    }
  }

  async getOutlook(propertyId: string, userId: string) {
    const context = await this.getContext(propertyId, userId);
    const featureDecision = evaluatePlantAdvisorApplicability(context, 'FEATURE');
    const indoorDecision = evaluatePlantAdvisorApplicability(context, 'INDOOR');
    const outdoorDecision = evaluatePlantAdvisorApplicability(context, 'OUTDOOR');
    const property = await prisma.property.findUnique({
      where: { id: propertyId },
      select: { id: true, latitude: true, longitude: true, zipCode: true },
    });
    if (!property) throw new APIError('Property not found', 404, 'PROPERTY_NOT_FOUND');

    const [plants, zones, weather, airQuality, hardiness, drought] = await Promise.all([
      prisma.homePlant.findMany({
        where: { propertyId, isActive: true },
        orderBy: { createdAt: 'asc' },
        include: { room: { select: { name: true } }, gardenZone: { select: { name: true } }, plantCatalog: true },
      }),
      prisma.gardenZone.findMany({ where: { propertyId }, orderBy: { name: 'asc' } }),
      property.latitude !== null && property.longitude !== null ? getWeatherReport(property.latitude, property.longitude) : Promise.resolve(null),
      property.latitude !== null && property.longitude !== null ? getAirQuality(property.latitude, property.longitude) : Promise.resolve(null),
      getHardinessZone(property.zipCode),
      property.latitude !== null && property.longitude !== null
        ? resolveCountyFips(property.latitude, property.longitude).then(fips => getDrought(fips))
        : Promise.resolve(null),
    ]);

    const weatherData = weather?.status === 'ok' ? weather.data : null;
    const airData = airQuality?.status === 'ok' ? airQuality.data : null;
    const droughtData = drought?.status === 'ok' ? drought.data : null;
    const signals: PlantWeatherSignals = {
      heat: Boolean(weatherData?.tenDayForecast.some(day => day.tempMaxF >= 95)),
      freeze: Boolean(weatherData?.tenDayForecast.some(day => day.tempMinF <= 28)),
      storm: Boolean(weatherData?.tenDayForecast.some(day => [95, 96, 99].includes(day.weatherCode))),
      lowHumidity: Boolean(weatherData && weatherData.current.humidityPercent <= 30),
      poorAirQuality: Boolean(airData && airData.current.aqi > 100),
      heavyRain: Boolean(weatherData?.tenDayForecast.some(day => day.precipitationSumIn >= 1)),
      droughtCategory: droughtData?.current && ['D2', 'D3', 'D4'].includes(droughtData.current.dominantCategory)
        ? droughtData.current.dominantCategory
        : null,
    };
    const hardinessZone = hardiness.status === 'ok' ? hardiness.data.zone : null;
    const applicablePlants = outdoorDecision.status === 'APPLICABLE'
      ? plants
      : plants.filter(plant => plant.locationType === 'INDOOR');
    const applicableZones = outdoorDecision.status === 'APPLICABLE' ? zones : [];
    const irrigationFact = context.facts['exterior.hasIrrigation'];
    const hasIrrigation = irrigationFact?.state === 'KNOWN' ? irrigationFact.value === true : null;
    const plannerPlants: PlannerPlant[] = applicablePlants.map(plant => ({
      id: plant.id,
      name: plant.nickname || plant.name,
      locationType: plant.locationType,
      roomName: plant.room?.name ?? null,
      zoneName: plant.gardenZone?.name ?? null,
      humidityPreference: plant.plantCatalog?.humidityPreference ?? null,
      lightLevel: plant.plantCatalog?.lightLevel ?? null,
      wateringCadenceDays: plant.plantCatalog?.wateringCadenceDays ?? null,
      lastWateredAt: plant.lastWateredAt,
    }));
    const plannerZones: PlannerZone[] = applicableZones.map(zone => ({
      id: zone.id,
      name: zone.name,
      sunExposure: zone.sunExposure,
      soilDrainage: zone.soilDrainage,
      irrigationType: zone.irrigationType === 'UNKNOWN' && hasIrrigation === false ? 'NONE' : zone.irrigationType,
      frostPocket: zone.frostPocket,
    }));
    return {
      applicability: {
        feature: featureDecision,
        indoor: indoorDecision,
        outdoor: outdoorDecision,
      },
      signals,
      hardinessZone,
      plants: applicablePlants,
      zones: applicableZones,
      careRecommendations: derivePlantCareRecommendations(plannerPlants, signals),
      gardenRecommendations: deriveGardenZoneRecommendations(plannerZones, signals, hardinessZone),
    };
  }

  async createPlant(propertyId: string, userId: string, input: any) {
    if (input.locationType === 'OUTDOOR' || input.gardenZoneId) {
      await this.assertOutdoorApplicable(propertyId, userId);
    }
    if (input.roomId) {
      const room = await prisma.inventoryRoom.findFirst({ where: { id: input.roomId, propertyId }, select: { id: true } });
      if (!room) throw new APIError('Room not found', 404, 'ROOM_NOT_FOUND');
    }
    if (input.gardenZoneId) {
      const zone = await prisma.gardenZone.findFirst({ where: { id: input.gardenZoneId, propertyId }, select: { id: true } });
      if (!zone) throw new APIError('Garden zone not found', 404, 'GARDEN_ZONE_NOT_FOUND');
    }
    return prisma.homePlant.create({ data: { propertyId, ...input } });
  }

  async updatePlantCare(propertyId: string, plantId: string, input: any) {
    const plant = await prisma.homePlant.findFirst({ where: { id: plantId, propertyId }, select: { id: true } });
    if (!plant) throw new APIError('Plant not found', 404, 'PLANT_NOT_FOUND');
    return prisma.homePlant.update({ where: { id: plantId }, data: input });
  }

  async createGardenZone(propertyId: string, userId: string, input: any) {
    await this.assertOutdoorApplicable(propertyId, userId);
    return prisma.gardenZone.create({ data: { propertyId, ...input } });
  }

  async updateGardenZone(propertyId: string, userId: string, zoneId: string, input: any) {
    await this.assertOutdoorApplicable(propertyId, userId);
    const zone = await prisma.gardenZone.findFirst({ where: { id: zoneId, propertyId }, select: { id: true } });
    if (!zone) throw new APIError('Garden zone not found', 404, 'GARDEN_ZONE_NOT_FOUND');
    return prisma.gardenZone.update({ where: { id: zoneId }, data: input });
  }
}
