// BICC-3.2 (deterministic slice): the text of a PDF, page by page, read from the file's own text layer. No model, no OCR and no network: a scanned PDF or a photo has no
// text layer, so it yields nothing and the caller says so. Bounded in pages and characters so one file cannot hold the process.
export const PDF_MAX_PAGES = 60;
export const PDF_MAX_CHARS_PER_PAGE = 20_000;
export const PDF_MAX_TOTAL_CHARS = 300_000;

export interface PdfPage { page: number; text: string }
export interface PdfText { pages: PdfPage[]; pageCount: number; truncated: boolean }

const clean = (text: string): string => text.replace(/\u0000/g, '').replace(/[ \t]+/g, ' ').replace(/ *\n */g, '\n').replace(/\n{3,}/g, '\n\n').trim();

export async function extractPdfPages(buffer: Buffer): Promise<PdfText> {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const pdfParse = require('pdf-parse');
  const collected: string[] = [];
  const parsed = await pdfParse(buffer, {
    max: PDF_MAX_PAGES,
    pagerender: async (pageData: { getTextContent: (options: Record<string, unknown>) => Promise<{ items: Array<{ str: string; transform: number[] }> }> }) => {
      const content = await pageData.getTextContent({ normalizeWhitespace: true, disableCombineTextItems: false });
      let text = ''; let lastY: number | null = null;
      for (const item of content.items) {
        const y = item.transform[5];
        text += lastY === null || lastY === y ? item.str : `\n${item.str}`;
        lastY = y;
      }
      collected.push(text);
      return text;
    },
  });
  let total = 0; let truncated = parsed.numpages > PDF_MAX_PAGES;
  const pages: PdfPage[] = [];
  collected.forEach((raw, index) => {
    let text = clean(raw);
    if (text.length > PDF_MAX_CHARS_PER_PAGE) { text = text.slice(0, PDF_MAX_CHARS_PER_PAGE); truncated = true; }
    if (total + text.length > PDF_MAX_TOTAL_CHARS) { text = text.slice(0, Math.max(0, PDF_MAX_TOTAL_CHARS - total)); truncated = true; }
    total += text.length;
    if (text) pages.push({ page: index + 1, text });
  });
  return { pages, pageCount: parsed.numpages, truncated };
}
