// Household access summary (Sole Homeowner Interface FRD FR-REC-002: "Deferred household management does not defer a truthful access
// summary"). A read-only answer over the same member list the Record's household section pages (`readHouseholdAccessPage`, itself over
// `HouseholdService.listMembers`, the read `GET /household/members` serves to any household member). It returns names, roles, who is the
// primary owner, who the reader is, and when each person joined: never an email address, avatar, last login, or pending invitation.
// Inviting people, changing roles, and removing access are owner-only and stay with HOUSEHOLD_INVITATION and household management.
import { type AskOperationResult } from '../askOperationRegistry';
import { registerCapabilityHandler } from '../capabilityHandlerRegistry';
import { ensurePropertyAccess } from '../askHandlerSupport';
import { readHouseholdAccessPage } from '../askRecordCollections.service';
import { humanDate } from '../askFormatting';

const MAX_LISTED = 50;

async function householdAccessResult(userId: string, propertyId: string): Promise<AskOperationResult> {
  await ensurePropertyAccess(userId, propertyId);
  const page = await readHouseholdAccessPage({ propertyId, userId }, { limit: MAX_LISTED });
  const members = page.rows;
  if (members.length === 0) {
    return {
      status: 'ANSWERED', reasonCode: 'NO_HOUSEHOLD_MEMBERS',
      blocks: [{ type: 'EMPTY_STATE', id: 'household-access-empty', title: 'No household members recorded', body: 'Ask found no one with recorded access to this home.', actions: [] }],
      suggestions: [],
    };
  }
  const count = (role: string) => members.filter((member) => member.role === role).length;
  const roleParts = [['owner', 'OWNER'], ['contributor', 'CONTRIBUTOR'], ['viewer', 'VIEWER']]
    .map(([label, role]) => ({ label, n: count(role) })).filter((entry) => entry.n > 0)
    .map((entry) => `${entry.n} ${entry.label}${entry.n === 1 ? '' : 's'}`);
  const truncated = page.total > members.length;
  return {
    status: 'ANSWERED', reasonCode: 'HOUSEHOLD_ACCESS_FOUND',
    blocks: [{
      type: 'SUMMARY', id: 'household-access-summary',
      title: `${page.total} ${page.total === 1 ? 'person has' : 'people have'} access to this home`,
      body: `${roleParts.join(', ')}.${truncated ? ` Showing the first ${members.length}.` : ''}`,
      tone: 'DEFAULT', actions: [],
    }, {
      type: 'GROUPED_LIST', filters: [], id: 'household-access-members', title: 'Household members',
      description: 'Names, roles and join dates only. Email addresses and pending invitations are not shown here.',
      sections: [{
        id: 'members', title: 'Who has access', count: page.total,
        items: members.map((member) => ({
          id: member.id,
          title: member.name,
          description: null,
          meta: [
            member.roleLabel,
            member.isPrimaryOwner ? 'Primary owner' : null,
            member.isYou ? 'You' : null,
            humanDate(new Date(member.joinedAt)) ? `Joined ${humanDate(new Date(member.joinedAt))}` : null,
          ].filter((value): value is string => Boolean(value)),
          status: null, href: null,
        })),
      }],
      actions: [],
    }, {
      type: 'BOUNDARY', id: 'household-access-boundary', title: 'Changing access',
      body: 'Inviting people, changing roles and removing access are owner-only. Ask can start an invitation if you are an owner.',
      severity: 'INFO', suggestions: [],
    }],
    suggestions: [],
  };
}

registerCapabilityHandler('household.access-summary', async (envelope) => householdAccessResult(envelope.userId, envelope.propertyId!));
