import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware';
import { apiRateLimiter } from '../middleware/rateLimiter.middleware';
import {
  getZipInfo,
  getNeighbourhoodFeed,
  getNeighbourhoodProviders,
  submitEndorsement,
  getEndorsement,
} from '../controllers/neighbourhoodTrust.controller';

const router = Router();

// Neighbourhood zip info + headline stats
router.get('/neighbourhood/zip-info', apiRateLimiter, authenticate, getZipInfo);

// Activity feed for homeowner's zip
router.get('/neighbourhood/feed', apiRateLimiter, authenticate, getNeighbourhoodFeed);

// Top providers in homeowner's zip (optionally filtered by category)
router.get('/neighbourhood/providers', apiRateLimiter, authenticate, getNeighbourhoodProviders);

// Submit or update endorsement for a completed booking
router.post('/bookings/:bookingId/endorse', apiRateLimiter, authenticate, submitEndorsement);

// Get existing endorsement for a booking
router.get('/bookings/:bookingId/endorsement', apiRateLimiter, authenticate, getEndorsement);

export default router;
