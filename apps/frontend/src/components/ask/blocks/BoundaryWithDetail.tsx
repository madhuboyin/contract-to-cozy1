import type { AskBlockRenderer } from './types';
import { BoundaryBlock } from './CoreBlocks';

// A boundary with a longer explanation (FRD v1.393): the short body stays the boundary, and the rest sits in a quiet disclosure. Every
// boundary without `detail` renders exactly as before.
export const BoundaryWithDetail: AskBlockRenderer<'BOUNDARY'> = (props) => {
  const { block } = props;
  // The Home Actions boundary reads at the same measure as the action list above it, not the full answer width.
  if (block.id === 'home-actions-boundary') return <div className="w-full max-w-[960px]"><BoundaryBlock {...props} /></div>;
  if (!block.detail) return <BoundaryBlock {...props} />;
  return <div data-boundary-with-detail="">
    <BoundaryBlock {...props} />
    <details className="mt-1 text-xs leading-5 text-slate-500">
      <summary className="inline-flex min-h-8 cursor-pointer items-center font-medium text-slate-600 hover:text-slate-800">More about this</summary>
      <p className="mt-1 max-w-prose">{block.detail}</p>
    </details>
  </div>;
};
