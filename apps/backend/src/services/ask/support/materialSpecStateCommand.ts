// Material Specs state controls inside Ask (register "Material Specs"; FRD v1.465): stop using a material (archive) and use it again, delete one
// that was only proposed, and export the home's materials. Pure: the declared messages, action ids and the export form.
//
// These share the MATERIAL_SPEC_UPDATE operation with the editor (no new operation), told apart by their declared messages. The page's own rules
// stay authoritative: only a proposed material can be deleted (the service refuses the rest and says to archive it), and one export runs at a time.
import { z } from 'zod';

export const MATERIAL_SPEC_STATE_MESSAGES = {
  ARCHIVE: 'Stop using this material.',
  RESTORE: 'Use this material again.',
  DELETE: 'Delete this material.',
  EXPORT: 'Export my materials.',
  // Removing one of a material's photos (FRD v1.480); adding one needs the file-intake dialog to carry a target and stays on the Material Specs page.
  PHOTO_DELETE: 'Remove a photo from this material.',
} as const;
export type MaterialSpecStateKind = keyof typeof MATERIAL_SPEC_STATE_MESSAGES;

export const MATERIAL_SPEC_STATE_ACTION_IDS = {
  ARCHIVE: 'material-spec-archive',
  RESTORE: 'material-spec-restore',
  DELETE: 'material-spec-delete',
  EXPORT: 'material-spec-export',
  PHOTO_DELETE: 'material-spec-photo-delete',
} as const;

export const MATERIAL_SPEC_EXPORT_CAPTURE_KEY = 'MATERIAL_SPEC_EXPORT_INPUTS';
export const MATERIAL_SPEC_PHOTO_CAPTURE_KEY = 'MATERIAL_SPEC_PHOTO_INPUTS';
export const MaterialSpecPhotoAnswerSchema = z.object({ photoId: z.string().trim().min(1).max(100) }).strict();
/** The export's title, as Desktop's page asks for it (the service stores it and names the file from it). */
export const MaterialSpecExportAnswerSchema = z.object({ title: z.string().trim().min(1).max(200) }).strict();

export const materialSpecStateKindFromMessage = (message: string): MaterialSpecStateKind | null =>
  ((Object.entries(MATERIAL_SPEC_STATE_MESSAGES) as Array<[MaterialSpecStateKind, string]>).find(([, value]) => value === message.trim())?.[0]) ?? null;

/** Whether a material can still be deleted: only one that was proposed and never approved, substituted, installed or recorded as built. */
export const materialSpecDeletable = (lifecycleStatus: string): boolean => lifecycleStatus === 'PROPOSED';
