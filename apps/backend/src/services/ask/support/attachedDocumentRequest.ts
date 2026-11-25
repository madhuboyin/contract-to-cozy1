// BICC-3.2: recognises a question about the file the person attached to THIS conversation. Whole-message, closed forms only, decided from the question's own words (never from
// the document). Only consulted when the conversation has a live attachment, so it cannot affect any other turn.
const normalize = (m: string): string => m.toLowerCase().normalize('NFKC').replace(/[’]/g, "'").replace(/[^a-z0-9'$%\s-]/g, ' ').replace(/\s+/g, ' ').trim();
const DOC = '(?:pdf|document|doc|file|attachment|paperwork|policy|report|statement|letter|contract|quote|estimate|invoice|receipt|warranty)';
const THE = "(?:the|this|that|my|our|the attached|the uploaded|this attached|this uploaded|my attached|my uploaded|attached|uploaded)";
const THING = `${THE} ${DOC}`;

export type AttachedDocumentRequest = { kind: 'SEARCH'; query: string } | { kind: 'SUMMARY' };

export const MIN_DOCUMENT_PREFILTER = /\b(?:pdf|document|doc|file|attachment|attached|uploaded|paperwork|policy|report|statement|letter|contract|quote|estimate|invoice|receipt|warranty)\b/i;

export function classifyAttachedDocumentRequest(message: string): AttachedDocumentRequest | null {
  const text = normalize(message);
  if (!text || text.split(' ').length > 30) return null;
  if (new RegExp(`^(?:please )?(?:summari[sz]e|give me a summary of|what(?:'s| is) in|what does) ${THING}(?: say)?$`).test(text) || new RegExp(`^(?:please )?(?:summari[sz]e|give me a summary of) ${THING}.{0,40}$`).test(text)) return { kind: 'SUMMARY' };
  const forms: RegExp[] = [
    new RegExp(`^what does ${THING} say about (.+)$`),
    new RegExp(`^(?:search|look|check|find|read)(?: in| through| for)? ${THING} for (.+)$`),
    new RegExp(`^(?:find|search for|look for|show me|where does it (?:say|mention)) (.+?) (?:in|from|inside) ${THING}$`),
    new RegExp(`^does ${THING} (?:mention|say|include|cover|list|have|contain|state) (.+)$`),
    new RegExp(`^what (?:does|did) ${THING} (?:say|state) (?:about|regarding|on) (.+)$`),
    new RegExp(`^(?:is|are) (.+?) (?:mentioned|covered|listed|included|stated) in ${THING}$`),
  ];
  for (const form of forms) {
    const match = form.exec(text);
    if (match && match[1] && match[1].trim().length > 1) return { kind: 'SEARCH', query: match[1].trim() };
  }
  return null;
}
