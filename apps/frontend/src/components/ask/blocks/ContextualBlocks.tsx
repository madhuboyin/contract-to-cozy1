import { InlineEvidenceBlock, InlineOutputArtifactsBlock, InlineRelatedRecordsBlock } from '../EvidenceContextPanel';
import { AskContextLink } from './context';
import type { AskBlockRenderer } from './types';

// All three render `null` when `onOpenContext` is set -- the contextual
// info panel (IW-SHELL-006) owns evidence/output-artifact/related-record
// presentation once it exists for a given response, instead of showing the
// same content twice.
export const EvidenceBlock: AskBlockRenderer<'EVIDENCE'> = ({ block, onOpenContext }) =>
  onOpenContext ? null : <InlineEvidenceBlock block={block} />;

export const OutputArtifactsBlock: AskBlockRenderer<'OUTPUT_ARTIFACTS'> = ({ block, onOpenContext }) =>
  onOpenContext ? null : <InlineOutputArtifactsBlock block={block} renderNavigation={(navigation) => navigation ? <AskContextLink href={navigation.href} className="text-sm font-semibold text-teal-700 hover:underline">{navigation.label}</AskContextLink> : null} />;

export const RelatedRecordsBlock: AskBlockRenderer<'RELATED_RECORDS'> = ({ block, onOpenContext }) =>
  onOpenContext ? null : <InlineRelatedRecordsBlock block={block} renderNavigation={(navigation) => navigation ? <AskContextLink href={navigation.href} className="text-sm font-semibold text-teal-700 hover:underline">{navigation.label}</AskContextLink> : null} />;
