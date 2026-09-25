// Moved out of askOrchestrator.service.ts unchanged (decomposition phase 1, FRD v1.98;
// docs/architecture/ASK_ORCHESTRATOR_DECOMPOSITION_REVIEW.md). The handler registers itself, and the orchestrator
// re-exports the names below so existing imports keep working.
import { type AskPresentationBlock } from '../../../productFramework/ask/ask.contract';
import { type AskOperationResult } from '../askOperationRegistry';
import { registerCapabilityHandler } from '../capabilityHandlerRegistry';
import { humanDate, readableCode } from '../askFormatting';
import { HomeDigitalWillService, evaluateHomeDigitalWillHandoffReadiness } from '../../homeDigitalWill.service';

// Home Digital Will (Home Continuity Plan) capability-card slice (FRD v1.54): the sixth new operation for a capability
// with none. Reads HomeDigitalWillService.getByProperty, the same call the page's route makes, behind the same
// CONTRIBUTOR floor. Entries can hold access notes (gate codes, key locations) and Ask keeps its answers in the
// conversation, so the answer lists entry titles only -- never entry content or summaries -- and trusted contacts by
// name and role, without email, phone or notes. The details stay on the page. Read-only.
type DigitalWillView = Awaited<ReturnType<HomeDigitalWillService['getByProperty']>>;
const DIGITAL_WILL_MISSING_LABELS: Record<string, string> = {
  'emergency-instruction': 'Add an emergency instruction.',
  'primary-trusted-contact': 'Choose a primary trusted contact.',
  'primary-contact-method': 'Add an email or phone number for the primary contact.',
};

// IW-PRES-020 (FRD v1.94): whether the Home Continuity Plan can be handed off, as a ring over the three requirements the
// handoff check itself keeps (an emergency instruction, a primary trusted contact, a way to reach that contact). The plan's
// own `completionPercent` is self-reported (the client sets it and publishing forces it to 100), so it is not used. With
// no primary contact the contact-method requirement is unmet as well, though the check lists only the first. The next steps
// are the unmet requirements in the plan's own words; no entry or contact detail is repeated here.
export function digitalWillHandoffProgress(
  missingRequirements: readonly string[],
  entryCount: number,
  pageHref: string,
): Extract<AskPresentationBlock, { type: 'PROGRESS' }> {
  const requirements = ['emergency-instruction', 'primary-trusted-contact', 'primary-contact-method'];
  const unmet = requirements.filter((code) => missingRequirements.includes(code) || (code === 'primary-contact-method' && missingRequirements.includes('primary-trusted-contact')));
  const met = requirements.length - unmet.length;
  return {
    type: 'PROGRESS', id: 'digital-will-progress', title: 'Ready to hand off',
    description: 'Counts the three things the plan needs before someone else can take over: an emergency instruction, a primary trusted contact, and a way to reach that contact. Other entries are not counted.',
    percent: Math.round((met / requirements.length) * 100),
    basis: `${met} of ${requirements.length} handoff requirements met`,
    metrics: [
      { label: 'Met', value: String(met), tone: 'DEFAULT' },
      { label: 'Missing', value: String(unmet.length), tone: unmet.length ? 'CAUTION' : 'DEFAULT' },
      { label: 'Entries', value: String(entryCount), tone: 'DEFAULT' },
    ],
    nextSteps: unmet.map((code) => ({ id: `handoff-${code}`, title: DIGITAL_WILL_MISSING_LABELS[code] ?? readableCode(code), description: 'Handoff requirement not met yet', meta: [], status: 'MISSING', href: pageHref, entityType: null })),
    actions: [],
  };
}

export function digitalWillFromView(will: DigitalWillView, propertyId: string): AskOperationResult {
  const pageHref = `/dashboard/properties/${encodeURIComponent(propertyId)}/tools/home-digital-will`;
  const boundary: AskPresentationBlock = {
    type: 'BOUNDARY', id: 'digital-will-boundary', title: 'A home knowledge plan, not a legal will',
    body: 'The Home Continuity Plan records how this home runs so someone else can take over. It is not a legal will or estate document. Entry details and contact information stay on the plan itself and are not repeated here.',
    severity: 'INFO', suggestions: [],
  };
  if (!will) {
    return {
      status: 'ANSWERED', reasonCode: 'DIGITAL_WILL_NOT_STARTED',
      blocks: [{
        type: 'SUMMARY', id: 'digital-will-summary', title: 'No Home Continuity Plan yet',
        body: 'A Home Continuity Plan records emergency instructions, key contacts, utilities and how the home runs, for whoever needs to take over. Open it to start one.',
        tone: 'DEFAULT',
        actions: [{ id: 'open-home-digital-will', label: 'Open Home Continuity Plan', href: pageHref, style: 'PRIMARY' }],
      }, boundary],
      suggestions: ['What home records do I have?'],
    };
  }
  const handoff = evaluateHomeDigitalWillHandoffReadiness(will);
  const enabled = will.sections.filter((section) => section.isEnabled);
  const entryCount = enabled.reduce((sum, section) => sum + section.entries.length, 0);
  const blocks: AskPresentationBlock[] = [{
    type: 'SUMMARY', id: 'digital-will-summary',
    title: `${will.title || 'Home Continuity Plan'}: ${readableCode(will.readiness)}, ${will.completionPercent ?? 0}% complete`,
    body: [
      `${will.status === 'ACTIVE' ? 'Published' : readableCode(will.status).replace(/^./, (c) => c.toUpperCase())}, with ${entryCount} entr${entryCount === 1 ? 'y' : 'ies'} across ${enabled.length} section${enabled.length === 1 ? '' : 's'} and ${will.trustedContacts.length} trusted contact${will.trustedContacts.length === 1 ? '' : 's'}.`,
      will.lastReviewedAt ? `Last reviewed ${humanDate(new Date(will.lastReviewedAt))}.` : 'Not reviewed yet.',
    ].join(' '),
    tone: handoff.state === 'READY' ? 'DEFAULT' : 'CAUTION',
    actions: [{ id: 'open-home-digital-will', label: 'Open Home Continuity Plan', href: pageHref, style: 'PRIMARY' }],
  }];
  // IW-PRES-020 (FRD v1.94): the handoff requirements as a ring, ahead of the not-ready note and the plan's sections.
  blocks.push(digitalWillHandoffProgress(handoff.missingRequirements, entryCount, pageHref));
  if (handoff.state !== 'READY') {
    blocks.push({
      type: 'LIMITATION', id: 'digital-will-handoff', title: 'Not ready to hand off yet',
      body: handoff.missingRequirements.map((code) => DIGITAL_WILL_MISSING_LABELS[code] ?? readableCode(code)).join(' '),
      severity: 'CAUTION',
    });
  }
  const sections = [
    ...enabled.filter((section) => section.entries.length).map((section) => ({
      id: `digital-will-section-${section.id}`, title: section.title || readableCode(section.type), count: section.entries.length,
      items: section.entries.map((entry) => ({
        id: entry.id,
        title: entry.title,
        description: null,
        meta: [
          readableCode(entry.entryType),
          ...(entry.priority === 'HIGH' || entry.priority === 'CRITICAL' ? [`${readableCode(entry.priority)} priority`] : []),
          ...(entry.isEmergency ? ['Emergency'] : []),
          ...(entry.isPinned ? ['Pinned'] : []),
        ],
        status: String(entry.priority),
        href: pageHref,
      })),
    })),
    ...(will.trustedContacts.length ? [{
      id: 'digital-will-contacts', title: 'Trusted contacts', count: will.trustedContacts.length,
      items: will.trustedContacts.map((contact) => ({
        id: contact.id,
        title: contact.name,
        description: null,
        meta: [
          readableCode(contact.role),
          `${readableCode(contact.accessLevel)} access`,
          ...(contact.isPrimary ? ['Primary'] : []),
        ],
        status: contact.isPrimary ? 'PRIMARY' : 'CONTACT',
        href: pageHref,
      })),
    }] : []),
  ];
  if (sections.length) {
    blocks.push({ type: 'GROUPED_LIST', filters: [], id: 'digital-will-items', title: 'What the plan holds', description: 'Entry titles by section and who can see the plan. Details are on the plan.', sections, actions: [] });
  }
  blocks.push(boundary);
  return {
    status: 'ANSWERED',
    reasonCode: handoff.state === 'READY' ? 'DIGITAL_WILL_READY' : 'DIGITAL_WILL_NEEDS_CONTEXT',
    blocks,
    suggestions: ['What home records do I have?', 'What maintenance is due?'],
  };
}

async function digitalWillResult(propertyId: string): Promise<AskOperationResult> {
  return digitalWillFromView(await new HomeDigitalWillService().getByProperty(propertyId), propertyId);
}

registerCapabilityHandler('home-digital-will.read', async (envelope) => digitalWillResult(envelope.propertyId!));
