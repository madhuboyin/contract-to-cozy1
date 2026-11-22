import type { AskPresentationBlock } from '@/features/ask/types';

// BICC-UX-003: the plain text a person gets when they copy a completed answer. It restates only what the answer already
// shows (summary, list, table), never actions, links, identifiers or hidden fields.
const clean = (value: unknown): string => (typeof value === 'string' ? value.trim() : '');
const join = (parts: Array<string | undefined>, separator = ' — '): string => parts.map((part) => clean(part)).filter(Boolean).join(separator);

export function answerPlainText(blocks: ReadonlyArray<AskPresentationBlock>): string {
  const lines: string[] = [];
  for (const block of blocks) {
    switch (block.type) {
      case 'SUMMARY':
        lines.push(join([block.title, block.body], '\n'));
        break;
      case 'GROUPED_LIST':
        if (clean(block.title)) lines.push(clean(block.title));
        for (const section of block.sections) {
          if (clean(section.title)) lines.push(clean(section.title));
          for (const item of section.items) lines.push(`- ${join([item.title, item.description ?? undefined, ...(Array.isArray(item.meta) ? item.meta : [item.meta])])}`);
        }
        break;
      case 'TABLE':
        if (clean(block.title)) lines.push(clean(block.title));
        for (const row of block.rows) lines.push(`- ${join(block.columns.map((column) => row.values[column.key]))}`);
        break;
      default:
        break;
    }
  }
  return lines.filter(Boolean).join('\n').trim();
}
