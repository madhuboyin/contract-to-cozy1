// apps/backend/src/community/providers/rss.provider.ts

import { assertSafeUrl } from '../../utils/ssrfGuard';
import { logger } from '../../lib/logger';

export interface RssItem {
  title: string;
  link: string;
  description?: string | null;
  publishedAt?: string | null;
}

function decodeCdata(s: string) {
  return s.replace(/^<!\[CDATA\[(.*)\]\]>$/s, '$1').trim();
}

function pickTag(block: string, tag: string): string | null {
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i');
  const m = block.match(re);
  if (!m?.[1]) return null;
  return decodeCdata(m[1].trim());
}

// ---------------------------------------------------------------------------
// Sanitization helpers
// ---------------------------------------------------------------------------

const MAX_TITLE_LENGTH = 300;
const MAX_DESC_LENGTH  = 2000;

/**
 * Strip all HTML/XML tags from a feed string value and trim to a safe length.
 * Feed items can contain injected markup that would be stored in the DB and
 * later rendered in the frontend — remove it at the ingestion boundary.
 */
function sanitizeText(input: string | null, maxLen: number): string | null {
  if (!input) return null;
  return input
    .replace(/<[^>]*>/g, '')   // strip any tags that leaked past CDATA decode
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '') // strip control chars
    .trim()
    .substring(0, maxLen) || null;
}

/**
 * Validate a URL extracted from a feed item. Only http/https schemes are
 * allowed; anything else (javascript:, data:, file:) is rejected and replaced
 * with null so the caller omits the item rather than storing a dangerous link.
 */
function sanitizeLink(input: string | null): string | null {
  if (!input) return null;
  try {
    const parsed = new URL(input.trim());
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
    // Keep only origin + path + query — strip credentials and fragments
    return `${parsed.origin}${parsed.pathname}${parsed.search}`;
  } catch {
    return null;
  }
}

export async function fetchRssItems(feedUrl: string, limit = 20): Promise<RssItem[]> {
  try {
    await assertSafeUrl(feedUrl);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    const resp = await fetch(feedUrl, {
      headers: { 'User-Agent': 'contracttocozy/1.0' },
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!resp.ok) throw new Error(`RSS fetch failed ${resp.status}`);

    const xml = await resp.text();
    const items: RssItem[] = [];

    const itemMatches = xml.match(/<item[\s\S]*?<\/item>/gi) ?? [];
    for (const itemXml of itemMatches.slice(0, limit)) {
      const rawTitle = pickTag(itemXml, 'title');
      const rawLink  = pickTag(itemXml, 'link') ?? pickTag(itemXml, 'guid');
      const rawDesc  = pickTag(itemXml, 'description');
      const pub      = pickTag(itemXml, 'pubDate');

      const title = sanitizeText(rawTitle, MAX_TITLE_LENGTH);
      const link  = sanitizeLink(rawLink);
      const description = sanitizeText(rawDesc, MAX_DESC_LENGTH);

      // Skip items that have no usable title or a non-http(s) link
      if (!title || !link) continue;

      const publishedAt = pub ? new Date(pub).toISOString() : null;

      items.push({ title, link, description, publishedAt });
    }

    return items;
  } catch (error) {
    logger.error({ err: error }, `RSS feed failed for ${feedUrl}`);
    return [];
  }
}