// "which projects still need permits and are scheduled for next month?" combines two recorded facts about a project: its permit applicability
// (ProjectRecord.permitApplicability = REQUIRED) and a date in the asked month. A date counts when a milestone is scheduled in it or the project's expected
// finish falls in it; the answer names which one matched, so the homeowner is never asked to pick a meaning the record can show.
export type ProjectPermitMonth = 'THIS_MONTH' | 'NEXT_MONTH' | null;
export interface ProjectPermitFilter { month: ProjectPermitMonth }

const PROJECTS = /\bprojects?\b/i;
const NEEDS_PERMIT = /\b(?:need|needs|needing|require|requires|requiring|still need|still needs|awaiting|without)\b[^.?!]{0,20}\bpermits?\b|\bpermits?\b[^.?!]{0,20}\b(?:needed|required|still needed|outstanding)\b/i;
const NEXT_MONTH = /\bnext month\b/i;
const THIS_MONTH = /\bthis month\b/i;
// A date phrase this filter does not understand must not be silently dropped.
const OTHER_DATE_PHRASE = /\b(?:next|this|last)\s+(?:week|year|quarter)\b|\bin\s+(?:january|february|march|april|may|june|july|august|september|october|november|december)\b|\b(?:today|tomorrow|yesterday)\b|\bby\s+\w+\s+\d{1,2}\b/i;

export function parseProjectPermitFilter(message: string): ProjectPermitFilter | null {
  if (!PROJECTS.test(message) || !NEEDS_PERMIT.test(message) || OTHER_DATE_PHRASE.test(message)) return null;
  return { month: NEXT_MONTH.test(message) ? 'NEXT_MONTH' : THIS_MONTH.test(message) ? 'THIS_MONTH' : null };
}

/** First day (inclusive) and first day of the following month (exclusive), in UTC: project dates are calendar dates. */
export function projectPermitMonthRange(month: Exclude<ProjectPermitMonth, null>, now: Date): { start: Date; end: Date; label: string } {
  const offset = month === 'NEXT_MONTH' ? 1 : 0;
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + offset, 1));
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + offset + 1, 1));
  return { start, end, label: start.toLocaleString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' }) };
}

export interface PermitFilterProject {
  id: string; name: string; status: string; permitApplicability: string; expectedEndDate: Date | null;
  milestones: ReadonlyArray<{ name: string; scheduledDate: Date | null; status: string }>;
}
export interface PermitFilterMatch { project: PermitFilterProject; reasons: string[] }

const CLOSED_MILESTONE = new Set(['COMPLETED', 'SKIPPED', 'CANCELLED']);
const shortDate = (date: Date) => date.toLocaleString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });

/** Active projects marked as requiring a permit and, when a month was asked for, with an open milestone or the expected finish in it. */
export function matchProjectsNeedingPermit(projects: readonly PermitFilterProject[], range: { start: Date; end: Date } | null): PermitFilterMatch[] {
  const inRange = (date: Date | null) => Boolean(date && (!range || (date >= range.start && date < range.end)));
  const matches: PermitFilterMatch[] = [];
  for (const project of projects) {
    if (project.permitApplicability !== 'REQUIRED' || ['COMPLETED', 'CANCELLED'].includes(project.status)) continue;
    const reasons: string[] = [];
    if (range) {
      for (const milestone of project.milestones) if (!CLOSED_MILESTONE.has(milestone.status) && milestone.scheduledDate && inRange(milestone.scheduledDate)) reasons.push(`${milestone.name} scheduled ${shortDate(milestone.scheduledDate)}`);
      if (project.expectedEndDate && inRange(project.expectedEndDate)) reasons.push(`Expected finish ${shortDate(project.expectedEndDate)}`);
      if (!reasons.length) continue;
    }
    matches.push({ project, reasons });
  }
  return matches;
}
