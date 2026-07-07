// apps/workers/src/email/buildWeatherAlertCardHtml.ts
//
// Renders a hazard-specific email card for severe-weather incident
// notifications, used in place of the generic title/message card by both
// sendEmailNotification.job.ts (immediate CRITICAL sends) and
// buildDigestHtml.ts (the daily digest). Deliberately reuses NWS's own
// headline/description/instruction text rather than reformatting dates
// ourselves — that text already reads as human-formatted "issued at X until
// Y" copy (e.g. "Flash Flood Warning issued July 6 at 12:46 PM EDT until..."),
// correctly localized to the alert's own region without us needing to know
// its timezone.
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

/**
 * Type guard notification builders can use to decide whether to render this
 * card or fall back to their generic one.
 */
export function isWeatherCardMetadata(value: unknown): value is WeatherCardMetadata {
  return Boolean(value) && typeof value === 'object' && typeof (value as any).hazardFamily === 'string';
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
  const safeBody = bodyText ? escapeHtml(bodyText) : null;
  const safeInstruction = weather.instruction ? escapeHtml(weather.instruction) : null;
  const safeUrl = actionUrl ? escapeHtml(actionUrl) : '';

  return `
    <table width="100%" style="border:1px solid #e5e7eb;border-left:4px solid ${accent};border-radius:6px;">
      <tr>
        <td style="padding:14px;">
          <h3 style="margin:0 0 4px;font-size:16px;color:#111;">
            <span style="font-size:18px;">${emoji}</span> ${safeTitle}
          </h3>
          ${
            safeSender
              ? `<p style="margin:0 0 10px;font-size:12px;color:#777;text-transform:uppercase;letter-spacing:0.03em;">Source: ${safeSender}</p>`
              : ''
          }
          ${
            safeBody
              ? `<p style="margin:0 0 10px;font-size:14px;color:#333;">${safeBody}</p>`
              : ''
          }
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
