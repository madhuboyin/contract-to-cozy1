/**
 * App-wide configurable constants.
 * Change values here to tune behaviour across the entire frontend.
 */
export const APP_CONFIG = {
  /**
   * Minimum number of milliseconds the post-login transition screen stays
   * visible, regardless of how quickly auth resolves.
   * Also used as the navigation delay in the login page.
   */
  postLoginTransitionMs: 6_000,
} as const;
