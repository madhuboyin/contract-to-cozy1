import { Router } from 'express';
import { getPropertyCommunityEvents } from '../controllers/communityEvents.controller';

const router = Router();

router.get('/properties/:propertyId/community/events', getPropertyCommunityEvents);

export default router;
