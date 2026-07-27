// apps/workers/src/email/buildWeatherAlertCardHtml.ts
//
// Renders a hazard-specific email card for severe-weather incident
// notifications, used in place of the generic title/message card by both
// sendEmailNotification.job.ts (immediate CRITICAL sends) and
// buildDigestHtml.ts (the daily digest). Reuses NWS's own headline text
// as-is for dates ("Flash Flood Warning issued July 6 at 12:46 PM EDT
// until...") rather than reformatting them ourselves — that text already
// reads as human-formatted copy, correctly localized to the alert's own
// region without us needing to know its timezone. The longer
// `description`/`instruction` fields DO get reformatted (see
// renderBodyText/dedupeSentences below): NWS "impact based warning" products
// pack multiple clauses into one single-line string using "* " bullets and
// "LABEL..." sub-clauses that were originally on separate lines — left alone,
// HTML collapses all of that whitespace into one dense run-on paragraph.
import { escapeHtml } from './buildDigestHtml';

export type WeatherCardHazardFamily = 'FLOOD' | 'STORM' | 'HURRICANE' | 'HEATWAVE' | 'SNOW' | 'WILDFIRE';

export interface WeatherCardMetadata {
  hazardFamily: string;
  nwsEvent?: string | null;
  senderName?: string | null;
  headline?: string | null;
  description?: string | null;
  instruction?: string | null;
}

const HAZARD_EMOJI: Record<string, string> = {
  FLOOD: '🌊',
  STORM: '⛈️',
  HURRICANE: '🌀',
  HEATWAVE: '🥵',
  SNOW: '❄️',
  WILDFIRE: '🔥',
};

const HAZARD_ACCENT_COLOR: Record<string, string> = {
  FLOOD: '#0369a1',
  STORM: '#b45309',
  HURRICANE: '#7c3aed',
  HEATWAVE: '#b91c1c',
  SNOW: '#0e7490',
  WILDFIRE: '#c2410c',
};

const DEFAULT_EMOJI = '⚠️';
const DEFAULT_ACCENT = '#b45309';

const MAX_BULLET_CHARS = 220;
const MAX_BULLETS = 5;

/**
 * Type guard notification builders can use to decide whether to render this
 * card or fall back to their generic one.
 */
export function isWeatherCardMetadata(value: unknown): value is WeatherCardMetadata {
  return Boolean(value) && typeof value === 'object' && typeof (value as any).hazardFamily === 'string';
}

// Cuts at the nearest ", " or ". " before maxChars rather than mid-word/
// mid-clause — a long NWS location or highway list reads fine truncated
// after a complete item, not lopped off mid-name.
function truncateAtBoundary(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  const cut = text.slice(0, maxChars);
  const boundary = Math.max(cut.lastIndexOf(', '), cut.lastIndexOf('. '));
  const clean = boundary > maxChars * 0.4 ? cut.slice(0, boundary) : cut;
  // NWS separates clauses with a literal "..." — indexOf('. ') matches at its
  // *last* period (immediately followed by a space), leaving the first two
  // dots dangling right before the ellipsis we're about to append. Strip any
  // trailing punctuation/whitespace so the cut always lands cleanly.
  return `${clean.replace(/[.,\s]+$/, '')}…`;
}

// NWS bulletins sometimes repeat the same reminder sentence (e.g. a watch
// notice) at both the start and end of the instruction text — drop exact
// repeats rather than making the reader see it twice.
function dedupeSentences(text: string): string {
  const sentences = text.split(/(?<=[.!?])\s+/);
  const seen = new Set<string>();
  const kept: string[] = [];
  for (const sentence of sentences) {
    const key = sentence.trim();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    kept.push(sentence);
  }
  return kept.join(' ');
}

// "715 PM EDT" -> "7:15 PM EDT" — NWS times in this bulletin format never
// carry their own colon.
function formatClockTime(text: string): string {
  return text.replace(/\b(\d{1,2})(\d{2})\s*(AM|PM)\b/gi, '$1:$2 $3');
}

// Pulls "LABEL...value" out of a clause, stopping at the next recognized
// label or end of string — used for the HAZARD/SOURCE/IMPACT triad that
// NWS's impact-based warning products (Severe Thunderstorm, Tornado, Flash
// Flood, Extreme Wind, Snow Squall) share as a standard convention.
function extractLabeledValue(text: string, label: string): string | null {
  const match = text.match(new RegExp(`${label}\\.\\.\\.(.*?)(?=HAZARD\\.\\.\\.|SOURCE\\.\\.\\.|IMPACT\\.\\.\\.|$)`, 'i'));
  if (!match) return null;
  const value = match[1].trim().replace(/[.\s]+$/, '');
  return value || null;
}

interface ParsedBulletin {
  expires: string | null;
  hazard: string | null;
  source: string | null;
  impact: string | null;
  narrative: string | null;
  areas: string | null;
  otherBullets: string[];
}

// NWS "impact based warning" text products separate clauses with "* "
// bullets — text that was originally multi-line in the bulletin. The CAP
// feed collapses it to a single-line string, and HTML then collapses the
// remaining whitespace too, so a naive <p> render turns clean structure into
// one dense run-on paragraph. This pulls out the pieces worth surfacing on
// their own (expiry, hazard/source/impact, affected areas) and leaves
// anything unrecognized as a generic bullet, so alert types that don't
// follow this exact convention still degrade gracefully instead of losing
// content.
function parseBulletin(rawText: string): ParsedBulletin {
  const bullets = rawText
    .split(/\s*\*\s+/)
    .map((s) => s.trim())
    .filter(Boolean);

  // The first fragment is always generic lead-in prose ("The National
  // Weather Service in X has issued a...") whenever the text actually
  // contains bullets — drop it, the card's title/source already say as much.
  const items = bullets.length > 1 ? bullets.slice(1) : bullets;

  const parsed: ParsedBulletin = {
    expires: null,
    hazard: null,
    source: null,
    impact: null,
    narrative: null,
    areas: null,
    otherBullets: [],
  };

  for (const item of items) {
    const untilMatch = item.match(/^until\s+(.+?)[.\s]*$/i);
    if (untilMatch && !parsed.expires) {
      parsed.expires = formatClockTime(untilMatch[1]);
      continue;
    }

    if (/HAZARD\.\.\.|SOURCE\.\.\.|IMPACT\.\.\./i.test(item)) {
      parsed.hazard = extractLabeledValue(item, 'HAZARD') ?? parsed.hazard;
      parsed.source = extractLabeledValue(item, 'SOURCE') ?? parsed.source;
      parsed.impact = extractLabeledValue(item, 'IMPACT') ?? parsed.impact;
      const lead = item.split(/HAZARD\.\.\.|SOURCE\.\.\.|IMPACT\.\.\./i)[0].trim().replace(/[.\s]+$/, '');
      if (lead) parsed.narrative = `${formatClockTime(lead)}.`;
      continue;
    }

    const locationsMatch = item.match(/^locations impacted include\.\.\.\s*(.*?)(?:\s*this includes the following highways\.\.\..*)?$/is);
    if (locationsMatch && !parsed.areas) {
      const value = locationsMatch[1].trim().replace(/[.\s]+$/, '');
      if (value) {
        parsed.areas = value;
        continue;
      }
    }

    parsed.otherBullets.push(item);
  }

  return parsed;
}

function renderKeyFacts(hazard: string | null, source: string | null, impact: string | null): string {
  const rows: Array<[string, string]> = [
    ['Hazard', hazard],
    ['Source', source],
    ['Impact', impact],
  ].filter((row): row is [string, string] => Boolean(row[1]));
  if (rows.length === 0) return '';

  const trs = rows
    .map(
      ([label, value]) => `
        <tr>
          <td style="padding:3px 10px 3px 0;font-size:11px;color:#898781;text-transform:uppercase;letter-spacing:0.03em;vertical-align:top;white-space:nowrap;">${label}</td>
          <td style="padding:3px 0;font-size:13px;color:#333;">${escapeHtml(value)}</td>
        </tr>`,
    )
    .join('');
  return `<table cellpadding="0" cellspacing="0" style="width:100%;margin:6px 0 10px;">${trs}</table>`;
}

function renderOtherBullets(items: string[]): string {
  const shown = items.slice(0, MAX_BULLETS);
  const rest = items.length - shown.length;

  const listHtml = shown
    .map((item) => {
      const truncated = truncateAtBoundary(item, MAX_BULLET_CHARS);
      const safe = escapeHtml(truncated).replace(
        /(^|[.!?]\s+)([A-Z][A-Z ]{2,20}?)\.\.\./g,
        (_m, lead, label) => `${lead}<br/><strong>${label}:</strong> `,
      );
      return `<li style="margin-bottom:6px;">${safe}</li>`;
    })
    .join('');

  const restLine =
    rest > 0
      ? `<p style="margin:6px 0 0;font-size:12px;color:#999;">+${rest} more detail${rest === 1 ? '' : 's'} in the full alert.</p>`
      : '';

  return `<ul style="margin:0 0 10px;padding-left:18px;font-size:14px;color:#333;">${listHtml}</ul>${restLine}`;
}

function renderParsedBulletin(parsed: ParsedBulletin): string {
  const parts = [
    parsed.narrative ? `<p style="margin:0 0 8px;font-size:14px;color:#333;">${escapeHtml(parsed.narrative)}</p>` : '',
    renderKeyFacts(parsed.hazard, parsed.source, parsed.impact),
    parsed.areas
      ? `<p style="margin:0 0 10px;font-size:13px;color:#333;"><strong style="color:#898781;font-size:11px;text-transform:uppercase;letter-spacing:0.03em;">Affected areas&nbsp;</strong>${escapeHtml(truncateAtBoundary(parsed.areas, 180))}</p>`
      : '',
    parsed.otherBullets.length > 0 ? renderOtherBullets(parsed.otherBullets) : '',
  ];
  return parts.filter(Boolean).join('');
}

function isBulletinFormat(rawText: string): boolean {
  return /\*\s+\S/.test(rawText);
}

/**
 * Returns a self-contained <table> card (no outer <tr>/<li> wrapper) — the
 * caller wraps it in whatever list structure its own email uses (a <tr><td>
 * row for the immediate-send job, an <li> for the digest).
 */
export function buildWeatherAlertCardHtml(args: {
  title: string;
  actionUrl: string | null;
  weather: WeatherCardMetadata;
}): string {
  const { title, actionUrl, weather } = args;
  const emoji = HAZARD_EMOJI[weather.hazardFamily] ?? DEFAULT_EMOJI;
  const accent = HAZARD_ACCENT_COLOR[weather.hazardFamily] ?? DEFAULT_ACCENT;

  const safeTitle = escapeHtml(title);
  const safeSender = weather.senderName ? escapeHtml(weather.senderName) : null;
  // Prefer the fuller description; headline is often a shorter duplicate of it.
  const bodyText = weather.description || weather.headline || null;
  const parsedBulletin = bodyText && isBulletinFormat(bodyText) ? parseBulletin(bodyText) : null;
  const expires = parsedBulletin?.expires ?? null;
  const bodyHtml = parsedBulletin
    ? renderParsedBulletin(parsedBulletin)
    : bodyText
      ? `<p style="margin:0 0 10px;font-size:14px;color:#333;">${escapeHtml(bodyText)}</p>`
      : null;
  const safeInstruction = weather.instruction ? escapeHtml(dedupeSentences(weather.instruction)) : null;
  const safeUrl = actionUrl ? escapeHtml(actionUrl) : '';
  const expiresChip = expires
    ? `<span style="display:inline-block;margin-left:8px;padding:2px 8px;border-radius:10px;background:#fdecea;color:#c62828;font-size:11px;font-weight:bold;white-space:nowrap;vertical-align:middle;">Until ${escapeHtml(expires)}</span>`
    : '';

  return `
    <table width="100%" style="border:1px solid #e5e7eb;border-left:4px solid ${accent};border-radius:6px;">
      <tr>
        <td style="padding:14px;">
          <h3 style="margin:0 0 4px;font-size:16px;color:#111;">
            <span style="font-size:18px;">${emoji}</span> ${safeTitle}${expiresChip}
          </h3>
          ${
            safeSender
              ? `<p style="margin:0 0 10px;font-size:12px;color:#777;text-transform:uppercase;letter-spacing:0.03em;">Source: ${safeSender}</p>`
              : ''
          }
          ${bodyHtml ?? ''}
          ${
            safeInstruction
              ? `<p style="margin:0 0 10px;font-size:13px;color:#555;font-style:italic;">${safeInstruction}</p>`
              : ''
          }
          ${
            actionUrl
              ? `<a href="${safeUrl}"
                   style="display:inline-block;margin-top:4px;font-size:14px;color:#fff;background-color:${accent};padding:8px 14px;border-radius:5px;text-decoration:none;">
                  Review incident &rarr;
                </a>`
              : ''
          }
        </td>
      </tr>
    </table>
  `;
}
