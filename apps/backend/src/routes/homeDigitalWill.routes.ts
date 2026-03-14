import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware';
import { propertyAuthMiddleware } from '../middleware/propertyAuth.middleware';
import { validateBody } from '../middleware/validate.middleware';
import { apiRateLimiter } from '../middleware/rateLimiter.middleware';

import {
  getDigitalWillByProperty,
  createDigitalWillForProperty,
  updateDigitalWill,
  listSections,
  createSection,
  updateSection,
  deleteSection,
  reorderSections,
  listEntries,
  createEntry,
  updateEntry,
  deleteEntry,
  reorderEntries,
  listTrustedContacts,
  createTrustedContact,
  updateTrustedContact,
  deleteTrustedContact,
} from '../controllers/homeDigitalWill.controller';

import {
  createDigitalWillBodySchema,
  updateDigitalWillBodySchema,
  createSectionBodySchema,
  updateSectionBodySchema,
  reorderBodySchema,
  createEntryBodySchema,
  updateEntryBodySchema,
  createTrustedContactBodySchema,
  updateTrustedContactBodySchema,
} from '../validators/homeDigitalWill.validators';

const router = Router();

router.use(apiRateLimiter);
router.use(authenticate);

// ─── Digital Will (property-scoped) ──────────────────────────────────────────

// GET  /api/properties/:propertyId/home-digital-will
router.get(
  '/properties/:propertyId/home-digital-will',
  propertyAuthMiddleware,
  getDigitalWillByProperty,
);

// POST /api/properties/:propertyId/home-digital-will  (create or return existing)
router.post(
  '/properties/:propertyId/home-digital-will',
  propertyAuthMiddleware,
  validateBody(createDigitalWillBodySchema),
  createDigitalWillForProperty,
);

// PATCH /api/home-digital-wills/:id
router.patch(
  '/home-digital-wills/:id',
  validateBody(updateDigitalWillBodySchema),
  updateDigitalWill,
);

// ─── Sections ─────────────────────────────────────────────────────────────────

// GET  /api/home-digital-wills/:id/sections
router.get('/home-digital-wills/:id/sections', listSections);

// POST /api/home-digital-wills/:id/sections
router.post(
  '/home-digital-wills/:id/sections',
  validateBody(createSectionBodySchema),
  createSection,
);

// POST /api/home-digital-wills/:id/sections/reorder
router.post(
  '/home-digital-wills/:id/sections/reorder',
  validateBody(reorderBodySchema),
  reorderSections,
);

// PATCH  /api/home-digital-will-sections/:sectionId
router.patch(
  '/home-digital-will-sections/:sectionId',
  validateBody(updateSectionBodySchema),
  updateSection,
);

// DELETE /api/home-digital-will-sections/:sectionId
router.delete('/home-digital-will-sections/:sectionId', deleteSection);

// ─── Entries ─────────────────────────────────────────────────────────────────

// GET  /api/home-digital-will-sections/:sectionId/entries
router.get('/home-digital-will-sections/:sectionId/entries', listEntries);

// POST /api/home-digital-will-sections/:sectionId/entries
router.post(
  '/home-digital-will-sections/:sectionId/entries',
  validateBody(createEntryBodySchema),
  createEntry,
);

// POST /api/home-digital-will-sections/:sectionId/entries/reorder
router.post(
  '/home-digital-will-sections/:sectionId/entries/reorder',
  validateBody(reorderBodySchema),
  reorderEntries,
);

// PATCH  /api/home-digital-will-entries/:entryId
router.patch(
  '/home-digital-will-entries/:entryId',
  validateBody(updateEntryBodySchema),
  updateEntry,
);

// DELETE /api/home-digital-will-entries/:entryId
router.delete('/home-digital-will-entries/:entryId', deleteEntry);

// ─── Trusted Contacts ─────────────────────────────────────────────────────────

// GET  /api/home-digital-wills/:id/trusted-contacts
router.get('/home-digital-wills/:id/trusted-contacts', listTrustedContacts);

// POST /api/home-digital-wills/:id/trusted-contacts
router.post(
  '/home-digital-wills/:id/trusted-contacts',
  validateBody(createTrustedContactBodySchema),
  createTrustedContact,
);

// PATCH  /api/home-digital-will-trusted-contacts/:contactId
router.patch(
  '/home-digital-will-trusted-contacts/:contactId',
  validateBody(updateTrustedContactBodySchema),
  updateTrustedContact,
);

// DELETE /api/home-digital-will-trusted-contacts/:contactId
router.delete('/home-digital-will-trusted-contacts/:contactId', deleteTrustedContact);

export default router;
