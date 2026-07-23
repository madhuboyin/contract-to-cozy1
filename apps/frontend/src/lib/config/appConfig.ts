/**
 * App-wide configurable constants.
 * Change values here to tune behaviour across the entire frontend.
 */
export const APP_CONFIG = {
  /**
   * Keep the post-login surface visible long enough to avoid a flash when the
   * Home payload is already cached. It otherwise remains visible until Home
   * reports that its initial data has settled.
   */
  postLoginTransitionMinMs: 800,

  /**
   * After this duration the same transition surface offers a retry rather
   * than exposing a second loading state.
   */
  postLoginTransitionMaxMs: 12_000,
} as const;
