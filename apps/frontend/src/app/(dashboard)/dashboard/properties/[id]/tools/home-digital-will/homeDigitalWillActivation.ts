import type { ResolvedToolDestinationContext } from '@/features/tools/toolDestinationContext';
import type { DigitalWill, SectionType } from './types';

export function homeDigitalWillHandoffReadiness(
  will: Pick<DigitalWill, 'sections' | 'trustedContacts'>,
) {
  const emergency = will.sections.find(
    (section) => section.type === 'EMERGENCY' && section.isEnabled,
  );
  const primary = will.trustedContacts.find((contact) => contact.isPrimary);
  const missingRequirements = [
    ...(!emergency?.entries.some((entry) => entry.isEmergency)
      ? ['Add an emergency instruction.']
      : []),
    ...(!primary ? ['Choose a primary trusted contact.'] : []),
    ...(primary && !primary.email && !primary.phone
      ? ['Add an email or phone number for the primary contact.']
      : []),
  ];
  return {
    state: missingRequirements.length === 0
      ? 'READY' as const
      : 'NEEDS_CONTEXT' as const,
    missingRequirements,
  };
}

export function homeDigitalWillDestinationSection(input: {
  toolId?: string | null;
  resolved?: ResolvedToolDestinationContext | null;
}): SectionType | null {
  if (input.toolId !== 'home-digital-will' || !input.resolved) return null;
  return input.resolved.prefill.entityType?.trim().toUpperCase() === 'DOCUMENT'
    ? 'CRITICAL_INFO'
    : null;
}
