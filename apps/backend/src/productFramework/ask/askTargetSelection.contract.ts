// Ask target selection (capability discovery plan, Phase 7; Inline Workspace FRD IW-SHELL-022). A reusable contract for "which one do you mean?"
// that the OWNING DOMAIN assembles and authorizes, never a client-side picker. Reading a selection writes nothing. Choosing an option launches the
// target operation through the ordinary Ask path, which revalidates access, role, and current state itself.
import { z } from 'zod';

export const ASK_TARGET_SELECTOR_IDS = ['PROPERTY_AREA', 'DIY_PROJECT'] as const;
export type AskTargetSelectorId = (typeof ASK_TARGET_SELECTOR_IDS)[number];

export const AskTargetOptionSchema = z.object({
  /** Stable id of the target: an area scope, a project id. */
  targetId: z.string().trim().min(1).max(160),
  label: z.string().trim().min(1).max(160),
  summary: z.string().trim().max(200).nullable(),
  availability: z.enum(['AVAILABLE', 'UNAVAILABLE']),
  reasonCodes: z.array(z.string().max(80)),
  /** What choosing it sends: the ordinary Ask launch, exactly as a declared action would. */
  launch: z.object({
    operationId: z.string().trim().min(1).max(120),
    message: z.string().trim().min(1).max(300),
    entityType: z.string().trim().min(1).max(120),
    entityId: z.string().trim().min(1).max(160),
  }),
});

export const AskTargetSelectionSchema = z.object({
  selectorId: z.enum(ASK_TARGET_SELECTOR_IDS),
  propertyId: z.string().trim().min(1).max(160),
  /**
   * OPTIONS       at least one option (some may be UNAVAILABLE, with a reason).
   * NONE_ELIGIBLE the source was read and nothing qualifies: an honest "nothing to choose".
   * UNAVAILABLE   the source could NOT be read. This is never reported as NONE_ELIGIBLE: a failure is not an empty result.
   */
  state: z.enum(['OPTIONS', 'NONE_ELIGIBLE', 'UNAVAILABLE']),
  title: z.string().trim().min(1).max(120),
  options: z.array(AskTargetOptionSchema).max(40),
  explanation: z.string().trim().max(300).nullable(),
  /** More eligible targets exist than are listed. */
  truncated: z.boolean(),
  generatedAt: z.string().datetime(),
});

export type AskTargetOption = z.infer<typeof AskTargetOptionSchema>;
export type AskTargetSelection = z.infer<typeof AskTargetSelectionSchema>;
