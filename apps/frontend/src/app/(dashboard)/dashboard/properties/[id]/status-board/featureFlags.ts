/**
 * Feature flags for Status Board UI Modernization
 * 
 * This file controls the rollout of the new card-based layout.
 * Set useCardLayout to true to enable the modern card interface.
 */

export const STATUS_BOARD_FEATURE_FLAGS = {
  /**
   * Enable card-based layout instead of table layout
   * @default false - Table layout (legacy)
   * @rollout Gradual: 10% → 50% → 100%
   */
  useCardLayout: false,
} as const;

export type StatusBoardFeatureFlags = typeof STATUS_BOARD_FEATURE_FLAGS;
