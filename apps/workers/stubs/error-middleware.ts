// Stub for workers Docker build.
// The real error.middleware.ts imports express/multer which are not workers dependencies.
// This stub exports only the APIError class — the sole symbol used by gazette services.

export class APIError extends Error {
  statusCode: number;
  code: string;
  details?: Record<string, unknown>;

  constructor(
    message: string,
    statusCode = 500,
    code = 'INTERNAL_SERVER_ERROR',
    details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'APIError';
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }
}
