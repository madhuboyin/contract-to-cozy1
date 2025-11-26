// apps/backend/src/types/global.d.ts

// Import the AuthUser interface from the local types file
import { AuthUser } from './auth.types'; 

// Augment the global Express namespace
declare global {
  namespace Express {
    interface Request {
      // Declare that the 'user' property exists and is of type AuthUser
      // Since the authMiddleware runs before the controller, we assume it's guaranteed.
      user: AuthUser; 
    }
  }
}
// This file does not need an export. TypeScript will automatically pick it up.