import { logger } from '../../lib/logger';
import { readAskOperationalControls } from '../../config/askOperationalControls';
import { composeSkillContext } from '../skills/context/skillContextComposer';
import { skillContextProviderKey } from '../skills/context/skillContextProviderRegistry';
import { PROPERTY_JOURNEY_CONTEXT_PROVIDER, type AskOperatingMode } from '../skills/context/propertyJourneyContext.contract';
import { getSkillDefinition } from '../skills/skillRegistry';
import { journeyContextFrom } from './askHandlerSupport';

export async function loadOperatingMode(userId: string, propertyId: string): Promise<AskOperatingMode> {
  try {
    const skill = getSkillDefinition('property-record');
    if (!skill) return 'UNKNOWN';
    const composed = await composeSkillContext(
      { skill, operationId: 'PROPERTY_SUMMARY', userId, propertyId },
      { providerEnabled: readAskOperationalControls().contextProviderEnabled },
    );
    const entry = composed.entries.find((candidate) => candidate.key === skillContextProviderKey(PROPERTY_JOURNEY_CONTEXT_PROVIDER));
    return entry?.status === 'AVAILABLE' ? (journeyContextFrom(composed)?.operatingMode ?? 'UNKNOWN') : 'UNKNOWN';
  } catch (error) {
    logger.warn({ err: error, propertyId, userId }, 'Record index lifecycle context failed closed');
    return 'UNKNOWN';
  }
}
