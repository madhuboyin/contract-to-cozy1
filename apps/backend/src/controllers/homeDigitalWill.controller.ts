import { Response, NextFunction } from 'express';
import { CustomRequest } from '../types';
import { HomeDigitalWillService } from '../services/homeDigitalWill.service';
import { HomeDigitalWillSectionType } from '@prisma/client';
import { APIError } from '../middleware/error.middleware';
import { analyticsEmitter, AnalyticsEvent, AnalyticsModule, AnalyticsFeature } from '../services/analytics';
import { getPlanningContextEnvelope } from '../services/planningContext/context';
import { recordToolLifecycleEvents } from '../services/analytics/toolLifecycle';
import { homeDigitalWillCompletionEvent } from '../services/analytics/homeDigitalWillLifecycle';

const svc = new HomeDigitalWillService();

// ─── Digital Will ─────────────────────────────────────────────────────────────

export async function getDigitalWillByProperty(req: CustomRequest, res: Response, next: NextFunction) {
  try {
    const { propertyId } = req.params;
    const data = await svc.getByProperty(propertyId);

    // Continuity decision envelope: which authoritative sources back the will
    // and whether canonical context changed since it was last maintained.
    const context = req.user?.userId
      ? await getPlanningContextEnvelope(propertyId, req.user.userId, 'DIGITAL_WILL')
      : null;

    analyticsEmitter.track({
      eventType: AnalyticsEvent.TOOL_USED,
      userId: req.user?.userId,
      propertyId,
      moduleKey: AnalyticsModule.DASHBOARD,
      featureKey: AnalyticsFeature.HOME_DIGITAL_WILL,
      metadataJson: {},
    });

    res.json({ success: true, data, context });
  } catch (err) {
    next(err);
  }
}

export async function createDigitalWillForProperty(req: CustomRequest, res: Response, next: NextFunction) {
  try {
    const { propertyId } = req.params;
    const data = await svc.getOrCreateByProperty(propertyId, req.body);

    analyticsEmitter.track({
      eventType: AnalyticsEvent.ACTION_COMPLETED,
      userId: req.user?.userId,
      propertyId,
      moduleKey: AnalyticsModule.DASHBOARD,
      featureKey: AnalyticsFeature.HOME_DIGITAL_WILL,
      metadataJson: { actionType: 'create_will' },
    });

    res.status(201).json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

export async function getTrustedContactScopedWill(req: CustomRequest, res: Response, next: NextFunction) {
  try {
    const { id, contactId } = req.params;
    const userId = req.user!.userId;
    const sectionTypeRaw = req.query.sectionType
      ? String(req.query.sectionType).toUpperCase()
      : undefined;
    if (sectionTypeRaw && !Object.values(HomeDigitalWillSectionType).includes(sectionTypeRaw as HomeDigitalWillSectionType)) {
      throw new APIError('Invalid sectionType query value', 400, 'VALIDATION_ERROR');
    }

    const data = await svc.getTrustedContactScopedView(
      id,
      userId,
      contactId,
      sectionTypeRaw as HomeDigitalWillSectionType | undefined,
    );
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

export async function updateDigitalWill(req: CustomRequest, res: Response, next: NextFunction) {
  try {
    const { id } = req.params;
    const userId = req.user!.userId;
    const data = await svc.updateWill(id, userId, req.body);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

export async function publishDigitalWill(req: CustomRequest, res: Response, next: NextFunction) {
  try {
    const { id } = req.params;
    const userId = req.user!.userId;
    const data = await svc.publishWill(id, userId);
    void recordToolLifecycleEvents({
      userId,
      propertyId: data.propertyId,
      events: [homeDigitalWillCompletionEvent({
        willId: data.id,
        trustedContactCount: data.counts.trustedContactCount,
        entryCount: data.counts.entryCount,
      })],
    }).catch(() => undefined);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

// ─── Sections ─────────────────────────────────────────────────────────────────

export async function listSections(req: CustomRequest, res: Response, next: NextFunction) {
  try {
    const { id } = req.params;
    const userId = req.user!.userId;
    const sections = await svc.listSections(id, userId);
    res.json({ success: true, data: { sections } });
  } catch (err) {
    next(err);
  }
}

export async function createSection(req: CustomRequest, res: Response, next: NextFunction) {
  try {
    const { id } = req.params;
    const userId = req.user!.userId;
    const section = await svc.createSection(id, userId, req.body);
    res.status(201).json({ success: true, data: { section } });
  } catch (err) {
    next(err);
  }
}

export async function updateSection(req: CustomRequest, res: Response, next: NextFunction) {
  try {
    const { sectionId } = req.params;
    const userId = req.user!.userId;
    const section = await svc.updateSection(sectionId, userId, req.body);
    res.json({ success: true, data: { section } });
  } catch (err) {
    next(err);
  }
}

export async function deleteSection(req: CustomRequest, res: Response, next: NextFunction) {
  try {
    const { sectionId } = req.params;
    const userId = req.user!.userId;
    await svc.deleteSection(sectionId, userId);
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
}

export async function reorderSections(req: CustomRequest, res: Response, next: NextFunction) {
  try {
    const { id } = req.params;
    const userId = req.user!.userId;
    const sections = await svc.reorderSections(id, userId, req.body);
    res.json({ success: true, data: { sections } });
  } catch (err) {
    next(err);
  }
}

// ─── Entries ─────────────────────────────────────────────────────────────────

export async function listEntries(req: CustomRequest, res: Response, next: NextFunction) {
  try {
    const { sectionId } = req.params;
    const userId = req.user!.userId;
    const entries = await svc.listEntries(sectionId, userId);
    res.json({ success: true, data: { entries } });
  } catch (err) {
    next(err);
  }
}

export async function createEntry(req: CustomRequest, res: Response, next: NextFunction) {
  try {
    const { sectionId } = req.params;
    const userId = req.user!.userId;
    const entry = await svc.createEntry(sectionId, userId, req.body);
    res.status(201).json({ success: true, data: { entry } });
  } catch (err) {
    next(err);
  }
}

export async function updateEntry(req: CustomRequest, res: Response, next: NextFunction) {
  try {
    const { entryId } = req.params;
    const userId = req.user!.userId;
    const entry = await svc.updateEntry(entryId, userId, req.body);
    res.json({ success: true, data: { entry } });
  } catch (err) {
    next(err);
  }
}

export async function deleteEntry(req: CustomRequest, res: Response, next: NextFunction) {
  try {
    const { entryId } = req.params;
    const userId = req.user!.userId;
    await svc.deleteEntry(entryId, userId);
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
}

export async function reorderEntries(req: CustomRequest, res: Response, next: NextFunction) {
  try {
    const { sectionId } = req.params;
    const userId = req.user!.userId;
    const entries = await svc.reorderEntries(sectionId, userId, req.body);
    res.json({ success: true, data: { entries } });
  } catch (err) {
    next(err);
  }
}

// ─── Trusted Contacts ─────────────────────────────────────────────────────────

export async function listTrustedContacts(req: CustomRequest, res: Response, next: NextFunction) {
  try {
    const { id } = req.params;
    const userId = req.user!.userId;
    const contacts = await svc.listTrustedContacts(id, userId);
    res.json({ success: true, data: { contacts } });
  } catch (err) {
    next(err);
  }
}

export async function createTrustedContact(req: CustomRequest, res: Response, next: NextFunction) {
  try {
    const { id } = req.params;
    const userId = req.user!.userId;
    const contact = await svc.createTrustedContact(id, userId, req.body);
    res.status(201).json({ success: true, data: { contact } });
  } catch (err) {
    next(err);
  }
}

export async function updateTrustedContact(req: CustomRequest, res: Response, next: NextFunction) {
  try {
    const { contactId } = req.params;
    const userId = req.user!.userId;
    const contact = await svc.updateTrustedContact(contactId, userId, req.body);
    res.json({ success: true, data: { contact } });
  } catch (err) {
    next(err);
  }
}

export async function deleteTrustedContact(req: CustomRequest, res: Response, next: NextFunction) {
  try {
    const { contactId } = req.params;
    const userId = req.user!.userId;
    await svc.deleteTrustedContact(contactId, userId);
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
}
