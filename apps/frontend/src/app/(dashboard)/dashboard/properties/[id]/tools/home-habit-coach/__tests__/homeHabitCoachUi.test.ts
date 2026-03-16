import {
  formatDueLabel,
  getDueTone,
  formatSnoozedLabel,
  formatActionDateLabel,
  formatEffortLabel,
  getHabitActionErrorMessage,
  getHabitLoadErrorMessage,
  getHabitEmptyStateProps,
  HABIT_STATUS_TONE,
  HABIT_STATUS_LABEL,
  HABIT_CADENCE_LABEL,
} from '../homeHabitCoachUi';

// ─── HABIT_STATUS_TONE ────────────────────────────────────────────────────────

describe('HABIT_STATUS_TONE', () => {
  it('maps ACTIVE to info', () => {
    expect(HABIT_STATUS_TONE.ACTIVE).toBe('info');
  });
  it('maps SNOOZED to elevated', () => {
    expect(HABIT_STATUS_TONE.SNOOZED).toBe('elevated');
  });
  it('maps COMPLETED to good', () => {
    expect(HABIT_STATUS_TONE.COMPLETED).toBe('good');
  });
  it('maps EXPIRED to danger', () => {
    expect(HABIT_STATUS_TONE.EXPIRED).toBe('danger');
  });
  it('maps SKIPPED to info', () => {
    expect(HABIT_STATUS_TONE.SKIPPED).toBe('info');
  });
  it('maps DISMISSED to info', () => {
    expect(HABIT_STATUS_TONE.DISMISSED).toBe('info');
  });
});

// ─── HABIT_STATUS_LABEL ───────────────────────────────────────────────────────

describe('HABIT_STATUS_LABEL', () => {
  it('has human-readable labels for all statuses', () => {
    expect(HABIT_STATUS_LABEL.ACTIVE).toBe('Active');
    expect(HABIT_STATUS_LABEL.SNOOZED).toBe('Snoozed');
    expect(HABIT_STATUS_LABEL.COMPLETED).toBe('Completed');
    expect(HABIT_STATUS_LABEL.SKIPPED).toBe('Skipped');
    expect(HABIT_STATUS_LABEL.DISMISSED).toBe('Dismissed');
    expect(HABIT_STATUS_LABEL.EXPIRED).toBe('Expired');
  });
});

// ─── HABIT_CADENCE_LABEL ──────────────────────────────────────────────────────

describe('HABIT_CADENCE_LABEL', () => {
  it('maps all cadence values', () => {
    expect(HABIT_CADENCE_LABEL.DAILY).toBe('Daily');
    expect(HABIT_CADENCE_LABEL.WEEKLY).toBe('Weekly');
    expect(HABIT_CADENCE_LABEL.MONTHLY).toBe('Monthly');
    expect(HABIT_CADENCE_LABEL.SEASONAL).toBe('Seasonal');
    expect(HABIT_CADENCE_LABEL.ANNUAL).toBe('Annual');
    expect(HABIT_CADENCE_LABEL.AD_HOC).toBe('As needed');
  });
});

// ─── formatDueLabel ───────────────────────────────────────────────────────────

describe('formatDueLabel', () => {
  it('returns null for null input', () => {
    expect(formatDueLabel(null)).toBeNull();
  });

  it('returns "Overdue by Nd" for past dates', () => {
    const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
    const label = formatDueLabel(threeDaysAgo);
    expect(label).toMatch(/^Overdue by \d+d$/);
  });

  it('returns "Due today" for a date just passed (rounds to diffDays=0)', () => {
    // Math.ceil(-small) = 0, which hits the diffDays === 0 branch → "Due today"
    const justPast = new Date(Date.now() - 60 * 1000).toISOString(); // 1 min ago
    const label = formatDueLabel(justPast);
    expect(label).toBe('Due today');
  });

  it('returns "Due tomorrow" for exactly 24h from now', () => {
    // Math.ceil(exactly 1 day) = 1 → "Due tomorrow"
    const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    const label = formatDueLabel(tomorrow);
    expect(label).toBe('Due tomorrow');
  });

  it('returns "Due in N days" for within a week', () => {
    const fiveDays = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString();
    const label = formatDueLabel(fiveDays);
    expect(label).toBe('Due in 5 days');
  });

  it('returns formatted date for farther future', () => {
    const farFuture = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
    const label = formatDueLabel(farFuture);
    expect(label).toMatch(/^Due [A-Z][a-z]+ \d+$/);
  });
});

// ─── getDueTone ───────────────────────────────────────────────────────────────

describe('getDueTone', () => {
  it('returns info for null', () => {
    expect(getDueTone(null)).toBe('info');
  });

  it('returns danger for overdue dates', () => {
    const yesterday = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();
    expect(getDueTone(yesterday)).toBe('danger');
  });

  it('returns danger for a date just passed (diffDays=0)', () => {
    // Math.ceil(-small) = 0, 0 <= 0 → danger
    const justPast = new Date(Date.now() - 60 * 1000).toISOString();
    expect(getDueTone(justPast)).toBe('danger');
  });

  it('returns elevated for due within 3 days', () => {
    const twoDays = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString();
    expect(getDueTone(twoDays)).toBe('elevated');
  });

  it('returns info for due in more than 3 days', () => {
    const twoWeeks = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();
    expect(getDueTone(twoWeeks)).toBe('info');
  });
});

// ─── formatSnoozedLabel ───────────────────────────────────────────────────────

describe('formatSnoozedLabel', () => {
  it('returns null for null input', () => {
    expect(formatSnoozedLabel(null)).toBeNull();
  });

  it('returns "Back on Mon DD" format', () => {
    const future = new Date('2026-04-15T12:00:00Z').toISOString();
    const label = formatSnoozedLabel(future);
    expect(label).toMatch(/^Back on [A-Z][a-z]+ \d+$/);
  });

  it('starts with "Back on"', () => {
    const someDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    expect(formatSnoozedLabel(someDate)).toMatch(/^Back on /);
  });
});

// ─── formatActionDateLabel ────────────────────────────────────────────────────

describe('formatActionDateLabel', () => {
  it('returns null for null input', () => {
    expect(formatActionDateLabel(null)).toBeNull();
  });

  it('returns "Today" for very recent date', () => {
    const now = new Date().toISOString();
    expect(formatActionDateLabel(now)).toBe('Today');
  });

  it('returns "Yesterday" for ~1 day ago', () => {
    const yesterday = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString();
    expect(formatActionDateLabel(yesterday)).toBe('Yesterday');
  });

  it('returns "N days ago" for within a week', () => {
    const fiveDaysAgo = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString();
    expect(formatActionDateLabel(fiveDaysAgo)).toBe('5 days ago');
  });

  it('returns formatted date for older items', () => {
    const old = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const label = formatActionDateLabel(old);
    expect(label).toMatch(/^[A-Z][a-z]+ \d+$/);
  });
});

// ─── formatEffortLabel ────────────────────────────────────────────────────────

describe('formatEffortLabel', () => {
  it('returns null for null', () => {
    expect(formatEffortLabel(null)).toBeNull();
  });

  it('returns null for undefined', () => {
    expect(formatEffortLabel(undefined)).toBeNull();
  });

  it('returns null for 0', () => {
    expect(formatEffortLabel(0)).toBeNull();
  });

  it('returns "N min" for under an hour', () => {
    expect(formatEffortLabel(15)).toBe('15 min');
    expect(formatEffortLabel(45)).toBe('45 min');
  });

  it('returns "Nh" for exact hours', () => {
    expect(formatEffortLabel(60)).toBe('1h');
    expect(formatEffortLabel(120)).toBe('2h');
  });

  it('returns "Nh Nmin" for hours with remainder', () => {
    expect(formatEffortLabel(90)).toBe('1h 30min');
    expect(formatEffortLabel(75)).toBe('1h 15min');
  });
});

// ─── getHabitActionErrorMessage ───────────────────────────────────────────────

describe('getHabitActionErrorMessage', () => {
  it('returns a non-empty string for every action', () => {
    const actions = ['complete', 'snooze', 'skip', 'dismiss', 'reopen', 'generate'] as const;
    for (const action of actions) {
      const msg = getHabitActionErrorMessage(action);
      expect(typeof msg).toBe('string');
      expect(msg.length).toBeGreaterThan(0);
    }
  });

  it('contains "complete" for complete action', () => {
    expect(getHabitActionErrorMessage('complete').toLowerCase()).toContain('complete');
  });

  it('contains "snooze" for snooze action', () => {
    expect(getHabitActionErrorMessage('snooze').toLowerCase()).toContain('snooze');
  });

  it('contains "generate" for generate action', () => {
    expect(getHabitActionErrorMessage('generate').toLowerCase()).toContain('generate');
  });

  it('ends with "Please try again." for all actions', () => {
    const actions = ['complete', 'snooze', 'skip', 'dismiss', 'reopen', 'generate'] as const;
    for (const action of actions) {
      expect(getHabitActionErrorMessage(action)).toMatch(/Please try again\.$/);
    }
  });
});

// ─── getHabitLoadErrorMessage ─────────────────────────────────────────────────

describe('getHabitLoadErrorMessage', () => {
  it('returns a non-empty string for every context', () => {
    const contexts = ['list', 'spotlight', 'history', 'preferences'] as const;
    for (const context of contexts) {
      const msg = getHabitLoadErrorMessage(context);
      expect(typeof msg).toBe('string');
      expect(msg.length).toBeGreaterThan(0);
    }
  });

  it('mentions refresh for list context', () => {
    expect(getHabitLoadErrorMessage('list').toLowerCase()).toContain('refresh');
  });

  it('mentions history for history context', () => {
    expect(getHabitLoadErrorMessage('history').toLowerCase()).toContain('history');
  });
});

// ─── getHabitEmptyStateProps ──────────────────────────────────────────────────

describe('getHabitEmptyStateProps', () => {
  it('returns noHabits variant with title and description', () => {
    const props = getHabitEmptyStateProps('noHabits');
    expect(props.variant).toBe('noHabits');
    expect(props.title).toBeTruthy();
    expect(props.description).toBeTruthy();
  });

  it('returns allSnoozed variant', () => {
    const props = getHabitEmptyStateProps('allSnoozed');
    expect(props.variant).toBe('allSnoozed');
    expect(props.title).toBeTruthy();
    expect(props.description.toLowerCase()).toContain('snooze');
  });

  it('returns noHistory variant', () => {
    const props = getHabitEmptyStateProps('noHistory');
    expect(props.variant).toBe('noHistory');
    expect(props.title).toBeTruthy();
    expect(props.description.toLowerCase()).toContain('history');
  });
});
