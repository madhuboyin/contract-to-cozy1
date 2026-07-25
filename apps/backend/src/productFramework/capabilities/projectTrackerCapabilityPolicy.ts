export function projectTrackerSignalFamilies(input: {
  milestoneKind?: string | null;
}): string[] {
  return [
    'ACTIVE_PROJECT_MOMENT',
    'PROJECT_EXECUTION_STARTED',
    ...(input.milestoneKind === 'PERMIT_INSPECTION'
      ? ['PERMIT_RELEVANT_PROJECT']
      : []),
  ];
}
