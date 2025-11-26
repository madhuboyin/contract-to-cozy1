// apps/backend/src/types/express.d.ts

// This file merges custom types into the Express Request object.
// The properties defined here are added by your authMiddleware.

declare namespace Express {
    interface Request {
      // Define the structure of the object added by the authMiddleware
      user: {
        id: string;
        homeownerProfileId: string;
        // Add other properties (e.g., role: UserRole) if your token includes them
      };
    }
  }