// apps/frontend/src/types/seasonal.types.ts

export type Season = 'SPRING' | 'SUMMER' | 'FALL' | 'WINTER';
export type ClimateRegion = 'VERY_COLD' | 'COLD' | 'MODERATE' | 'WARM' | 'TROPICAL';
export type SeasonalChecklistStatus = 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'DISMISSED';
export type SeasonalTaskStatus = 'RECOMMENDED' | 'ADDED' | 'COMPLETED' | 'DISMISSED' | 'SNOOZED';
export type TaskPriority = 'CRITICAL' | 'RECOMMENDED' | 'OPTIONAL';
export type NotificationTiming = 'EARLY' | 'STANDARD' | 'LATE';
export type DiyDifficulty = 'EASY' | 'MODERATE' | 'ADVANCED';

export interface SeasonalTaskTemplate {
  id: string;
  taskKey: string;
  season: Season;
  title: string;
  description?: string;
  whyItMatters?: string;
  typicalCostMin?: number;
  typicalCostMax?: number;
  isDiyPossible: boolean;
  estimatedHours?: number;
  diyDifficulty?: DiyDifficulty;
  tutorialUrl?: string;        // ADD THIS
  materialsList?: string;      // ADD THIS
  priority: TaskPriority;
  serviceCategory?: string;
  climateRegions: ClimateRegion[];
}

export interface SeasonalChecklist {
  id: string;
  propertyId: string;
  season: Season;
  year: number;
  climateRegion: ClimateRegion;
  seasonStartDate: string;
  seasonEndDate: string;
  status: SeasonalChecklistStatus;
  totalTasks: number;
  tasksAdded: number;
  tasksCompleted: number;
  daysRemaining?: number;
  generatedAt: string;
  firstViewedAt?: string;
  notificationSentAt?: string;
  dismissedAt?: string;
}

export interface SeasonalChecklistItem {
  id: string;
  seasonalChecklistId: string;
  title: string;
  description?: string;
  priority: TaskPriority;
  status: SeasonalTaskStatus;
  recommendedDate?: string;
  addedAt?: string;
  completedAt?: string;
  dismissedAt?: string;
  snoozedUntil?: string;
  checklistItemId?: string;
  seasonalTaskTemplate: SeasonalTaskTemplate;
}

export interface ClimateInfo {
  propertyId: string;
  climateRegion: ClimateRegion;
  climateRegionSource: 'AUTO_DETECTED' | 'USER_OVERRIDE';
  currentSeason: Season;
  nextSeason: Season;
  nextSeasonStartDate: string;
  daysUntilNextSeason: number;
}

export interface PropertyClimateSetting {
  id: string;
  propertyId: string;
  climateRegion: ClimateRegion;
  climateRegionSource: string;
  notificationTiming: NotificationTiming;
  notificationEnabled: boolean;
  autoGenerateChecklists: boolean;
  excludedTaskKeys: string[];
}

// Helper type for grouped tasks
export interface GroupedSeasonalTasks {
  critical: SeasonalChecklistItem[];
  recommended: SeasonalChecklistItem[];
  optional: SeasonalChecklistItem[];
}