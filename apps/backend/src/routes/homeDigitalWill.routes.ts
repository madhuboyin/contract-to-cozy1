import { Response, NextFunction, Router } from 'express';
import { authenticate } from '../middleware/auth.middleware';
import { propertyAuthMiddleware, requireHouseholdRole } from '../middleware/propertyAuth.middleware';
import { validateBody } from '../middleware/validate.middleware';
import { apiRateLimiter } from '../middleware/rateLimiter.middleware';
import { CustomRequest } from '../types';
import { generateEmergencyPacketPdf } from '../services/emergencyPacket.service';

import {
  getDigitalWillByProperty,
  getTrustedContactScopedWill,
  createDigitalWillForProperty,
  updateDigitalWill,
  publishDigitalWill,
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
  requireHouseholdRole('CONTRIBUTOR'),
  getDigitalWillByProperty,
);

// POST /api/properties/:propertyId/home-digital-will  (create or return existing)
router.post(
  '/properties/:propertyId/home-digital-will',
  propertyAuthMiddleware,
  requireHouseholdRole('CONTRIBUTOR'),
  validateBody(createDigitalWillBodySchema),
  createDigitalWillForProperty,
);

// GET /api/properties/:propertyId/home-digital-will/emergency-packet.pdf
// Slice 7's "secure offline/emergency packet" — same CONTRIBUTOR+ floor as
// reading the will itself (not a token-based external share; this is for
// the household's own offline use). Registered before the will's own
// generic PATCH-by-id routes below since it's a distinct, property-scoped
// action, not a will-id-scoped one.
router.get(
  '/properties/:propertyId/home-digital-will/emergency-packet.pdf',
  propertyAuthMiddleware,
  requireHouseholdRole('CONTRIBUTOR'),
  async (req: CustomRequest, res: Response, next: NextFunction) => {
    try {
      const pdf = await generateEmergencyPacketPdf(req.params.propertyId);
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', 'attachment; filename="emergency-packet.pdf"');
      return res.send(pdf);
    } catch (error) {
      return next(error);
    }
  },
);

// PATCH /api/home-digital-wills/:id
router.patch(
  '/home-digital-wills/:id',
  validateBody(updateDigitalWillBodySchema),
  updateDigitalWill,
);

router.post(
  '/home-digital-wills/:id/publish',
  publishDigitalWill,
);

// ─── Sections ─────────────────────────────────────────────────────────────────

// GET  /api/home-digital-wills/:id/sections
router.get('/home-digital-wills/:id/sections', listSections);

// GET /api/home-digital-wills/:id/trusted-contacts/:contactId/view?sectionType=EMERGENCY
router.get('/home-digital-wills/:id/trusted-contacts/:contactId/view', getTrustedContactScopedWill);

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
