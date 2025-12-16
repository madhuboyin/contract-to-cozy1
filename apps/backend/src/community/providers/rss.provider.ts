// apps/backend/src/community/providers/rss.provider.ts

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

export async function fetchRssItems(feedUrl: string, limit = 20): Promise<RssItem[]> {
  try {
    // ✅ ADD TIMEOUT: 10 seconds
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
      const title = pickTag(itemXml, 'title');
      const link = pickTag(itemXml, 'link') ?? pickTag(itemXml, 'guid');
      const desc = pickTag(itemXml, 'description');
      const pub = pickTag(itemXml, 'pubDate');

      if (!title || !link) continue;

      const publishedAt = pub ? new Date(pub).toISOString() : null;

      items.push({
        title,
        link,
        description: desc ?? null,
        publishedAt,
      });
    }

    return items;
  } catch (error) {
    console.error(`RSS feed failed for ${feedUrl}:`, error);
    // ✅ Return empty array instead of crashing
    return [];
  }
}